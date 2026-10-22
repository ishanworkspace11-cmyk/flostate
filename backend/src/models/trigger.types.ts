export type TriggerKind = 'webhook' | 'cron';

export interface WorkflowTrigger {
  id: string;
  workflowId: string;
  workflowName: string;
  name: string;
  kind: TriggerKind;
  enabled: boolean;
  cronExpression?: string;
  webhookPath?: string;
  webhookSecret?: string;
  lastTriggeredAt?: string | null;
  totalTriggers: number;
  createdAt: string;
  isBackendConnected: boolean;
}
