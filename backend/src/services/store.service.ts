import { Workflow, WorkflowNode, WorkflowEdge } from '../models/workflow.types.js';
import { Execution } from '../models/execution.types.js';
import { WorkflowTrigger } from '../models/trigger.types.js';
import { WorkerInstance, WorkerQueueSummary } from '../models/worker.types.js';

export interface StoreWorkflowVersion {
  id: string;
  workflowId: string;
  version: number;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  isPublished: boolean;
  createdAt: string;
}

function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

class BackendStore {
  private workflows: Map<string, Workflow> = new Map();
  private versions: Map<string, StoreWorkflowVersion[]> = new Map();
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
    this.versions.set(wf1.id, [
      {
        id: `ver-${wf1.id}-3`,
        workflowId: wf1.id,
        version: 3,
        nodes: JSON.parse(JSON.stringify(wf1.nodes)),
        edges: JSON.parse(JSON.stringify(wf1.edges)),
        isPublished: true,
        createdAt: wf1.createdAt,
      },
    ]);

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
    const id = generateId('wf');
    const nodes = data.nodes ? JSON.parse(JSON.stringify(data.nodes)) : [];
    const edges = data.edges ? JSON.parse(JSON.stringify(data.edges)) : [];
    const newWorkflow: Workflow = {
      id,
      name: data.name || 'Untitled Workflow',
      description: data.description || '',
      status: (data.status as any) || 'draft',
      draftVersion: 1,
      publishedVersion: data.status === 'published' ? 1 : undefined,
      isArchived: false,
      nodes,
      edges,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    this.workflows.set(newWorkflow.id, newWorkflow);
    this.versions.set(id, [
      {
        id: `ver-${id}-1`,
        workflowId: id,
        version: 1,
        nodes: JSON.parse(JSON.stringify(nodes)),
        edges: JSON.parse(JSON.stringify(edges)),
        isPublished: data.status === 'published',
        createdAt: newWorkflow.createdAt,
      },
    ]);
    return newWorkflow;
  }

  async updateWorkflow(id: string, updates: Partial<Workflow>): Promise<Workflow> {
    const existing = this.workflows.get(id);
    if (!existing) throw new Error(`Workflow ${id} not found`);

    const hasGraphChanges = Boolean(
      (updates.nodes && JSON.stringify(updates.nodes) !== JSON.stringify(existing.nodes)) ||
      (updates.edges && JSON.stringify(updates.edges) !== JSON.stringify(existing.edges))
    );
    const newDraftVersion = hasGraphChanges ? existing.draftVersion + 1 : existing.draftVersion;
    const isNowPublished = updates.status === 'published';
    const newPublishedVersion = isNowPublished
      ? updates.publishedVersion ?? existing.publishedVersion ?? existing.draftVersion
      : updates.publishedVersion !== undefined
      ? updates.publishedVersion
      : existing.publishedVersion;

    const updated: Workflow = {
      ...existing,
      ...updates,
      publishedVersion: newPublishedVersion,
      draftVersion: newDraftVersion,
      updatedAt: new Date().toISOString(),
    };
    this.workflows.set(id, updated);

    const verList = this.versions.get(id) || [];
    if (hasGraphChanges) {
      verList.push({
        id: `ver-${id}-${newDraftVersion}`,
        workflowId: id,
        version: newDraftVersion,
        nodes: JSON.parse(JSON.stringify(updated.nodes)),
        edges: JSON.parse(JSON.stringify(updated.edges)),
        isPublished: isNowPublished,
        createdAt: new Date().toISOString(),
      });
    } else if (isNowPublished) {
      const pubVer = verList.find((v) => v.version === newPublishedVersion);
      if (pubVer) {
        pubVer.isPublished = true;
      }
    }
    this.versions.set(id, verList);

    return updated;
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    this.versions.delete(id);
    return this.workflows.delete(id);
  }

  async duplicateWorkflow(id: string, newName?: string): Promise<Workflow> {
    const source = this.workflows.get(id);
    if (!source) throw new Error(`Workflow ${id} not found`);

    const nodeIdMap = new Map<string, string>();
    const newNodes = source.nodes.map((node) => {
      const newId = generateId('node');
      nodeIdMap.set(node.id, newId);
      return {
        ...node,
        id: newId,
        config: JSON.parse(JSON.stringify(node.config || {})),
      };
    });

    const newEdges = source.edges.map((edge) => ({
      ...edge,
      id: generateId('edge'),
      source: nodeIdMap.get(edge.source) || edge.source,
      target: nodeIdMap.get(edge.target) || edge.target,
    }));

    const duplicated: Workflow = {
      id: generateId('wf'),
      name: newName || `${source.name} (Copy)`,
      description: source.description,
      status: 'draft',
      draftVersion: 1,
      publishedVersion: undefined,
      isArchived: false,
      nodes: newNodes,
      edges: newEdges,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    this.workflows.set(duplicated.id, duplicated);
    this.versions.set(duplicated.id, [
      {
        id: `ver-${duplicated.id}-1`,
        workflowId: duplicated.id,
        version: 1,
        nodes: JSON.parse(JSON.stringify(newNodes)),
        edges: JSON.parse(JSON.stringify(newEdges)),
        isPublished: false,
        createdAt: duplicated.createdAt,
      },
    ]);
    return duplicated;
  }

  async getWorkflowVersion(workflowId: string, versionNumber: number): Promise<StoreWorkflowVersion | null> {
    const list = this.versions.get(workflowId) || [];
    const found = list.find((v) => v.version === versionNumber);
    return found ? JSON.parse(JSON.stringify(found)) : null;
  }

  async getLatestWorkflowVersion(workflowId: string): Promise<StoreWorkflowVersion | null> {
    const list = this.versions.get(workflowId) || [];
    if (list.length === 0) return null;
    const sorted = [...list].sort((a, b) => b.version - a.version);
    return JSON.parse(JSON.stringify(sorted[0]));
  }

  async archiveWorkflow(id: string): Promise<Workflow> {
    const existing = this.workflows.get(id);
    if (!existing) throw new Error(`Workflow ${id} not found`);

    const archived: Workflow = {
      ...existing,
      status: 'archived',
      isArchived: true,
      updatedAt: new Date().toISOString(),
    };
    this.workflows.set(id, archived);
    return archived;
  }

  async hasExecutions(workflowId: string): Promise<boolean> {
    for (const exec of this.executions.values()) {
      if (exec.workflowId === workflowId) return true;
    }
    return false;
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
