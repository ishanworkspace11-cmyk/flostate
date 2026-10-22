export type TriggerKind = 'webhook' | 'cron';

export interface TriggerDeliveryRecord {
  id: string;
  triggerId: string;
  workflowId: string;
  executionId?: string | null;
  status: 'SUCCESS' | 'FAILED' | 'REJECTED' | 'DUPLICATE';
  httpStatus: number;
  deliveredAt: string;
  durationMs: number;
  ip?: string;
  idempotencyKey?: string | null;
  headers?: Record<string, string>;
  payload?: any;
  error?: string | null;
}

export interface WorkflowTrigger {
  id: string;
  workflowId: string;
  workflowName: string;
  name: string;
  kind: TriggerKind;
  enabled: boolean;
  cronExpression?: string;
  timezone?: string;
  nextRunAt?: string | null;
  webhookPath?: string;
  webhookSecret?: string;
  maskedSecret?: string;
  hasSecret?: boolean;
  allowedMethods?: string[];
  lastTriggeredAt?: string | null;
  totalTriggers: number;
  lastDeliveryStatus?: 'success' | 'failed' | 'rejected' | null;
  lastDeliveryError?: string | null;
  config?: Record<string, any>;
  createdAt: string;
  updatedAt?: string;
  isBackendConnected: boolean;
  signingSecret?: string; // One-time secret returned upon creation
}
