export type TriggerKind = 'webhook' | 'cron';

export interface WorkflowTrigger {
  id: string;
  workflowId: string;
  workflowName: string;
  name: string;
  kind: TriggerKind;
  enabled: boolean;
  cronExpression?: string; // e.g. "0 */6 * * *"
  webhookPath?: string; // e.g. "/webhooks/v1/stripe-invoice"
  webhookSecret?: string;
  lastTriggeredAt?: string | null;
  totalTriggers: number;
  createdAt: string;
  isBackendConnected: boolean; // Explicit indicator as requested
}
