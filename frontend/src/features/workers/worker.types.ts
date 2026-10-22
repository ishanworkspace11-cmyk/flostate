export type WorkerStatus = 'idle' | 'busy' | 'offline' | 'paused';

export interface WorkerInstance {
  id: string;
  name: string;
  hostname: string;
  status: WorkerStatus;
  concurrency: number;
  currentJobs: Array<{
    jobId: string;
    executionId: string;
    nodeId: string;
    nodeLabel: string;
    startedAt: string;
  }>;
  completedJobsCount: number;
  failedJobsCount: number;
  uptimeSeconds: number;
  lastHeartbeat: string;
  isSimulated: boolean; // Explicit indicator as requested
}

export interface WorkerQueueSummary {
  queueName: string;
  activeCount: number;
  waitingCount: number;
  delayedCount: number;
  completedCount: number;
  failedCount: number;
  isSimulated: boolean;
}
