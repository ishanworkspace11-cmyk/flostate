import { WorkerInstance, WorkerQueueSummary } from './worker.types';

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
    lastHeartbeat: new Date(Date.now() - 4000).toISOString(),
    isSimulated: true,
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
    lastHeartbeat: new Date(Date.now() - 2000).toISOString(),
    isSimulated: true,
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
    lastHeartbeat: new Date(Date.now() - 5000).toISOString(),
    isSimulated: true,
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
    lastHeartbeat: new Date(Date.now() - 1000).toISOString(),
    isSimulated: true,
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
  },
  {
    queueName: 'dormammu-delayed-timers',
    activeCount: 0,
    waitingCount: 0,
    delayedCount: 3,
    completedCount: 890,
    failedCount: 0,
    isSimulated: true,
  },
  {
    queueName: 'dormammu-webhook-dispatches',
    activeCount: 0,
    waitingCount: 0,
    delayedCount: 0,
    completedCount: 1420,
    failedCount: 5,
    isSimulated: true,
  },
];

export const WorkerService = {
  getWorkers(): WorkerInstance[] {
    return DEMO_WORKERS;
  },

  getQueues(): WorkerQueueSummary[] {
    return DEMO_QUEUES;
  },
};
