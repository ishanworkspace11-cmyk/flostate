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

        return records.map((r) => ({
          id: r.id,
          workflowId: r.workflowId,
          workflowName: r.workflow.name,
          name: r.name,
          kind: r.kind.toLowerCase() as any,
          enabled: r.enabled,
          cronExpression: r.cronExpression || undefined,
          webhookPath: r.webhookPath || undefined,
          webhookSecret: r.webhookSecret || undefined,
          lastTriggeredAt: r.lastTriggeredAt?.toISOString() || null,
          totalTriggers: r.totalTriggers,
          createdAt: r.createdAt.toISOString(),
          isBackendConnected: true,
        }));
      } catch (err) {
        logger.error({ err }, 'Error listing triggers from DB, falling back');
      }
    }

    let list = await store.listTriggers();
    if (filters?.workflowId) list = list.filter((t) => t.workflowId === filters.workflowId);
    if (filters?.kind) list = list.filter((t) => t.kind === filters.kind);
    return list;
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
          return {
            id: r.id,
            workflowId: r.workflowId,
            workflowName: r.workflow.name,
            name: r.name,
            kind: r.kind.toLowerCase() as any,
            enabled: r.enabled,
            cronExpression: r.cronExpression || undefined,
            webhookPath: r.webhookPath || undefined,
            webhookSecret: r.webhookSecret || undefined,
            lastTriggeredAt: r.lastTriggeredAt?.toISOString() || null,
            totalTriggers: r.totalTriggers,
            createdAt: r.createdAt.toISOString(),
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
    kind: 'webhook' | 'cron' | 'manual';
    enabled?: boolean;
    cronExpression?: string;
    webhookPath?: string;
    webhookSecret?: string;
    config?: Record<string, any>;
  }): Promise<WorkflowTrigger> {
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
            config: data.config,
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
          webhookPath: r.webhookPath || undefined,
          webhookSecret: r.webhookSecret || undefined,
          lastTriggeredAt: r.lastTriggeredAt?.toISOString() || null,
          totalTriggers: r.totalTriggers,
          createdAt: r.createdAt.toISOString(),
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
      kind: data.kind as any,
      enabled: data.enabled ?? true,
      cronExpression: data.cronExpression,
      webhookPath: data.webhookPath,
      webhookSecret: data.webhookSecret,
      lastTriggeredAt: null,
      totalTriggers: 0,
      createdAt: new Date().toISOString(),
      isBackendConnected: true,
    };
    return store.saveTrigger(newTrigger);
  }

  async recordTriggerFire(id: string): Promise<void> {
    const hasDb = await TriggerRepository.checkDb();
    if (hasDb) {
      try {
        await prisma.trigger.update({
          where: { id },
          data: {
            lastTriggeredAt: new Date(),
            totalTriggers: { increment: 1 },
          },
        });
        return;
      } catch (err) {
        logger.error({ err }, 'Error recording trigger fire in DB');
      }
    }
  }
}

export const triggerRepository = new TriggerRepository();
