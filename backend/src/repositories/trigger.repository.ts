import { prisma } from '../database/prisma.js';
import { isDatabaseAvailable } from '../database/db-status.js';
import { WorkflowTrigger } from '../models/trigger.types.js';
import { store } from '../services/store.service.js';
import { logger } from '../config/logger.js';
import { TriggerKind as PrismaTriggerKind } from '@prisma/client';

export class TriggerRepository {
  private static async checkDb(): Promise<boolean> {
    return isDatabaseAvailable();
  }

  async list(filters?: { workflowId?: string; kind?: string }): Promise<WorkflowTrigger[]> {
    const hasDb = await TriggerRepository.checkDb();
    if (hasDb) {
      try {
        const where: any = {};
        if (filters?.workflowId) where.workflowId = filters.workflowId;
        if (filters?.kind) where.kind = filters.kind.toUpperCase() as PrismaTriggerKind;

        const records = await prisma.trigger.findMany({
          where,
          include: { workflow: true },
          orderBy: { createdAt: 'desc' },
        });

        return records.map((r) => {
          const cfg = (r.config as any) || {};
          return {
            id: r.id,
            workflowId: r.workflowId,
            workflowName: r.workflow.name,
            name: r.name,
            kind: r.kind.toLowerCase() as any,
            enabled: r.enabled,
            cronExpression: r.cronExpression || undefined,
            timezone: cfg.timezone || 'UTC',
            nextRunAt: cfg.nextRunAt || null,
            webhookPath: r.webhookPath || undefined,
            webhookSecret: r.webhookSecret || undefined,
            allowedMethods: cfg.allowedMethods || ['POST'],
            lastTriggeredAt: r.lastTriggeredAt?.toISOString() || null,
            totalTriggers: r.totalTriggers,
            lastDeliveryStatus: cfg.lastDeliveryStatus || null,
            lastDeliveryError: cfg.lastDeliveryError || null,
            config: cfg,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            isBackendConnected: true,
          };
        });
      } catch (err) {
        logger.error({ err }, 'Error listing triggers from DB, falling back');
      }
    }

    let list = await store.listTriggers();
    if (filters?.workflowId) list = list.filter((t) => t.workflowId === filters.workflowId);
    if (filters?.kind) list = list.filter((t) => t.kind === filters.kind);
    return list;
  }

  async findById(id: string): Promise<WorkflowTrigger | null> {
    const hasDb = await TriggerRepository.checkDb();
    if (hasDb) {
      try {
        const r = await prisma.trigger.findUnique({
          where: { id },
          include: { workflow: true },
        });

        if (r) {
          const cfg = (r.config as any) || {};
          return {
            id: r.id,
            workflowId: r.workflowId,
            workflowName: r.workflow.name,
            name: r.name,
            kind: r.kind.toLowerCase() as any,
            enabled: r.enabled,
            cronExpression: r.cronExpression || undefined,
            timezone: cfg.timezone || 'UTC',
            nextRunAt: cfg.nextRunAt || null,
            webhookPath: r.webhookPath || undefined,
            webhookSecret: r.webhookSecret || undefined,
            allowedMethods: cfg.allowedMethods || ['POST'],
            lastTriggeredAt: r.lastTriggeredAt?.toISOString() || null,
            totalTriggers: r.totalTriggers,
            lastDeliveryStatus: cfg.lastDeliveryStatus || null,
            lastDeliveryError: cfg.lastDeliveryError || null,
            config: cfg,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            isBackendConnected: true,
          };
        }
      } catch (err) {
        logger.error({ err }, 'Error finding trigger by ID in DB, falling back');
      }
    }
    return store.getTrigger(id);
  }

  async findByWebhookPath(path: string): Promise<WorkflowTrigger | null> {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    const hasDb = await TriggerRepository.checkDb();
    if (hasDb) {
      try {
        const r = await prisma.trigger.findFirst({
          where: {
            OR: [
              { webhookPath: cleanPath },
              { webhookPath: `/api/v1/webhooks${cleanPath}` },
              { webhookPath: `/webhooks${cleanPath}` },
            ],
          },
          include: { workflow: true },
        });

        if (r) {
          const cfg = (r.config as any) || {};
          return {
            id: r.id,
            workflowId: r.workflowId,
            workflowName: r.workflow.name,
            name: r.name,
            kind: r.kind.toLowerCase() as any,
            enabled: r.enabled,
            cronExpression: r.cronExpression || undefined,
            timezone: cfg.timezone || 'UTC',
            nextRunAt: cfg.nextRunAt || null,
            webhookPath: r.webhookPath || undefined,
            webhookSecret: r.webhookSecret || undefined,
            allowedMethods: cfg.allowedMethods || ['POST'],
            lastTriggeredAt: r.lastTriggeredAt?.toISOString() || null,
            totalTriggers: r.totalTriggers,
            lastDeliveryStatus: cfg.lastDeliveryStatus || null,
            lastDeliveryError: cfg.lastDeliveryError || null,
            config: cfg,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            isBackendConnected: true,
          };
        }
      } catch (err) {
        logger.error({ err }, 'Error finding trigger by webhook path in DB, falling back');
      }
    }
    return store.getTriggerByPath(cleanPath);
  }

  async create(data: {
    workflowId: string;
    workflowName: string;
    name: string;
    kind: 'webhook' | 'cron';
    enabled?: boolean;
    cronExpression?: string;
    timezone?: string;
    nextRunAt?: string | null;
    webhookPath?: string;
    webhookSecret?: string;
    allowedMethods?: string[];
    config?: Record<string, any>;
  }): Promise<WorkflowTrigger> {
    const configData = {
      ...(data.config || {}),
      timezone: data.timezone || 'UTC',
      nextRunAt: data.nextRunAt || null,
      allowedMethods: data.allowedMethods || ['POST'],
    };

    const hasDb = await TriggerRepository.checkDb();
    if (hasDb) {
      try {
        const r = await prisma.trigger.create({
          data: {
            workflowId: data.workflowId,
            name: data.name,
            kind: data.kind.toUpperCase() as PrismaTriggerKind,
            enabled: data.enabled ?? true,
            cronExpression: data.cronExpression,
            webhookPath: data.webhookPath,
            webhookSecret: data.webhookSecret,
            config: configData,
          },
          include: { workflow: true },
        });

        return {
          id: r.id,
          workflowId: r.workflowId,
          workflowName: r.workflow.name,
          name: r.name,
          kind: r.kind.toLowerCase() as any,
          enabled: r.enabled,
          cronExpression: r.cronExpression || undefined,
          timezone: configData.timezone,
          nextRunAt: configData.nextRunAt,
          webhookPath: r.webhookPath || undefined,
          webhookSecret: r.webhookSecret || undefined,
          allowedMethods: configData.allowedMethods,
          lastTriggeredAt: r.lastTriggeredAt?.toISOString() || null,
          totalTriggers: r.totalTriggers,
          config: configData,
          createdAt: r.createdAt.toISOString(),
          updatedAt: r.updatedAt.toISOString(),
          isBackendConnected: true,
        };
      } catch (err) {
        logger.error({ err }, 'Error creating trigger in DB, falling back');
      }
    }

    const newTrigger: WorkflowTrigger = {
      id: `trig_${Date.now()}`,
      workflowId: data.workflowId,
      workflowName: data.workflowName,
      name: data.name,
      kind: data.kind,
      enabled: data.enabled ?? true,
      cronExpression: data.cronExpression,
      timezone: data.timezone || 'UTC',
      nextRunAt: data.nextRunAt || null,
      webhookPath: data.webhookPath,
      webhookSecret: data.webhookSecret,
      allowedMethods: data.allowedMethods || ['POST'],
      lastTriggeredAt: null,
      totalTriggers: 0,
      config: configData,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      isBackendConnected: true,
    };
    return store.saveTrigger(newTrigger);
  }

  async update(id: string, updates: Partial<WorkflowTrigger>): Promise<WorkflowTrigger | null> {
    const hasDb = await TriggerRepository.checkDb();
    if (hasDb) {
      try {
        const existing = await prisma.trigger.findUnique({ where: { id } });
        if (existing) {
          const prevConfig = (existing.config as any) || {};
          const newConfig = {
            ...prevConfig,
            ...(updates.config || {}),
            timezone: updates.timezone !== undefined ? updates.timezone : prevConfig.timezone,
            nextRunAt: updates.nextRunAt !== undefined ? updates.nextRunAt : prevConfig.nextRunAt,
            allowedMethods: updates.allowedMethods !== undefined ? updates.allowedMethods : prevConfig.allowedMethods,
            lastDeliveryStatus: updates.lastDeliveryStatus !== undefined ? updates.lastDeliveryStatus : prevConfig.lastDeliveryStatus,
            lastDeliveryError: updates.lastDeliveryError !== undefined ? updates.lastDeliveryError : prevConfig.lastDeliveryError,
          };

          const r = await prisma.trigger.update({
            where: { id },
            data: {
              name: updates.name,
              enabled: updates.enabled,
              cronExpression: updates.cronExpression,
              webhookPath: updates.webhookPath,
              webhookSecret: updates.webhookSecret,
              config: newConfig,
            },
            include: { workflow: true },
          });

          return {
            id: r.id,
            workflowId: r.workflowId,
            workflowName: r.workflow.name,
            name: r.name,
            kind: r.kind.toLowerCase() as any,
            enabled: r.enabled,
            cronExpression: r.cronExpression || undefined,
            timezone: newConfig.timezone,
            nextRunAt: newConfig.nextRunAt,
            webhookPath: r.webhookPath || undefined,
            webhookSecret: r.webhookSecret || undefined,
            allowedMethods: newConfig.allowedMethods,
            lastTriggeredAt: r.lastTriggeredAt?.toISOString() || null,
            totalTriggers: r.totalTriggers,
            lastDeliveryStatus: newConfig.lastDeliveryStatus,
            lastDeliveryError: newConfig.lastDeliveryError,
            config: newConfig,
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
            isBackendConnected: true,
          };
        }
      } catch (err) {
        logger.error({ err }, 'Error updating trigger in DB, falling back');
      }
    }
    return store.updateTrigger(id, updates);
  }

  async delete(id: string): Promise<boolean> {
    const hasDb = await TriggerRepository.checkDb();
    if (hasDb) {
      try {
        await prisma.trigger.delete({ where: { id } });
        return true;
      } catch (err) {
        logger.error({ err }, 'Error deleting trigger in DB, falling back');
      }
    }
    return store.deleteTrigger(id);
  }

  async recordTriggerFire(id: string, outcome: 'success' | 'failed' = 'success', errorMsg?: string): Promise<void> {
    const hasDb = await TriggerRepository.checkDb();
    if (hasDb) {
      try {
        const trigger = await prisma.trigger.findUnique({ where: { id } });
        const cfg = (trigger?.config as any) || {};
        cfg.lastDeliveryStatus = outcome;
        cfg.lastDeliveryError = errorMsg || null;

        await prisma.trigger.update({
          where: { id },
          data: {
            lastTriggeredAt: new Date(),
            totalTriggers: { increment: 1 },
            config: cfg,
          },
        });
        return;
      } catch (err) {
        logger.error({ err }, 'Error recording trigger fire in DB');
      }
    }

    const trigger = await store.getTrigger(id);
    if (trigger) {
      await store.updateTrigger(id, {
        lastTriggeredAt: new Date().toISOString(),
        totalTriggers: trigger.totalTriggers + 1,
        lastDeliveryStatus: outcome,
        lastDeliveryError: errorMsg || null,
      });
    }
  }
}

export const triggerRepository = new TriggerRepository();
