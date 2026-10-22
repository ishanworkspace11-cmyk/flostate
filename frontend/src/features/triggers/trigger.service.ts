import { WorkflowTrigger } from './trigger.types';
import { safeJsonParse, safeJsonStringify, generateId } from '../../lib/utils';
import { WorkflowService } from '../workflows/workflow.service';

const TRIGGERS_STORAGE_KEY = 'dormammu_triggers_v1';

export const SEED_TRIGGERS: WorkflowTrigger[] = [
  {
    id: 'trig-101',
    workflowId: 'wf-customer-onboarding',
    workflowName: 'Customer Onboarding & Enrichment',
    name: 'Customer Signup Ingestion',
    kind: 'webhook',
    enabled: true,
    webhookPath: '/api/v1/webhooks/user-signup',
    webhookSecret: 'whsec_99a81b7e4f0d2c51',
    lastTriggeredAt: '2026-10-22T08:14:02.000Z',
    totalTriggers: 142,
    createdAt: '2026-10-15T09:30:00.000Z',
    isBackendConnected: false, // Honest demo indicator
  },
  {
    id: 'trig-102',
    workflowId: 'wf-incident-auto-triage',
    workflowName: 'Production Incident Auto-Triage',
    name: 'PagerDuty Alert Webhook',
    kind: 'webhook',
    enabled: true,
    webhookPath: '/api/v1/webhooks/pagerduty/alert',
    webhookSecret: 'whsec_pd_live_secret_44',
    lastTriggeredAt: '2026-10-22T07:10:00.000Z',
    totalTriggers: 19,
    createdAt: '2026-10-18T11:15:00.000Z',
    isBackendConnected: false,
  },
  {
    id: 'trig-103',
    workflowId: 'wf-daily-etl-digest',
    workflowName: 'Daily Revenue & Volume Digest',
    name: 'Daily Morning Cron (09:00 AM UTC)',
    kind: 'cron',
    enabled: true,
    cronExpression: '0 9 * * *',
    lastTriggeredAt: '2026-10-22T09:00:00.000Z',
    totalTriggers: 64,
    createdAt: '2026-10-20T16:00:00.000Z',
    isBackendConnected: false,
  },
];

export const TriggerService = {
  listTriggers(): WorkflowTrigger[] {
    const raw = localStorage.getItem(TRIGGERS_STORAGE_KEY);
    if (!raw) {
      this.resetDemoTriggers();
      return SEED_TRIGGERS;
    }
    const parsed = safeJsonParse<WorkflowTrigger[]>(raw, []);
    return parsed.length > 0 ? parsed : SEED_TRIGGERS;
  },

  createTrigger(data: Partial<WorkflowTrigger>): WorkflowTrigger {
    const list = this.listTriggers();
    const workflow = data.workflowId ? WorkflowService.getWorkflow(data.workflowId) : null;
    
    const newTrigger: WorkflowTrigger = {
      id: generateId('trig'),
      workflowId: data.workflowId || '',
      workflowName: workflow ? workflow.name : data.workflowName || 'Unassigned Workflow',
      name: data.name || 'New Workflow Trigger',
      kind: data.kind || 'webhook',
      enabled: data.enabled ?? true,
      cronExpression: data.cronExpression || '0 * * * *',
      webhookPath: data.webhookPath || `/api/v1/webhooks/${generateId('hook')}`,
      webhookSecret: `whsec_${generateId('sec').substring(0, 16)}`,
      lastTriggeredAt: null,
      totalTriggers: 0,
      createdAt: new Date().toISOString(),
      isBackendConnected: false, // Demo mode
    };

    list.unshift(newTrigger);
    localStorage.setItem(TRIGGERS_STORAGE_KEY, safeJsonStringify(list));
    return newTrigger;
  },

  toggleTrigger(id: string): WorkflowTrigger {
    const list = this.listTriggers();
    const index = list.findIndex((t) => t.id === id);
    if (index === -1) throw new Error(`Trigger ${id} not found`);

    list[index].enabled = !list[index].enabled;
    localStorage.setItem(TRIGGERS_STORAGE_KEY, safeJsonStringify(list));
    return list[index];
  },

  deleteTrigger(id: string): boolean {
    const list = this.listTriggers();
    const filtered = list.filter((t) => t.id !== id);
    if (filtered.length === list.length) return false;
    localStorage.setItem(TRIGGERS_STORAGE_KEY, safeJsonStringify(filtered));
    return true;
  },

  resetDemoTriggers(): void {
    localStorage.setItem(TRIGGERS_STORAGE_KEY, safeJsonStringify(SEED_TRIGGERS));
  },
};
