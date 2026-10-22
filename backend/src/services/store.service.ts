import { Workflow } from '../models/workflow.types.js';
import { Execution } from '../models/execution.types.js';
import { WorkflowTrigger } from '../models/trigger.types.js';
import { WorkerInstance, WorkerQueueSummary } from '../models/worker.types.js';

function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

class BackendStore {
  private workflows: Map<string, Workflow> = new Map();
  private executions: Map<string, Execution> = new Map();
  private triggers: Map<string, WorkflowTrigger> = new Map();
  private workers: WorkerInstance[] = [];
  private queues: WorkerQueueSummary[] = [];

  constructor() {
    this.seed();
  }

  private seed() {
    // Seed Workflows
    const wf1: Workflow = {
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
              body: { company: 'Cyberdyne Systems', employees: 2500, tier: 'Strategic Enterprise' },
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
          id: 'node-notify-slack',
          type: 'webhookAction',
          label: 'Post to #enterprise-leads',
          position: { x: 980, y: 150 },
          config: {
            url: 'https://hooks.slack.com/services/T00/B00/enterprise-leads',
          },
        },
      ],
      edges: [
        { id: 'e-1', source: 'node-trig-signup', target: 'node-enrich-company' },
        { id: 'e-2', source: 'node-enrich-company', target: 'node-format-slack' },
        { id: 'e-3', source: 'node-format-slack', target: 'node-notify-slack' },
      ],
    };

    this.workflows.set(wf1.id, wf1);

    // Seed Triggers
    const tr1: WorkflowTrigger = {
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
      isBackendConnected: true,
    };
    this.triggers.set(tr1.id, tr1);

    // Seed Workers & Queues
    this.workers = [
      {
        id: 'backend-worker-01',
        name: 'Node Worker Alpha (BullMQ)',
        hostname: 'worker-01.us-east.dormammu.internal',
        status: 'busy',
        concurrency: 5,
        currentJobs: [{ jobId: 'job_1', executionId: 'run-91823', nodeId: 'node-enrich-company', nodeLabel: 'Enrich Company', startedAt: new Date().toISOString() }],
        completedJobsCount: 1240,
        failedJobsCount: 14,
        uptimeSeconds: 864200,
        lastHeartbeat: new Date().toISOString(),
        isSimulated: false,
      },
      {
        id: 'backend-worker-02',
        name: 'Node Worker Beta (BullMQ)',
        hostname: 'worker-02.us-east.dormammu.internal',
        status: 'idle',
        concurrency: 5,
        currentJobs: [],
        completedJobsCount: 1195,
        failedJobsCount: 8,
        uptimeSeconds: 864150,
        lastHeartbeat: new Date().toISOString(),
        isSimulated: false,
      },
    ];

    this.queues = [
      { queueName: 'dormammu-tasks-default', activeCount: 1, waitingCount: 0, delayedCount: 0, completedCount: 3840, failedCount: 28, isSimulated: false },
      { queueName: 'dormammu-tasks-high-prio', activeCount: 0, waitingCount: 0, delayedCount: 0, completedCount: 1420, failedCount: 5, isSimulated: false },
    ];
  }

  // Workflows
  async listWorkflows(): Promise<Workflow[]> {
    return Array.from(this.workflows.values());
  }

  async getWorkflow(id: string): Promise<Workflow | null> {
    return this.workflows.get(id) || null;
  }

  async createWorkflow(data: Partial<Workflow>): Promise<Workflow> {
    const newWorkflow: Workflow = {
      id: generateId('wf'),
      name: data.name || 'Untitled Workflow',
      description: data.description || '',
      status: 'draft',
      draftVersion: 1,
      nodes: data.nodes || [],
      edges: data.edges || [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.workflows.set(newWorkflow.id, newWorkflow);
    return newWorkflow;
  }

  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow> {
    const existing = this.workflows.get(id);
    if (!existing) throw new Error(`Workflow ${id} not found`);

    const updated: Workflow = {
      ...existing,
      ...updates,
      draftVersion: updates.nodes || updates.edges ? existing.draftVersion + 1 : existing.draftVersion,
      updatedAt: new Date().toISOString(),
    };
    this.workflows.set(id, updated);
    return updated;
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    return this.workflows.delete(id);
  }

  // Executions
  async listExecutions(): Promise<Execution[]> {
    return Array.from(this.executions.values()).sort(
      (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()
    );
  }

  async getExecution(id: string): Promise<Execution | null> {
    return this.executions.get(id) || null;
  }

  async saveExecution(execution: Execution): Promise<Execution> {
    this.executions.set(execution.id, execution);
    return execution;
  }

  // Triggers
  async listTriggers(): Promise<WorkflowTrigger[]> {
    return Array.from(this.triggers.values());
  }

  async getTriggerByPath(path: string): Promise<WorkflowTrigger | null> {
    for (const t of this.triggers.values()) {
      if (t.webhookPath === path || t.webhookPath === `/api/v1/webhooks/${path}` || t.webhookPath === `/webhooks/${path}`) {
        return t;
      }
    }
    return null;
  }

  async saveTrigger(trigger: WorkflowTrigger): Promise<WorkflowTrigger> {
    this.triggers.set(trigger.id, trigger);
    return trigger;
  }

  // Workers
  async getWorkers(): Promise<WorkerInstance[]> {
    return this.workers;
  }

  async getQueues(): Promise<WorkerQueueSummary[]> {
    return this.queues;
  }
}

export const store = new BackendStore();
