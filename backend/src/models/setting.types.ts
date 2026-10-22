export type SettingCategory = 'execution' | 'resilience' | 'timeouts' | 'retention' | 'ui' | 'general';

export interface ConcurrencyLimitSettings {
  maxConcurrentWorkflows: number; // 1 to 100
  maxConcurrentTasksPerWorker: number; // 1 to 50
}

export interface RetryBackoffSettings {
  defaultMaxAttempts: number; // 1 to 10
  backoffType: 'exponential' | 'linear' | 'fixed';
  initialDelayMs: number; // 100 to 60000
}

export interface NodeTimeoutSettings {
  defaultNodeTimeoutMs: number; // 1000 to 600000 (1s to 10m)
  httpRequestTimeoutMs: number; // 1000 to 120000 (1s to 2m)
}

export interface HistoryRetentionSettings {
  retentionDays: number; // 1 to 365
  maxExecutionsToRetain: number; // 100 to 100000
  autoCleanupEnabled: boolean;
}

export interface UiPreferenceSettings {
  theme: 'light' | 'dark' | 'system';
  autoRefreshIntervalMs: number; // 2000 to 60000
  compactGraphView: boolean;
}

export interface ApplicationSettingDefinition<T = any> {
  id: string;
  key: string;
  value: T;
  category: SettingCategory;
  description: string;
  requiresRestart: boolean;
  restartNotice?: string;
  isOperationallySupported: boolean;
  updatedAt: string;
}

export interface SystemInfo {
  engineVersion: string;
  nodeVersion: string;
  platform: string;
  securityMode: 'local-development-single-workspace' | 'multi-tenant-production';
  environment: string;
  isDatabaseAvailable: boolean;
  isRedisAvailable: boolean;
  storageStats: {
    workflowCount: number;
    executionCount: number;
    triggerCount: number;
    workerCount: number;
    estimatedDatabaseKb: number;
  };
}

export interface DemoResetResult {
  success: boolean;
  message: string;
  stats: {
    workflows: number;
    executions: number;
    triggers: number;
  };
  timestamp: string;
}
