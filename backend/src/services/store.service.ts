import { Workflow, WorkflowNode, WorkflowEdge } from '../models/workflow.types.js';
import { Execution, NodeExecution, ExecutionSummary, ExecutionListFilters } from '../models/execution.types.js';
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

    // Initialize Workers (populated dynamically by active worker instances)
    this.workers = [];

    this.queues = [
      { queueName: 'dormammu-tasks-default', activeCount: 0, waitingCount: 0, delayedCount: 0, completedCount: 0, failedCount: 0, isSimulated: false, isExact: true, driver: 'bullmq' },
      { queueName: 'dormammu-tasks-high-prio', activeCount: 0, waitingCount: 0, delayedCount: 0, completedCount: 0, failedCount: 0, isSimulated: false, isExact: true, driver: 'bullmq' },
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
  async getAllExecutions(): Promise<Execution[]> {
    return Array.from(this.executions.values());
  }

  async listExecutions(filters?: ExecutionListFilters): Promise<{ executions: ExecutionSummary[]; total: number }> {
    let all = Array.from(this.executions.values());

    if (filters?.workflowId) {
      all = all.filter((e) => e.workflowId === filters.workflowId);
    }
    if (filters?.status && filters.status !== 'all') {
      all = all.filter((e) => e.status.toLowerCase() === filters.status!.toLowerCase());
    }
    if (filters?.triggerType && filters.triggerType !== 'all') {
      all = all.filter((e) => e.triggerType.toLowerCase() === filters.triggerType!.toLowerCase());
    }
    if (filters?.startDate) {
      const startMs = new Date(filters.startDate).getTime();
      if (!isNaN(startMs)) {
        all = all.filter((e) => new Date(e.startedAt).getTime() >= startMs);
      }
    }
    if (filters?.endDate) {
      const endMs = new Date(filters.endDate).getTime();
      if (!isNaN(endMs)) {
        all = all.filter((e) => new Date(e.startedAt).getTime() <= endMs);
      }
    }
    if (filters?.search) {
      const q = filters.search.toLowerCase();
      all = all.filter(
        (e) =>
          e.id.toLowerCase().includes(q) ||
          e.workflowName.toLowerCase().includes(q) ||
          (e.error && e.error.toLowerCase().includes(q))
      );
    }

    const sortBy = filters?.sortBy || 'startedAt';
    const sortOrder = filters?.sortOrder || 'desc';
    all.sort((a, b) => {
      const valA: any = a[sortBy as keyof Execution];
      const valB: any = b[sortBy as keyof Execution];

      if (sortBy === 'startedAt' || sortBy === 'completedAt') {
        const timeA = valA ? new Date(valA).getTime() : 0;
        const timeB = valB ? new Date(valB).getTime() : 0;
        return sortOrder === 'asc' ? timeA - timeB : timeB - timeA;
      }

      if (sortBy === 'durationMs') {
        const numA = typeof valA === 'number' ? valA : (sortOrder === 'asc' ? Infinity : -1);
        const numB = typeof valB === 'number' ? valB : (sortOrder === 'asc' ? Infinity : -1);
        return sortOrder === 'asc' ? numA - numB : numB - numA;
      }

      const strA = String(valA ?? '');
      const strB = String(valB ?? '');
      return sortOrder === 'asc' ? strA.localeCompare(strB) : strB.localeCompare(strA);
    });

    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(100, Math.max(1, filters?.limit || 20));
    const start = (page - 1) * limit;
    const paginated = all.slice(start, start + limit);

    const summaries: ExecutionSummary[] = paginated.map((e) => {
      const nodeVals = Object.values(e.nodeExecutions || {});
      return {
        id: e.id,
        workflowId: e.workflowId,
        workflowName: e.workflowName,
        workflowVersion: e.workflowVersion,
        triggerType: e.triggerType,
        status: e.status,
        startedAt: e.startedAt,
        completedAt: e.completedAt,
        durationMs: e.durationMs,
        error: e.error,
        nodeCount: nodeVals.length,
        completedNodeCount: nodeVals.filter((n) => n.status === 'Succeeded').length,
      };
    });

    return {
      executions: summaries,
      total: all.length,
    };
  }

  async getExecution(id: string): Promise<Execution | null> {
    return this.executions.get(id) || null;
  }

  async saveExecution(execution: Execution): Promise<Execution> {
    this.executions.set(execution.id, execution);
    return execution;
  }

  async updateExecution(id: string, updates: Partial<Execution>): Promise<Execution | null> {
    const existing = this.executions.get(id);
    if (!existing) return null;
    const updated: Execution = {
      ...existing,
      ...updates,
      nodeExecutions: updates.nodeExecutions ? { ...existing.nodeExecutions, ...updates.nodeExecutions } : existing.nodeExecutions,
    };
    this.executions.set(id, updated);
    return updated;
  }

  async updateNodeExecution(executionId: string, nodeId: string, updates: Partial<NodeExecution>): Promise<NodeExecution | null> {
    const exec = this.executions.get(executionId);
    if (!exec || !exec.nodeExecutions[nodeId]) return null;
    const existingNode = exec.nodeExecutions[nodeId];
    const updatedNode: NodeExecution = {
      ...existingNode,
      ...updates,
      logs: updates.logs !== undefined ? updates.logs : existingNode.logs,
    };
    exec.nodeExecutions[nodeId] = updatedNode;
    this.executions.set(executionId, exec);
    return updatedNode;
  }

  async getNodeExecutions(executionId: string): Promise<NodeExecution[]> {
    const exec = this.executions.get(executionId);
    if (!exec) return [];
    return Object.values(exec.nodeExecutions);
  }

  async findNodeExecution(executionId: string, nodeExecutionId: string): Promise<NodeExecution | null> {
    const exec = this.executions.get(executionId);
    if (!exec) return null;
    for (const ne of Object.values(exec.nodeExecutions)) {
      if (ne.id === nodeExecutionId || ne.nodeId === nodeExecutionId) {
        return ne;
      }
    }
    return null;
  }

  // Triggers
  async listTriggers(): Promise<WorkflowTrigger[]> {
    return Array.from(this.triggers.values());
  }

  async getTrigger(id: string): Promise<WorkflowTrigger | null> {
    return this.triggers.get(id) || null;
  }

  async getTriggerByPath(path: string): Promise<WorkflowTrigger | null> {
    const clean = path.startsWith('/') ? path : `/${path}`;
    for (const t of this.triggers.values()) {
      if (
        t.webhookPath === clean ||
        t.webhookPath === `/api/v1/webhooks${clean}` ||
        t.webhookPath === `/webhooks${clean}` ||
        clean === `/api/v1/webhooks/${t.webhookPath?.replace(/^\//, '')}` ||
        clean === `/webhooks/${t.webhookPath?.replace(/^\//, '')}`
      ) {
        return t;
      }
    }
    return null;
  }

  async saveTrigger(trigger: WorkflowTrigger): Promise<WorkflowTrigger> {
    this.triggers.set(trigger.id, trigger);
    return trigger;
  }

  async updateTrigger(id: string, updates: Partial<WorkflowTrigger>): Promise<WorkflowTrigger | null> {
    const existing = this.triggers.get(id);
    if (!existing) return null;
    const updated: WorkflowTrigger = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    this.triggers.set(id, updated);
    return updated;
  }

  async deleteTrigger(id: string): Promise<boolean> {
    return this.triggers.delete(id);
  }

  // Workers
  async getWorkers(): Promise<WorkerInstance[]> {
    return [...this.workers];
  }

  async getWorkerById(id: string): Promise<WorkerInstance | null> {
    const worker = this.workers.find((w) => w.id === id);
    return worker ? { ...worker } : null;
  }

  async clearWorkers(): Promise<void> {
    this.workers = [];
  }

  async removeWorker(id: string): Promise<boolean> {
    const idx = this.workers.findIndex((w) => w.id === id);
    if (idx >= 0) {
      this.workers.splice(idx, 1);
      return true;
    }
    return false;
  }

  async recordWorkerHeartbeat(
    id: string,
    data: Partial<WorkerInstance> & { hostname?: string; name?: string }
  ): Promise<void> {
    const existingIndex = this.workers.findIndex((w) => w.id === id);
    const now = new Date().toISOString();
    if (existingIndex >= 0) {
      this.workers[existingIndex] = {
        ...this.workers[existingIndex],
        ...data,
        status: (data.status as any) || this.workers[existingIndex].status,
        lastHeartbeat: now,
      };
    } else {
      this.workers.push({
        id,
        name: data.name || id,
        hostname: data.hostname || 'localhost',
        status: (data.status as any) || 'idle',
        concurrency: data.concurrency || 5,
        currentJobs: data.currentJobs || [],
        completedJobsCount: data.completedJobsCount || 0,
        failedJobsCount: data.failedJobsCount || 0,
        uptimeSeconds: data.uptimeSeconds || 0,
        registeredAt: data.registeredAt || now,
        lastHeartbeat: now,
        isSimulated: data.isSimulated || false,
        lastError: data.lastError,
        shutdownInfo: data.shutdownInfo,
        memoryUsage: data.memoryUsage,
      });
    }
  }

  async getQueues(): Promise<WorkerQueueSummary[]> {
    return this.queues;
  }

  public resetToFactoryDefaults(): { workflows: number; executions: number; triggers: number } {
    this.workflows.clear();
    this.versions.clear();
    this.executions.clear();
    this.triggers.clear();
    this.seed();
    return {
      workflows: this.workflows.size,
      executions: this.executions.size,
      triggers: this.triggers.size,
    };
  }

  public getCounts(): { workflows: number; executions: number; triggers: number; workers: number } {
    return {
      workflows: this.workflows.size,
      executions: this.executions.size,
      triggers: this.triggers.size,
      workers: this.workers.length,
    };
  }
}

export const store = new BackendStore();
