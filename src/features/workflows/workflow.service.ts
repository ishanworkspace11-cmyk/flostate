import { Workflow, WorkflowNode, WorkflowEdge } from './workflow.types';
import { safeJsonParse, safeJsonStringify, generateId } from '../../lib/utils';
import { validateWorkflow } from './workflow.validation';

const WORKFLOWS_STORAGE_KEY = 'dormammu_workflows_v1';

export const SEED_WORKFLOWS: Workflow[] = [
  {
    id: 'wf-customer-onboarding',
    name: 'Customer Onboarding & Enrichment',
    description: 'Enriches new signups via API, extracts company profile, and notifies customer success team.',
    status: 'published',
    draftVersion: 3,
    publishedVersion: 3,
    createdAt: '2026-10-15T09:30:00.000Z',
    updatedAt: '2026-10-21T14:20:00.000Z',
    nodes: [
      {
        id: 'node-trig-signup',
        type: 'trigger',
        label: 'Signup Webhook',
        position: { x: 80, y: 150 },
        config: {
          triggerType: 'webhook',
          webhookPath: '/webhooks/v1/user-signup',
          defaultPayload: {
            userId: 'usr_84920',
            name: 'Sarah Connor',
            email: 's.connor@cyberdyne.io',
            company: 'Cyberdyne Systems',
            plan: 'Enterprise',
          },
        },
      },
      {
        id: 'node-enrich-company',
        type: 'httpRequest',
        label: 'Enrich via Clearbit API',
        position: { x: 380, y: 150 },
        config: {
          method: 'GET',
          url: 'https://api.clearbit.com/v2/companies/find?domain=cyberdyne.io',
          mockResponse: {
            enabled: true,
            status: 200,
            body: {
              company: 'Cyberdyne Systems',
              employees: 2500,
              industry: 'Robotics & AI',
              annualRevenue: '$150M',
              tier: 'Strategic Enterprise',
            },
          },
        },
      },
      {
        id: 'node-format-slack',
        type: 'transform',
        label: 'Format Slack Message',
        position: { x: 680, y: 150 },
        config: {
          operation: 'string_template',
          template: '🚀 New {{data.tier}} signup: {{name}} ({{email}}) from {{company}}!',
          targetField: 'slackMessage',
        },
      },
      {
        id: 'node-delay-throttle',
        type: 'delay',
        label: 'Rate Limit Pacing',
        position: { x: 960, y: 150 },
        config: {
          durationMs: 800,
        },
      },
      {
        id: 'node-notify-slack',
        type: 'webhookAction',
        label: 'Post to #enterprise-leads',
        position: { x: 1240, y: 150 },
        config: {
          url: 'https://hooks.slack.com/services/T00/B00/enterprise-leads',
          includeParentOutput: true,
        },
      },
    ],
    edges: [
      { id: 'e-1', source: 'node-trig-signup', target: 'node-enrich-company' },
      { id: 'e-2', source: 'node-enrich-company', target: 'node-format-slack' },
      { id: 'e-3', source: 'node-format-slack', target: 'node-delay-throttle' },
      { id: 'e-4', source: 'node-delay-throttle', target: 'node-notify-slack' },
    ],
  },
  {
    id: 'wf-incident-auto-triage',
    name: 'Production Incident Auto-Triage',
    description: 'Catches PagerDuty alerts, computes impact score, and triggers automated diagnostic recovery.',
    status: 'published',
    draftVersion: 2,
    publishedVersion: 2,
    createdAt: '2026-10-18T11:15:00.000Z',
    updatedAt: '2026-10-22T08:00:00.000Z',
    nodes: [
      {
        id: 'inc-trigger',
        type: 'trigger',
        label: 'PagerDuty Alert',
        position: { x: 100, y: 160 },
        config: {
          triggerType: 'webhook',
          webhookPath: '/webhooks/pagerduty/alert',
          defaultPayload: {
            incidentId: 'INC-9901',
            service: 'payments-service',
            severity: 'critical',
            errorRatePct: 4.8,
            cluster: 'us-east-prod-1',
          },
        },
      },
      {
        id: 'inc-query-metrics',
        type: 'httpRequest',
        label: 'Query Prometheus Error Rate',
        position: { x: 400, y: 160 },
        config: {
          method: 'GET',
          url: 'https://prometheus.internal/api/v1/query?service=payments',
          mockResponse: {
            enabled: true,
            status: 200,
            body: {
              status: 'success',
              data: {
                resultType: 'vector',
                result: [{ metric: { pod: 'payments-01' }, value: [1697992000, '4.8'] }],
              },
            },
          },
        },
      },
      {
        id: 'inc-extract-pod',
        type: 'transform',
        label: 'Extract Offending Pod',
        position: { x: 700, y: 160 },
        config: {
          operation: 'json_extract',
          extractPath: 'data.data.result[0].metric.pod',
          targetField: 'unhealthyPod',
        },
      },
      {
        id: 'inc-opsgenie-escalate',
        type: 'webhookAction',
        label: 'Trigger SRE Escalation',
        position: { x: 980, y: 160 },
        config: {
          url: 'https://api.opsgenie.com/v2/alerts',
        },
      },
    ],
    edges: [
      { id: 'inc-e1', source: 'inc-trigger', target: 'inc-query-metrics' },
      { id: 'inc-e2', source: 'inc-query-metrics', target: 'inc-extract-pod' },
      { id: 'inc-e3', source: 'inc-extract-pod', target: 'inc-opsgenie-escalate' },
    ],
  },
  {
    id: 'wf-daily-etl-digest',
    name: 'Daily Revenue & Volume Digest',
    description: 'Scheduled cron workflow aggregating daily transactions and computing total volume.',
    status: 'draft',
    draftVersion: 1,
    createdAt: '2026-10-20T16:00:00.000Z',
    updatedAt: '2026-10-21T18:45:00.000Z',
    nodes: [
      {
        id: 'cron-trig',
        type: 'trigger',
        label: 'Daily 09:00 AM Cron',
        position: { x: 100, y: 180 },
        config: {
          triggerType: 'cron',
          cronExpression: '0 9 * * *',
          defaultPayload: {
            scheduledDate: '2026-10-22',
            items: [
              { orderId: 'ord_1', value: 120 },
              { orderId: 'ord_2', value: 340 },
              { orderId: 'ord_3', value: 540 },
              { orderId: 'ord_4', value: 890 },
            ],
          },
        },
      },
      {
        id: 'etl-calc-sum',
        type: 'transform',
        label: 'Calculate Total Revenue',
        position: { x: 420, y: 180 },
        config: {
          operation: 'math_aggregate',
          aggregateOp: 'sum',
          aggregateField: 'value',
        },
      },
      {
        id: 'etl-slack-post',
        type: 'webhookAction',
        label: 'Publish Revenue KPI',
        position: { x: 740, y: 180 },
        config: {
          url: 'https://hooks.slack.com/services/internal/kpis',
        },
      },
    ],
    edges: [
      { id: 'etl-e1', source: 'cron-trig', target: 'etl-calc-sum' },
      { id: 'etl-e2', source: 'etl-calc-sum', target: 'etl-slack-post' },
    ],
  },
];

export const WorkflowService = {
  listWorkflows(): Workflow[] {
    const raw = localStorage.getItem(WORKFLOWS_STORAGE_KEY);
    if (!raw) {
      this.resetDemoWorkflows();
      return SEED_WORKFLOWS;
    }
    const parsed = safeJsonParse<Workflow[]>(raw, []);
    return parsed.length > 0 ? parsed : SEED_WORKFLOWS;
  },

  getWorkflow(id: string): Workflow | null {
    const list = this.listWorkflows();
    return list.find((w) => w.id === id) || null;
  },

  createWorkflow(data: Partial<Workflow>): Workflow {
    const list = this.listWorkflows();
    const newWorkflow: Workflow = {
      id: generateId('wf'),
      name: data.name || 'Untitled Workflow',
      description: data.description || 'Custom DAG workflow',
      status: 'draft',
      draftVersion: 1,
      nodes: data.nodes || [
        {
          id: generateId('node_trig'),
          type: 'trigger',
          label: 'Manual Trigger',
          position: { x: 100, y: 150 },
          config: {
            triggerType: 'manual',
            defaultPayload: { sampleKey: 'sampleValue' },
          },
        },
      ],
      edges: data.edges || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    list.unshift(newWorkflow);
    localStorage.setItem(WORKFLOWS_STORAGE_KEY, safeJsonStringify(list));
    return newWorkflow;
  },

  updateWorkflow(id: string, updates: Partial<Workflow>): Workflow {
    const list = this.listWorkflows();
    const index = list.findIndex((w) => w.id === id);
    if (index === -1) {
      throw new Error(`Workflow ${id} not found`);
    }

    const current = list[index];
    const updated: Workflow = {
      ...current,
      ...updates,
      draftVersion: updates.nodes || updates.edges ? current.draftVersion + 1 : current.draftVersion,
      updatedAt: new Date().toISOString(),
    };

    list[index] = updated;
    localStorage.setItem(WORKFLOWS_STORAGE_KEY, safeJsonStringify(list));
    return updated;
  },

  duplicateWorkflow(id: string): Workflow {
    const original = this.getWorkflow(id);
    if (!original) {
      throw new Error(`Workflow ${id} not found`);
    }

    const copy: Workflow = {
      ...JSON.parse(JSON.stringify(original)),
      id: generateId('wf'),
      name: `${original.name} (Copy)`,
      status: 'draft',
      draftVersion: 1,
      publishedVersion: undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    const list = this.listWorkflows();
    list.unshift(copy);
    localStorage.setItem(WORKFLOWS_STORAGE_KEY, safeJsonStringify(list));
    return copy;
  },

  deleteWorkflow(id: string): boolean {
    const list = this.listWorkflows();
    const filtered = list.filter((w) => w.id !== id);
    if (filtered.length === list.length) return false;
    localStorage.setItem(WORKFLOWS_STORAGE_KEY, safeJsonStringify(filtered));
    return true;
  },

  publishWorkflow(id: string): Workflow {
    const workflow = this.getWorkflow(id);
    if (!workflow) {
      throw new Error(`Workflow ${id} not found`);
    }

    const validation = validateWorkflow(workflow);
    if (!validation.isValid) {
      throw new Error(`Cannot publish invalid workflow: ${validation.errors.map((e) => e.message).join('; ')}`);
    }

    return this.updateWorkflow(id, {
      status: 'published',
      publishedVersion: workflow.draftVersion,
    });
  },

  setWorkflowStatus(id: string, status: 'draft' | 'published' | 'paused'): Workflow {
    return this.updateWorkflow(id, { status });
  },

  resetDemoWorkflows(): void {
    localStorage.setItem(WORKFLOWS_STORAGE_KEY, safeJsonStringify(SEED_WORKFLOWS));
  },
};
