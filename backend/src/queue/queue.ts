import { Queue } from 'bullmq';
import { getRedisClient } from './redis.js';

export const QUEUE_NAMES = {
  DEFAULT_TASKS: 'dormammu-tasks-default',
  HIGH_PRIO_TASKS: 'dormammu-tasks-high-prio',
} as const;

export interface WorkflowTaskJobData {
  executionId: string;
  workflowId: string;
  workflowVersion: number;
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  inputPayload: Record<string, unknown>;
  attempt: number;
}

let taskQueue: Queue<WorkflowTaskJobData> | null = null;
let highPrioQueue: Queue<WorkflowTaskJobData> | null = null;

export function getTaskQueue(): Queue<WorkflowTaskJobData> {
  if (!taskQueue) {
    taskQueue = new Queue<WorkflowTaskJobData>(QUEUE_NAMES.DEFAULT_TASKS, {
      connection: getRedisClient(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 1000,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return taskQueue;
}

export function getHighPrioQueue(): Queue<WorkflowTaskJobData> {
  if (!highPrioQueue) {
    highPrioQueue = new Queue<WorkflowTaskJobData>(QUEUE_NAMES.HIGH_PRIO_TASKS, {
      connection: getRedisClient(),
      defaultJobOptions: {
        attempts: 3,
        backoff: {
          type: 'exponential',
          delay: 500,
        },
        removeOnComplete: { count: 1000 },
        removeOnFail: { count: 5000 },
      },
    });
  }
  return highPrioQueue;
}

export async function getQueueMetrics() {
  try {
    const queue = getTaskQueue();
    const [waiting, active, completed, failed, delayed] = await Promise.all([
      queue.getWaitingCount(),
      queue.getActiveCount(),
      queue.getCompletedCount(),
      queue.getFailedCount(),
      queue.getDelayedCount(),
    ]);

    return {
      queueName: QUEUE_NAMES.DEFAULT_TASKS,
      waitingCount: waiting,
      activeCount: active,
      completedCount: completed,
      failedCount: failed,
      delayedCount: delayed,
      isSimulated: false,
    };
  } catch (_err) {
    // If Redis is not connected, provide a fallback metric object indicating queue is dormant
    return {
      queueName: QUEUE_NAMES.DEFAULT_TASKS,
      waitingCount: 0,
      activeCount: 0,
      completedCount: 0,
      failedCount: 0,
      delayedCount: 0,
      isSimulated: true,
      note: 'Redis queue is currently offline or standby',
    };
  }
}
