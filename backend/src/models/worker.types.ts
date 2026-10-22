export type WorkerStatus = 'idle' | 'busy' | 'draining' | 'offline' | 'stale' | 'unknown' | 'paused';

export interface WorkerJob {
  jobId: string;
  executionId: string;
  nodeId: string;
  nodeLabel: string;
  startedAt: string;
}

export interface WorkerErrorRecord {
  message: string;
  jobId?: string;
  nodeId?: string;
  timestamp: string;
}

export interface WorkerShutdownInfo {
  reason: string;
  timestamp: string;
  drainedJobsCount?: number;
}

export interface WorkerMemoryUsage {
  heapUsedMB: number;
  heapTotalMB: number;
  rssMB: number;
}

export interface WorkerInstance {
  id: string;
  name: string;
  hostname: string;
  status: WorkerStatus;
  concurrency: number;
  currentJobs: WorkerJob[];
  completedJobsCount: number;
  failedJobsCount: number;
  uptimeSeconds: number;
  registeredAt: string;
  lastHeartbeat: string;
  isSimulated: boolean;
  isOnline?: boolean;
  lastError?: WorkerErrorRecord;
  shutdownInfo?: WorkerShutdownInfo;
  memoryUsage?: WorkerMemoryUsage;
}

export type WorkerEventType =
  | 'REGISTERED'
  | 'HEARTBEAT'
  | 'JOB_STARTED'
  | 'JOB_COMPLETED'
  | 'JOB_FAILED'
  | 'DRAINING'
  | 'OFFLINE'
  | 'ERROR';

export interface WorkerEvent {
  id: string;
  workerId: string;
  type: WorkerEventType;
  timestamp: string;
  details?: Record<string, any>;
}

export interface WorkerQueueSummary {
  queueName: string;
  activeCount: number;
  waitingCount: number;
  delayedCount: number;
  completedCount: number;
  failedCount: number;
  isSimulated: boolean;
  isExact: boolean;
  driver: 'bullmq' | 'in-memory-runner';
  note?: string;
}

export interface SystemExecutionHealth {
  status: 'healthy' | 'degraded' | 'critical';
  totalWorkers: number;
  onlineWorkers: number;
  drainingWorkers: number;
  staleWorkers: number;
  offlineWorkers: number;
  totalQueueDepth: number;
  activeJobsCount: number;
  redisConnected: boolean;
  runnerMode: 'bullmq-distributed' | 'local-durable-runner';
  timestamp: string;
}
