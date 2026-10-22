import { triggerRepository } from '../repositories/trigger.repository.js';
import { workflowRepository } from '../repositories/workflow.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { durableDagOrchestrator } from '../engine/durable-dag.orchestrator.js';
import { cronScheduler, validateCronExpression, calculateNextRun, isValidTimezone } from '../scheduler/cron-scheduler.js';
import { webhookIngressService, WebhookIngressService } from './webhook-ingress.service.js';
import { WorkflowTrigger, TriggerDeliveryRecord } from '../models/trigger.types.js';
import { createError } from '../middleware/error.middleware.js';
import { logger } from '../config/logger.js';

export class TriggerService {
  /**
   * Masks sensitive webhook secrets from public trigger representations
   */
  public maskTrigger(trigger: WorkflowTrigger): WorkflowTrigger {
    const hasSecret = Boolean(trigger.webhookSecret);
    return {
      ...trigger,
      hasSecret,
      webhookSecret: undefined,
      maskedSecret: hasSecret ? 'whsec_••••••••' : undefined,
    };
  }

  async listTriggers(filters?: { workflowId?: string; kind?: string }): Promise<WorkflowTrigger[]> {
    const triggers = await triggerRepository.list(filters);
    return triggers.map((t) => this.maskTrigger(t));
  }

  async getTriggerById(id: string): Promise<WorkflowTrigger> {
    const trigger = await triggerRepository.findById(id);
    if (!trigger) {
      throw createError(404, `Trigger with ID '${id}' not found`, 'TRIGGER_NOT_FOUND');
    }
    return this.maskTrigger(trigger);
  }

  async createTrigger(data: {
    workflowId: string;
    name: string;
    kind: 'webhook' | 'cron';
    enabled?: boolean;
    cronExpression?: string;
    timezone?: string;
    webhookPath?: string;
    webhookSecret?: string;
    generateSecret?: boolean;
    allowedMethods?: string[];
    config?: Record<string, any>;
  }): Promise<WorkflowTrigger> {
    const wf = await workflowRepository.findById(data.workflowId);
    if (!wf) {
      throw createError(404, `Workflow with ID '${data.workflowId}' not found`, 'WORKFLOW_NOT_FOUND');
    }

    let rawSecret: string | undefined = undefined;
    let webhookPath = data.webhookPath;
    let nextRunAt: string | null = null;
    const timezone = data.timezone && isValidTimezone(data.timezone) ? data.timezone : 'UTC';

    if (data.kind === 'webhook') {
      // 1. Assign unguessable webhook path if not provided
      if (!webhookPath || webhookPath.trim() === '') {
        webhookPath = `/api/v1/webhooks/${WebhookIngressService.generateWebhookSlug()}`;
      } else {
        webhookPath = webhookPath.startsWith('/') ? webhookPath : `/${webhookPath}`;
        if (!webhookPath.startsWith('/api/v1/webhooks') && !webhookPath.startsWith('/webhooks')) {
          webhookPath = `/api/v1/webhooks${webhookPath}`;
        }
      }

      // Check path collision
      const existing = await triggerRepository.findByWebhookPath(webhookPath);
      if (existing) {
        throw createError(
          409,
          `Webhook path '${webhookPath}' is already registered to trigger "${existing.name}"`,
          'CONFLICT_WEBHOOK_PATH'
        );
      }

      // Generate or set signing secret
      if (data.generateSecret || data.webhookSecret) {
        rawSecret = data.webhookSecret?.trim() || WebhookIngressService.generateSigningSecret();
      }
    } else if (data.kind === 'cron') {
      if (!data.cronExpression) {
        throw createError(400, 'Cron expression is required for scheduled triggers', 'INVALID_CRON_EXPRESSION');
      }

      const cronValidation = validateCronExpression(data.cronExpression);
      if (!cronValidation.isValid) {
        throw createError(
          400,
          `Invalid cron expression "${data.cronExpression}": ${cronValidation.error}`,
          'INVALID_CRON_EXPRESSION'
        );
      }

      if (data.timezone && !isValidTimezone(data.timezone)) {
        throw createError(
          400,
          `Invalid IANA timezone "${data.timezone}". Examples: 'UTC', 'America/New_York', 'Asia/Kolkata'`,
          'INVALID_TIMEZONE'
        );
      }

      nextRunAt = calculateNextRun(data.cronExpression, timezone).toISOString();
    }

    const created = await triggerRepository.create({
      workflowId: data.workflowId,
      workflowName: wf.name,
      name: data.name,
      kind: data.kind,
      enabled: data.enabled ?? true,
      cronExpression: data.cronExpression,
      timezone,
      nextRunAt,
      webhookPath,
      webhookSecret: rawSecret,
      allowedMethods: data.allowedMethods || ['POST'],
      config: data.config,
    });

    // Schedule cron if enabled
    if (created.kind === 'cron' && created.enabled) {
      cronScheduler.schedule(created);
    }

    await auditRepository.log({
      action: 'TRIGGER_CREATED',
      entityType: 'TRIGGER',
      entityId: created.id,
      details: { name: created.name, kind: created.kind, workflowId: data.workflowId },
    });

    const masked = this.maskTrigger(created);
    // Display secret only once upon creation
    if (rawSecret) {
      masked.signingSecret = rawSecret;
    }
    return masked;
  }

  async updateTrigger(
    id: string,
    updates: {
      name?: string;
      enabled?: boolean;
      cronExpression?: string;
      timezone?: string;
      webhookPath?: string;
      webhookSecret?: string;
      allowedMethods?: string[];
      config?: Record<string, any>;
    }
  ): Promise<WorkflowTrigger> {
    const existing = await triggerRepository.findById(id);
    if (!existing) {
      throw createError(404, `Trigger with ID '${id}' not found`, 'TRIGGER_NOT_FOUND');
    }

    let nextRunAt: string | null | undefined = undefined;
    const timezone = updates.timezone || existing.timezone || 'UTC';

    if (existing.kind === 'cron' || updates.cronExpression) {
      const cronExpr = updates.cronExpression || existing.cronExpression;
      if (cronExpr) {
        const cronValidation = validateCronExpression(cronExpr);
        if (!cronValidation.isValid) {
          throw createError(
            400,
            `Invalid cron expression "${cronExpr}": ${cronValidation.error}`,
            'INVALID_CRON_EXPRESSION'
          );
        }

        if (updates.timezone && !isValidTimezone(updates.timezone)) {
          throw createError(
            400,
            `Invalid IANA timezone "${updates.timezone}". Examples: 'UTC', 'America/New_York'`,
            'INVALID_TIMEZONE'
          );
        }

        nextRunAt = calculateNextRun(cronExpr, timezone).toISOString();
      }
    }

    if (updates.webhookPath) {
      let cleanPath = updates.webhookPath.startsWith('/') ? updates.webhookPath : `/${updates.webhookPath}`;
      if (!cleanPath.startsWith('/api/v1/webhooks') && !cleanPath.startsWith('/webhooks')) {
        cleanPath = `/api/v1/webhooks${cleanPath}`;
      }
      updates.webhookPath = cleanPath;
    }

    const updated = await triggerRepository.update(id, {
      ...updates,
      timezone,
      nextRunAt,
    });

    if (!updated) {
      throw createError(500, 'Failed to update trigger', 'TRIGGER_UPDATE_FAILED');
    }

    // Reschedule or cancel cron depending on enabled status
    if (updated.kind === 'cron') {
      if (updated.enabled) {
        cronScheduler.schedule(updated);
      } else {
        cronScheduler.cancel(updated.id);
      }
    }

    await auditRepository.log({
      action: 'TRIGGER_UPDATED',
      entityType: 'TRIGGER',
      entityId: id,
      details: { updates },
    });

    return this.maskTrigger(updated);
  }

  async toggleTrigger(id: string, enabled: boolean): Promise<WorkflowTrigger> {
    return this.updateTrigger(id, { enabled });
  }

  async deleteTrigger(id: string): Promise<{ success: boolean; message: string }> {
    const existing = await triggerRepository.findById(id);
    if (!existing) {
      throw createError(404, `Trigger with ID '${id}' not found`, 'TRIGGER_NOT_FOUND');
    }

    if (existing.kind === 'cron') {
      cronScheduler.cancel(id);
    }

    await triggerRepository.delete(id);

    await auditRepository.log({
      action: 'TRIGGER_DELETED',
      entityType: 'TRIGGER',
      entityId: id,
      details: { name: existing.name, kind: existing.kind },
    });

    return {
      success: true,
      message: `Trigger "${existing.name}" successfully deleted`,
    };
  }

  async getDeliveryHistory(triggerId: string, limit = 50): Promise<TriggerDeliveryRecord[]> {
    const trigger = await triggerRepository.findById(triggerId);
    if (!trigger) {
      throw createError(404, `Trigger with ID '${triggerId}' not found`, 'TRIGGER_NOT_FOUND');
    }
    return webhookIngressService.getDeliveries(triggerId, limit);
  }

  /**
   * Initializes the cron scheduler on backend startup, wiring callbacks and synchronizing schedules
   */
  public async initScheduler(): Promise<void> {
    cronScheduler.setHandler(async (trigger: WorkflowTrigger) => {
      logger.info(
        { triggerId: trigger.id, workflowId: trigger.workflowId, name: trigger.name },
        '[TriggerService] Scheduled cron trigger fired, creating execution'
      );

      try {
        const execution = await durableDagOrchestrator.createRun(trigger.workflowId, {
          triggerType: 'cron',
          input: {
            triggerId: trigger.id,
            triggerName: trigger.name,
            cronExpression: trigger.cronExpression,
            timezone: trigger.timezone,
            scheduledTime: new Date().toISOString(),
          },
        });

        await triggerRepository.recordTriggerFire(trigger.id, 'success');
        logger.info(
          { triggerId: trigger.id, executionId: execution.id },
          '[TriggerService] Cron run successfully scheduled and enqueued'
        );
      } catch (err: any) {
        await triggerRepository.recordTriggerFire(trigger.id, 'failed', err.message);
        logger.error(
          { err, triggerId: trigger.id, workflowId: trigger.workflowId },
          '[TriggerService] Failed to create execution for scheduled cron trigger'
        );
      }
    });

    // Schedule all active cron triggers
    try {
      const allTriggers = await triggerRepository.list({ kind: 'cron' });
      const enabledCronTriggers = allTriggers.filter((t) => t.enabled);
      for (const t of enabledCronTriggers) {
        cronScheduler.schedule(t);
      }
      logger.info(
        { count: enabledCronTriggers.length },
        '[TriggerService] Synchronized active scheduled cron triggers on startup'
      );
    } catch (err) {
      logger.error({ err }, '[TriggerService] Error synchronizing schedules on startup');
    }
  }
}

export const triggerService = new TriggerService();
