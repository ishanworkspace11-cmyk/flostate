import { prisma } from '../database/prisma.js';
import { isDatabaseAvailable } from '../database/db-status.js';
import { logger } from '../config/logger.js';

export interface AuditLogEntry {
  id?: string;
  action: string;
  entityType: string;
  entityId: string;
  actor?: string;
  details?: Record<string, any>;
  ipAddress?: string;
  createdAt?: string;
}

export class AuditRepository {
  private memoryLogs: AuditLogEntry[] = [];

  private static async checkDb(): Promise<boolean> {
    return isDatabaseAvailable();
  }

  async log(entry: AuditLogEntry): Promise<void> {
    const hasDb = await AuditRepository.checkDb();
    if (hasDb) {
      try {
        await prisma.auditLog.create({
          data: {
            action: entry.action,
            entityType: entry.entityType,
            entityId: entry.entityId,
            actor: entry.actor || 'system',
            details: entry.details,
            ipAddress: entry.ipAddress,
          },
        });
        return;
      } catch (err) {
        logger.error({ err }, 'Error writing audit log in DB');
      }
    }
    this.memoryLogs.unshift({
      ...entry,
      id: `audit_${Date.now()}`,
      createdAt: new Date().toISOString(),
    });
  }

  async list(filters?: { entityType?: string; entityId?: string; limit?: number }): Promise<AuditLogEntry[]> {
    const hasDb = await AuditRepository.checkDb();
    if (hasDb) {
      try {
        const where: any = {};
        if (filters?.entityType) where.entityType = filters.entityType;
        if (filters?.entityId) where.entityId = filters.entityId;

        const records = await prisma.auditLog.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          take: filters?.limit || 50,
        });

        return records.map((r) => ({
          id: r.id,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          actor: r.actor,
          details: r.details as any,
          ipAddress: r.ipAddress || undefined,
          createdAt: r.createdAt.toISOString(),
        }));
      } catch (err) {
        logger.error({ err }, 'Error querying audit logs in DB');
      }
    }

    let logs = this.memoryLogs;
    if (filters?.entityType) logs = logs.filter((l) => l.entityType === filters.entityType);
    if (filters?.entityId) logs = logs.filter((l) => l.entityId === filters.entityId);
    return logs.slice(0, filters?.limit || 50);
  }
}

export const auditRepository = new AuditRepository();
