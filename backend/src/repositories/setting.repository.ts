import { prisma } from '../database/prisma.js';
import { isDatabaseAvailable } from '../database/db-status.js';
import { logger } from '../config/logger.js';

export interface ApplicationSettingRecord {
  id: string;
  key: string;
  value: any;
  category: string;
  description?: string;
  updatedAt: string;
}

export class SettingRepository {
  private memorySettings: Map<string, ApplicationSettingRecord> = new Map([
    [
      'concurrency_limit',
      {
        id: 'set-1',
        key: 'concurrency_limit',
        value: { maxConcurrentWorkflows: 20, maxConcurrentTasksPerWorker: 5 },
        category: 'execution',
        description: 'Maximum concurrency thresholds for distributed execution engine.',
        updatedAt: new Date().toISOString(),
      },
    ],
    [
      'retry_backoff_policy',
      {
        id: 'set-2',
        key: 'retry_backoff_policy',
        value: { defaultMaxAttempts: 3, backoffType: 'exponential', initialDelayMs: 1000 },
        category: 'resilience',
        description: 'Default retry and backoff policy applied to failed task nodes.',
        updatedAt: new Date().toISOString(),
      },
    ],
  ]);

  private static async checkDb(): Promise<boolean> {
    return isDatabaseAvailable();
  }

  async getAll(): Promise<ApplicationSettingRecord[]> {
    const hasDb = await SettingRepository.checkDb();
    if (hasDb) {
      try {
        const records = await prisma.applicationSetting.findMany({
          orderBy: { category: 'asc' },
        });
        if (records.length > 0) {
          return records.map((r) => ({
            id: r.id,
            key: r.key,
            value: r.value,
            category: r.category,
            description: r.description || undefined,
            updatedAt: r.updatedAt.toISOString(),
          }));
        }
      } catch (err) {
        logger.error({ err }, 'Error querying settings from DB, falling back');
      }
    }
    return Array.from(this.memorySettings.values());
  }

  async getByKey(key: string): Promise<ApplicationSettingRecord | null> {
    const hasDb = await SettingRepository.checkDb();
    if (hasDb) {
      try {
        const r = await prisma.applicationSetting.findUnique({ where: { key } });
        if (r) {
          return {
            id: r.id,
            key: r.key,
            value: r.value,
            category: r.category,
            description: r.description || undefined,
            updatedAt: r.updatedAt.toISOString(),
          };
        }
      } catch (err) {
        logger.error({ err }, 'Error querying setting by key');
      }
    }
    return this.memorySettings.get(key) || null;
  }

  async set(key: string, value: any, category = 'general', description?: string): Promise<ApplicationSettingRecord> {
    const hasDb = await SettingRepository.checkDb();
    if (hasDb) {
      try {
        const r = await prisma.applicationSetting.upsert({
          where: { key },
          update: { value, category, description },
          create: { key, value, category, description },
        });
        return {
          id: r.id,
          key: r.key,
          value: r.value,
          category: r.category,
          description: r.description || undefined,
          updatedAt: r.updatedAt.toISOString(),
        };
      } catch (err) {
        logger.error({ err }, 'Error setting application setting');
      }
    }

    const rec: ApplicationSettingRecord = {
      id: `set_${Date.now()}`,
      key,
      value,
      category,
      description,
      updatedAt: new Date().toISOString(),
    };
    this.memorySettings.set(key, rec);
    return rec;
  }
}

export const settingRepository = new SettingRepository();
