import { workerRepository } from '../repositories/worker.repository.js';
import { workerEventService } from './worker-event.service.js';
import { checkRedisConnection } from '../queue/redis.js';
import { getQueueMetrics } from '../queue/queue.js';
import {
  WorkerInstance,
  WorkerQueueSummary,
  SystemExecutionHealth,
  WorkerEvent,
  WorkerEventType,
} from '../models/worker.types.js';

export class WorkerService {
  async getWorkers(options: { status?: string; includeSimulated?: boolean } = {}): Promise<{
    workers: WorkerInstance[];
    meta: {
      total: number;
      onlineCount: number;
      busyCount: number;
      idleCount: number;
      drainingCount: number;
      staleCount: number;
      offlineCount: number;
      unknownCount: number;
    };
  }> {
    const workers = await workerRepository.listWorkers(options);

    const onlineCount = workers.filter((w) => w.status === 'idle' || w.status === 'busy').length;
    const busyCount = workers.filter((w) => w.status === 'busy').length;
    const idleCount = workers.filter((w) => w.status === 'idle').length;
    const drainingCount = workers.filter((w) => w.status === 'draining').length;
    const staleCount = workers.filter((w) => w.status === 'stale').length;
    const offlineCount = workers.filter((w) => w.status === 'offline').length;
    const unknownCount = workers.filter((w) => w.status === 'unknown').length;

    return {
      workers,
      meta: {
        total: workers.length,
        onlineCount,
        busyCount,
        idleCount,
        drainingCount,
        staleCount,
        offlineCount,
        unknownCount,
      },
    };
  }

  async getWorkerById(id: string): Promise<WorkerInstance | null> {
    return workerRepository.findWorkerById(id);
  }

  async getQueues(): Promise<WorkerQueueSummary[]> {
    return workerRepository.getQueueSummaries();
  }

  async getQueueMetrics(): Promise<WorkerQueueSummary> {
    return getQueueMetrics();
  }

  async getSystemHealth(): Promise<SystemExecutionHealth> {
    const { workers } = await this.getWorkers({ includeSimulated: false });
    const queues = await this.getQueues();
    const redisCheck = await checkRedisConnection();

    const onlineWorkers = workers.filter((w) => w.status === 'idle' || w.status === 'busy').length;
    const drainingWorkers = workers.filter((w) => w.status === 'draining').length;
    const staleWorkers = workers.filter((w) => w.status === 'stale').length;
    const offlineWorkers = workers.filter((w) => w.status === 'offline').length;

    const totalQueueDepth = queues.reduce((acc, q) => acc + q.waitingCount + q.activeCount, 0);
    const activeJobsCount = queues.reduce((acc, q) => acc + q.activeCount, 0);

    let status: 'healthy' | 'degraded' | 'critical' = 'healthy';
    if (onlineWorkers === 0 && totalQueueDepth > 0) {
      status = 'critical';
    } else if (onlineWorkers === 0 || staleWorkers > 0 || !redisCheck.connected) {
      status = 'degraded';
    }

    return {
      status,
      totalWorkers: workers.length,
      onlineWorkers,
      drainingWorkers,
      staleWorkers,
      offlineWorkers,
      totalQueueDepth,
      activeJobsCount,
      redisConnected: redisCheck.connected,
      runnerMode: redisCheck.connected ? 'bullmq-distributed' : 'local-durable-runner',
      timestamp: new Date().toISOString(),
    };
  }

  async recordHeartbeat(
    workerId: string,
    data: {
      name?: string;
      hostname?: string;
      status?: string;
      concurrency?: number;
      currentJobs?: any[];
      completedJobsCount?: number;
      failedJobsCount?: number;
      uptimeSeconds?: number;
      registeredAt?: string;
      lastError?: any;
      shutdownInfo?: any;
      memoryUsage?: any;
    }
  ): Promise<void> {
    await workerRepository.recordHeartbeat(workerId, data);
    workerEventService.recordEvent(workerId, 'HEARTBEAT', {
      status: data.status,
      activeJobsCount: data.currentJobs?.length || 0,
      completedJobsCount: data.completedJobsCount,
      failedJobsCount: data.failedJobsCount,
    });
  }

  async getEvents(options: { workerId?: string; type?: WorkerEventType; limit?: number } = {}): Promise<WorkerEvent[]> {
    return workerEventService.getEvents(options);
  }
}

export const workerService = new WorkerService();
