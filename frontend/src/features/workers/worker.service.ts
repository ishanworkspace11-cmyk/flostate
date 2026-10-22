import { apiClient } from '../../lib/api-client';
import {
  WorkerInstance,
  WorkerQueueSummary,
  WorkerEvent,
  SystemExecutionHealth,
} from './worker.types';

export const DEMO_WORKERS: WorkerInstance[] = [
  {
    id: 'worker-node-alpha-1',
    name: 'Worker Alpha 1 (Standard Tasks)',
    hostname: 'runner-01.us-east.dormammu.internal',
    status: 'busy',
    concurrency: 5,
    currentJobs: [
      {
        jobId: 'job_4891',
        executionId: 'run-91823',
        nodeId: 'node-enrich-company',
        nodeLabel: 'Enrich via Clearbit API',
        startedAt: '2026-10-22T08:14:02.060Z',
      },
    ],
    completedJobsCount: 1240,
    failedJobsCount: 14,
    uptimeSeconds: 864200,
    registeredAt: '2026-10-15T09:30:00.000Z',
    lastHeartbeat: new Date(Date.now() - 4000).toISOString(),
    isSimulated: true,
    isOnline: true,
  },
  {
    id: 'worker-node-alpha-2',
    name: 'Worker Alpha 2 (Standard Tasks)',
    hostname: 'runner-02.us-east.dormammu.internal',
    status: 'idle',
    concurrency: 5,
    currentJobs: [],
    completedJobsCount: 1195,
    failedJobsCount: 8,
    uptimeSeconds: 864150,
    registeredAt: '2026-10-15T09:35:00.000Z',
    lastHeartbeat: new Date(Date.now() - 2000).toISOString(),
    isSimulated: true,
    isOnline: true,
  },
  {
    id: 'worker-node-gpu-1',
    name: 'Worker High-Memory / Batch 1',
    hostname: 'runner-batch-01.eu-central.dormammu.internal',
    status: 'idle',
    concurrency: 2,
    currentJobs: [],
    completedJobsCount: 432,
    failedJobsCount: 2,
    uptimeSeconds: 312000,
    registeredAt: '2026-10-18T12:00:00.000Z',
    lastHeartbeat: new Date(Date.now() - 5000).toISOString(),
    isSimulated: true,
    isOnline: true,
  },
  {
    id: 'worker-node-edge-1',
    name: 'Worker Edge Dispatcher',
    hostname: 'runner-edge-01.ap-south.dormammu.internal',
    status: 'idle',
    concurrency: 10,
    currentJobs: [],
    completedJobsCount: 2890,
    failedJobsCount: 19,
    uptimeSeconds: 1420000,
    registeredAt: '2026-10-10T08:00:00.000Z',
    lastHeartbeat: new Date(Date.now() - 1000).toISOString(),
    isSimulated: true,
    isOnline: true,
  },
];

export const DEMO_QUEUES: WorkerQueueSummary[] = [
  {
    queueName: 'dormammu-default-tasks',
    activeCount: 1,
    waitingCount: 0,
    delayedCount: 0,
    completedCount: 3840,
    failedCount: 28,
    isSimulated: true,
    isExact: false,
    driver: 'bullmq',
    note: 'Simulated demonstration queue',
  },
  {
    queueName: 'dormammu-delayed-timers',
    activeCount: 0,
    waitingCount: 0,
    delayedCount: 3,
    completedCount: 890,
    failedCount: 0,
    isSimulated: true,
    isExact: false,
    driver: 'bullmq',
    note: 'Simulated demonstration queue',
  },
  {
    queueName: 'dormammu-webhook-dispatches',
    activeCount: 0,
    waitingCount: 0,
    delayedCount: 0,
    completedCount: 1420,
    failedCount: 5,
    isSimulated: true,
    isExact: false,
    driver: 'bullmq',
    note: 'Simulated demonstration queue',
  },
];

export const WorkerService = {
  async getWorkers(params?: { status?: string; includeSimulated?: boolean }): Promise<WorkerInstance[]> {
    try {
      const response = await apiClient.listWorkers(params);
      if (response.success && Array.isArray(response.data)) {
        return response.data;
      }
    } catch (_err) {
      // Fallback
    }
    return [];
  },

  async getWorkerById(id: string): Promise<WorkerInstance | null> {
    try {
      const response = await apiClient.getWorker(id);
      if (response.success && response.data) {
        return response.data;
      }
    } catch (_err) {
      // Fallback
    }
    return null;
  },

  async getQueues(): Promise<WorkerQueueSummary[]> {
    try {
      const response = await apiClient.getQueues();
      if (response.success && Array.isArray(response.data)) {
        return response.data;
      }
    } catch (_err) {
      // Fallback
    }
    return [];
  },

  async getEvents(params?: { workerId?: string; limit?: number }): Promise<WorkerEvent[]> {
    try {
      const response = await apiClient.getWorkerEvents(params);
      if (response.success && Array.isArray(response.data)) {
        return response.data;
      }
    } catch (_err) {
      // Fallback
    }
    return [];
  },

  async getHealth(): Promise<SystemExecutionHealth | null> {
    try {
      const response = await apiClient.getSystemHealth();
      if (response.success && response.data) {
        return response.data;
      }
    } catch (_err) {
      // Fallback
    }
    return null;
  },

  getDemoWorkers(): WorkerInstance[] {
    return DEMO_WORKERS;
  },

  getDemoQueues(): WorkerQueueSummary[] {
    return DEMO_QUEUES;
  },
};
