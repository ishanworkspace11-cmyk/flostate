/**
 * The Dormammu Loop - Frontend API Client
 * Compatible with backend v1 API (/api/v1) with seamless fallback
 */

const API_BASE_URL = (import.meta as any).env?.VITE_API_BASE_URL || 'http://localhost:4000/api/v1';

export interface ApiResponse<T = any> {
  success: boolean;
  data: T;
  meta?: {
    total?: number;
    page?: number;
    limit?: number;
    totalPages?: number;
    [key: string]: any;
  };
  error?: {
    code: string;
    message: string;
    details?: any;
  };
}

export interface DashboardSummary {
  totalWorkflows: number;
  activeWorkflows: number;
  draftWorkflows: number;
  pausedWorkflows: number;
  period: '24h' | '7d' | '30d' | 'all';
  periodStart: string;
  periodEnd: string;
  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  runningExecutions: number;
  executionSuccessRate: number;
  recentWorkflows: Array<{
    id: string;
    name: string;
    description: string;
    status: 'draft' | 'published' | 'paused' | 'archived';
    draftVersion: number;
    publishedVersion?: number;
    nodeCount: number;
    edgeCount: number;
    updatedAt: string;
    createdAt: string;
  }>;
  recentExecutions: Array<{
    id: string;
    workflowId: string;
    workflowName: string;
    workflowVersion: number;
    triggerType: string;
    status: 'Pending' | 'Ready' | 'Running' | 'Succeeded' | 'Failed' | 'Retrying' | 'Skipped' | 'Cancelled';
    startedAt: string;
    completedAt?: string | null;
    durationMs?: number;
    error?: string | null;
  }>;
}

export interface DashboardActivityItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: string;
  details?: Record<string, any>;
  createdAt: string;
}

class DormammuApiClient {
  private baseUrl: string;

  constructor(baseUrl = API_BASE_URL) {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  private async request<T>(endpoint: string, options: RequestInit = {}): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${endpoint.startsWith('/') ? endpoint : `/${endpoint}`}`;
    const headers = {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      ...(options.headers || {}),
    };

    try {
      const response = await fetch(url, {
        ...options,
        headers,
      });

      const json = await response.json().catch(() => ({
        success: response.ok,
        data: null,
      }));

      if (!response.ok) {
        return {
          success: false,
          data: null as any,
          error: json.error || {
            code: `HTTP_${response.status}`,
            message: response.statusText || 'Request failed',
          },
        };
      }

      return json;
    } catch (err: any) {
      return {
        success: false,
        data: null as any,
        error: {
          code: 'NETWORK_ERROR',
          message: err?.message || 'Unable to connect to Dormammu Engine Backend',
        },
      };
    }
  }

  // Health & Readiness
  async getHealth() {
    return this.request<{ status: string; uptimeSeconds: number; version: string }>('/health');
  }

  async getReadiness() {
    return this.request<{
      status: 'ready' | 'degraded' | 'unhealthy';
      dependencies: {
        database: { status: 'up' | 'down'; latencyMs?: number };
        redis: { status: 'up' | 'down'; latencyMs?: number };
      };
    }>('/ready');
  }

  // Dashboard
  async getDashboardSummary(period: '24h' | '7d' | '30d' | 'all' = '24h') {
    return this.request<DashboardSummary>(`/dashboard/summary?period=${period}`);
  }

  async getDashboardActivity(params?: { page?: number; limit?: number }) {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<DashboardActivityItem[]>(`/dashboard/activity${qs}`);
  }

  // Workflows
  async listWorkflows(params?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
    includeArchived?: boolean;
  }) {
    const query = new URLSearchParams();
    if (params?.search) query.append('search', params.search);
    if (params?.status) query.append('status', params.status);
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.includeArchived) query.append('includeArchived', 'true');
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<any[]>(`/workflows${qs}`);
  }

  async getWorkflow(id: string) {
    return this.request<any>(`/workflows/${id}`);
  }

  async createWorkflow(workflow: any) {
    return this.request<any>('/workflows', {
      method: 'POST',
      body: JSON.stringify(workflow),
    });
  }

  async updateWorkflow(id: string, workflow: any) {
    return this.request<any>(`/workflows/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(workflow),
    });
  }

  async duplicateWorkflow(id: string, name?: string) {
    return this.request<any>(`/workflows/${id}/duplicate`, {
      method: 'POST',
      body: JSON.stringify({ name }),
    });
  }

  async publishWorkflow(id: string) {
    return this.request<any>(`/workflows/${id}/publish`, {
      method: 'POST',
    });
  }

  async activateWorkflow(id: string) {
    return this.request<any>(`/workflows/${id}/activate`, {
      method: 'POST',
    });
  }

  async pauseWorkflow(id: string) {
    return this.request<any>(`/workflows/${id}/pause`, {
      method: 'POST',
    });
  }

  async deleteWorkflow(id: string) {
    return this.request<{ deleted: boolean; archived: boolean; message: string; executionCount: number }>(
      `/workflows/${id}`,
      {
        method: 'DELETE',
      }
    );
  }

  async validateWorkflow(workflowOrId: any) {
    if (typeof workflowOrId === 'string') {
      return this.request<{ isValid: boolean; errors: any[]; warnings: any[]; topologicalOrder?: string[] }>(
        `/workflows/${workflowOrId}/validate`,
        { method: 'POST' }
      );
    }
    return this.request<{ isValid: boolean; errors: any[]; warnings: any[]; topologicalOrder?: string[] }>(
      '/workflows/validate',
      {
        method: 'POST',
        body: JSON.stringify(workflowOrId),
      }
    );
  }

  // Executions (Runs)
  async listExecutions(params?: {
    page?: number;
    limit?: number;
    workflowId?: string;
    status?: string;
    triggerType?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
    sortBy?: string;
    sortOrder?: 'asc' | 'desc';
  }) {
    const query = new URLSearchParams();
    if (params?.page) query.append('page', String(params.page));
    if (params?.limit) query.append('limit', String(params.limit));
    if (params?.workflowId) query.append('workflowId', params.workflowId);
    if (params?.status && params.status !== 'all') query.append('status', params.status);
    if (params?.triggerType && params.triggerType !== 'all') query.append('triggerType', params.triggerType);
    if (params?.startDate) query.append('startDate', params.startDate);
    if (params?.endDate) query.append('endDate', params.endDate);
    if (params?.search) query.append('search', params.search);
    if (params?.sortBy) query.append('sortBy', params.sortBy);
    if (params?.sortOrder) query.append('sortOrder', params.sortOrder);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<any[]>(`/runs${qs}`);
  }

  async getExecution(id: string) {
    return this.request<any>(`/runs/${id}`);
  }

  async getNodeExecutions(id: string) {
    return this.request<any[]>(`/runs/${id}/nodes`);
  }

  async getNodeExecution(runId: string, nodeExecutionId: string, options?: { limit?: number; offset?: number; level?: string }) {
    const query = new URLSearchParams();
    if (options?.limit) query.append('limit', String(options.limit));
    if (options?.offset) query.append('offset', String(options.offset));
    if (options?.level) query.append('level', options.level);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<any>(`/runs/${runId}/nodes/${nodeExecutionId}${qs}`);
  }

  getRunEventsUrl(runId: string): string {
    return `${this.baseUrl}/runs/${runId}/events`;
  }

  async createRun(workflowId: string, payload?: { input?: Record<string, any>; triggerType?: string }) {
    return this.request<any>(`/workflows/${workflowId}/runs`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  async retryRun(id: string) {
    return this.request<any>(`/runs/${id}/retry`, {
      method: 'POST',
    });
  }

  async triggerExecution(workflowId: string, payload?: { input?: Record<string, any>; triggerType?: string }) {
    return this.request<any>(`/runs/workflows/${workflowId}/run`, {
      method: 'POST',
      body: JSON.stringify(payload || {}),
    });
  }

  // Triggers
  async listTriggers(params?: { workflowId?: string; kind?: string }) {
    const query = new URLSearchParams();
    if (params?.workflowId) query.append('workflowId', params.workflowId);
    if (params?.kind) query.append('kind', params.kind);
    const qs = query.toString() ? `?${query.toString()}` : '';
    return this.request<any[]>(`/triggers${qs}`);
  }

  async createTrigger(trigger: any) {
    return this.request<any>('/triggers', {
      method: 'POST',
      body: JSON.stringify(trigger),
    });
  }

  // Workers
  async listWorkers() {
    return this.request<any[]>('/workers');
  }

  async getQueues() {
    return this.request<any[]>('/workers/queues');
  }

  // Settings
  async getSettings() {
    return this.request<any[]>('/settings');
  }

  async updateSetting(key: string, value: any, category?: string) {
    return this.request<any>(`/settings/${key}`, {
      method: 'PUT',
      body: JSON.stringify({ key, value, category }),
    });
  }
}

export const apiClient = new DormammuApiClient();
