import { triggerRepository } from '../repositories/trigger.repository.js';
import { workflowRepository } from '../repositories/workflow.repository.js';
import { executionService } from './execution.service.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { WorkflowTrigger } from '../models/trigger.types.js';
import { createError } from '../middleware/error.middleware.js';

export class TriggerService {
  async listTriggers(filters?: { workflowId?: string; kind?: string }): Promise<WorkflowTrigger[]> {
    return triggerRepository.list(filters);
  }

  async createTrigger(data: {
    workflowId: string;
    name: string;
    kind: 'webhook' | 'cron' | 'manual';
    enabled?: boolean;
    cronExpression?: string;
    webhookPath?: string;
    webhookSecret?: string;
    config?: Record<string, any>;
  }): Promise<WorkflowTrigger> {
    const wf = await workflowRepository.findById(data.workflowId);
    if (!wf) {
      throw createError(404, `Workflow with ID '${data.workflowId}' not found`, 'WORKFLOW_NOT_FOUND');
    }

    const created = await triggerRepository.create({
      ...data,
      workflowName: wf.name,
    });

    await auditRepository.log({
      action: 'TRIGGER_CREATED',
      entityType: 'TRIGGER',
      entityId: created.id,
      details: { name: created.name, kind: created.kind, workflowId: data.workflowId },
    });

    return created;
  }

  async handleWebhookIngress(path: string, payload: Record<string, unknown>, headers?: Record<string, any>) {
    const trigger = await triggerRepository.findByWebhookPath(path);
    if (!trigger) {
      throw createError(404, `No trigger registered for webhook path '${path}'`, 'TRIGGER_NOT_FOUND');
    }

    if (!trigger.enabled) {
      throw createError(403, `Trigger '${trigger.name}' is currently disabled`, 'TRIGGER_DISABLED');
    }

    // Optional secret verification if configured
    if (trigger.webhookSecret) {
      const authHeader = headers?.['x-webhook-secret'] || headers?.['authorization'];
      if (!authHeader || (authHeader !== trigger.webhookSecret && authHeader !== `Bearer ${trigger.webhookSecret}`)) {
        throw createError(401, 'Unauthorized: Invalid or missing webhook secret token', 'WEBHOOK_UNAUTHORIZED');
      }
    }

    // Record trigger fire
    await triggerRepository.recordTriggerFire(trigger.id);

    // Trigger workflow run
    const execution = await executionService.triggerExecution(trigger.workflowId, {
      input: payload,
      triggerType: 'webhook',
    });

    return {
      triggerId: trigger.id,
      workflowId: trigger.workflowId,
      executionId: execution.id,
      status: execution.status,
      startedAt: execution.startedAt,
    };
  }
}

export const triggerService = new TriggerService();
