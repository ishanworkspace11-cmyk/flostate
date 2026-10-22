import { prisma } from '../database/prisma.js';
import { isDatabaseAvailable } from '../database/db-status.js';
import { store } from '../services/store.service.js';
import { logger } from '../config/logger.js';
import {
  ApplicationSettingDefinition,
  SettingCategory,
  SystemInfo,
  DemoResetResult,
} from '../models/setting.types.js';

export const DEFAULT_SETTINGS: Record<string, Omit<ApplicationSettingDefinition, 'id' | 'updatedAt'>> = {
  concurrency_limit: {
    key: 'concurrency_limit',
    category: 'execution',
    value: {
      maxConcurrentWorkflows: 20,
      maxConcurrentTasksPerWorker: 5,
    },
    description: 'Execution concurrency limits across workflows and worker nodes.',
    requiresRestart: true,
    restartNotice: 'Worker daemon restart required for updated concurrency limits to take effect.',
    isOperationallySupported: true,
  },
  retry_backoff_policy: {
    key: 'retry_backoff_policy',
    category: 'resilience',
    value: {
      defaultMaxAttempts: 3,
      backoffType: 'exponential',
      initialDelayMs: 1000,
    },
    description: 'Default retry attempts and backoff scheduling for failed DAG step nodes.',
    requiresRestart: false,
    restartNotice: 'Takes effect immediately on all subsequent execution retries.',
    isOperationallySupported: true,
  },
  node_timeout_limits: {
    key: 'node_timeout_limits',
    category: 'timeouts',
    value: {
      defaultNodeTimeoutMs: 30000,
      httpRequestTimeoutMs: 15000,
    },
    description: 'Execution timeout limits preventing runaway HTTP requests and transforms.',
    requiresRestart: false,
    restartNotice: 'Takes effect immediately on all node executions.',
    isOperationallySupported: true,
  },
  history_retention: {
    key: 'history_retention',
    category: 'retention',
    value: {
      retentionDays: 30,
      maxExecutionsToRetain: 5000,
      autoCleanupEnabled: true,
    },
    description: 'Execution history record and log retention thresholds.',
    requiresRestart: false,
    restartNotice: 'Applied during background retention maintenance sweeps.',
    isOperationallySupported: true,
  },
  ui_preferences: {
    key: 'ui_preferences',
    category: 'ui',
    value: {
      theme: 'light',
      autoRefreshIntervalMs: 5000,
      compactGraphView: false,
    },
    description: 'User interface layout, theme, and polling frequency preferences.',
    requiresRestart: false,
    restartNotice: 'Applied immediately to client browser session.',
    isOperationallySupported: true,
  },
};

const FORBIDDEN_SECRET_PATTERNS = [
  'secret',
  'token',
  'password',
  'database_url',
  'redis_url',
  'jwt',
  'private_key',
  'cert',
  'auth_secret',
  'api_key',
];

export class SettingRepository {
  private memorySettings: Map<string, ApplicationSettingDefinition> = new Map();

  constructor() {
    this.initDefaultMemorySettings();
  }

  private initDefaultMemorySettings() {
    const now = new Date().toISOString();
    for (const [key, def] of Object.entries(DEFAULT_SETTINGS)) {
      this.memorySettings.set(key, {
        id: `set_${key}`,
        ...def,
        updatedAt: now,
      });
    }
  }

  private static async checkDb(): Promise<boolean> {
    return isDatabaseAvailable();
  }

  public isProhibitedSecretKey(key: string): boolean {
    const lower = key.toLowerCase();
    // Allow explicitly known operational settings that happen to contain words like 'policy'
    if (Object.keys(DEFAULT_SETTINGS).includes(key)) {
      return false;
    }
    return FORBIDDEN_SECRET_PATTERNS.some((pattern) => lower.includes(pattern));
  }

  async getAll(): Promise<ApplicationSettingDefinition[]> {
    const hasDb = await SettingRepository.checkDb();
    if (hasDb) {
      try {
        const records = await prisma.applicationSetting.findMany({
          orderBy: { category: 'asc' },
        });

        if (records.length > 0) {
          const map = new Map<string, ApplicationSettingDefinition>();
          // Start with defaults
          for (const [k, v] of this.memorySettings.entries()) {
            map.set(k, { ...v });
          }

          // Overlay DB records
          for (const r of records) {
            const def = DEFAULT_SETTINGS[r.key];
            map.set(r.key, {
              id: r.id,
              key: r.key,
              value: r.value,
              category: (r.category as SettingCategory) || def?.category || 'general',
              description: r.description || def?.description || '',
              requiresRestart: def ? def.requiresRestart : false,
              restartNotice: def?.restartNotice,
              isOperationallySupported: def ? def.isOperationallySupported : false,
              updatedAt: r.updatedAt.toISOString(),
            });
          }

          return Array.from(map.values());
        }
      } catch (err) {
        logger.error({ err }, 'Error querying settings from DB, falling back to memory');
      }
    }

    return Array.from(this.memorySettings.values());
  }

  async getByKey(key: string): Promise<ApplicationSettingDefinition | null> {
    const hasDb = await SettingRepository.checkDb();
    if (hasDb) {
      try {
        const r = await prisma.applicationSetting.findUnique({ where: { key } });
        if (r) {
          const def = DEFAULT_SETTINGS[r.key];
          return {
            id: r.id,
            key: r.key,
            value: r.value,
            category: (r.category as SettingCategory) || def?.category || 'general',
            description: r.description || def?.description || '',
            requiresRestart: def ? def.requiresRestart : false,
            restartNotice: def?.restartNotice,
            isOperationallySupported: def ? def.isOperationallySupported : false,
            updatedAt: r.updatedAt.toISOString(),
          };
        }
      } catch (err) {
        logger.error({ err }, `Error querying setting '${key}' from DB, falling back`);
      }
    }

    return this.memorySettings.get(key) || null;
  }

  async set(
    key: string,
    value: any,
    category?: SettingCategory,
    description?: string
  ): Promise<ApplicationSettingDefinition> {
    const def = DEFAULT_SETTINGS[key];
    const cat = category || def?.category || 'general';
    const desc = description || def?.description || '';
    const now = new Date();

    const hasDb = await SettingRepository.checkDb();
    if (hasDb) {
      try {
        const r = await prisma.applicationSetting.upsert({
          where: { key },
          update: {
            value,
            category: cat,
            description: desc,
            updatedAt: now,
          },
          create: {
            key,
            value,
            category: cat,
            description: desc,
          },
        });

        const result: ApplicationSettingDefinition = {
          id: r.id,
          key: r.key,
          value: r.value,
          category: cat,
          description: desc,
          requiresRestart: def ? def.requiresRestart : false,
          restartNotice: def?.restartNotice,
          isOperationallySupported: def ? def.isOperationallySupported : false,
          updatedAt: r.updatedAt.toISOString(),
        };

        this.memorySettings.set(key, result);
        return result;
      } catch (err) {
        logger.error({ err }, `Error upserting setting '${key}' in DB`);
      }
    }

    const rec: ApplicationSettingDefinition = {
      id: `set_${key}`,
      key,
      value,
      category: cat,
      description: desc,
      requiresRestart: def ? def.requiresRestart : false,
      restartNotice: def?.restartNotice,
      isOperationallySupported: def ? def.isOperationallySupported : false,
      updatedAt: now.toISOString(),
    };

    this.memorySettings.set(key, rec);
    return rec;
  }

  async getSystemInfo(): Promise<SystemInfo> {
    const hasDb = await SettingRepository.checkDb();
    let wfCount = 0;
    let exCount = 0;
    let trCount = 0;
    let wrkCount = 0;

    if (hasDb) {
      try {
        const [wfs, exs, trs, wrks] = await Promise.all([
          prisma.workflow.count({ where: { isArchived: false } }),
          prisma.execution.count(),
          prisma.trigger.count(),
          prisma.workerInstance.count(),
        ]);
        wfCount = wfs;
        exCount = exs;
        trCount = trs;
        wrkCount = wrks;
      } catch (err) {
        logger.warn({ err }, 'Error retrieving count stats from DB, using memory fallback');
        const counts = store.getCounts();
        wfCount = counts.workflows;
        exCount = counts.executions;
        trCount = counts.triggers;
        wrkCount = counts.workers;
      }
    } else {
      const counts = store.getCounts();
      wfCount = counts.workflows;
      exCount = counts.executions;
      trCount = counts.triggers;
      wrkCount = counts.workers;
    }

    // Estimate storage: workflows ~ 4KB, executions ~ 8KB, triggers ~ 1KB
    const estimatedKb = Math.round(wfCount * 4 + exCount * 8 + trCount * 1);

    return {
      engineVersion: '1.0.0-mvp',
      nodeVersion: process.version,
      platform: process.platform,
      securityMode: 'local-development-single-workspace',
      environment: process.env.NODE_ENV || 'development',
      isDatabaseAvailable: hasDb,
      isRedisAvailable: false,
      storageStats: {
        workflowCount: wfCount,
        executionCount: exCount,
        triggerCount: trCount,
        workerCount: wrkCount,
        estimatedDatabaseKb: estimatedKb,
      },
    };
  }

  async resetDemoData(): Promise<DemoResetResult> {
    const hasDb = await SettingRepository.checkDb();
    if (hasDb) {
      try {
        // Safe deterministic reset: delete custom executions, triggers, workflows
        // without dropping tables or breaking schema migrations
        await prisma.nodeExecution.deleteMany({});
        await prisma.execution.deleteMany({});
        await prisma.trigger.deleteMany({});
        await prisma.workflowVersion.deleteMany({});
        await prisma.workflow.deleteMany({});
      } catch (err) {
        logger.error({ err }, 'Error during DB demo data reset');
      }
    }

    // Reset in-memory store deterministically to factory seed
    const stats = store.resetToFactoryDefaults();

    return {
      success: true,
      message: 'Demo workflows, executions, and triggers have been deterministically reset to factory state.',
      stats,
      timestamp: new Date().toISOString(),
    };
  }
}

export const settingRepository = new SettingRepository();
