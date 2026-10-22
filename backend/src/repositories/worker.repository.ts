import { prisma } from '../database/prisma.js';
import { isDatabaseAvailable } from '../database/db-status.js';
import { WorkerInstance, WorkerQueueSummary } from '../models/worker.types.js';
import { store } from '../services/store.service.js';
import { logger } from '../config/logger.js';
import { getQueueMetrics } from '../queue/queue.js';
import { WorkerStatus as PrismaWorkerStatus } from '@prisma/client';

export class WorkerRepository {
  private static async checkDb(): Promise<boolean> {
    return isDatabaseAvailable();
  }

  async listWorkers(): Promise<WorkerInstance[]> {
    const hasDb = await WorkerRepository.checkDb();
    if (hasDb) {
      try {
        const records = await prisma.workerInstance.findMany({
          orderBy: { lastHeartbeat: 'desc' },
        });

        if (records.length > 0) {
          return records.map((r) => ({
            id: r.id,
            name: r.name,
            hostname: r.hostname,
            status: r.status.toLowerCase() as any,
            concurrency: r.concurrency,
            currentJobs: (r.currentJobs as any) || [],
            completedJobsCount: r.completedJobsCount,
            failedJobsCount: r.failedJobsCount,
            uptimeSeconds: r.uptimeSeconds,
            lastHeartbeat: r.lastHeartbeat.toISOString(),
            isSimulated: r.isSimulated,
          }));
        }
      } catch (err) {
        logger.error({ err }, 'Error listing workers from DB, falling back');
      }
    }
    return store.getWorkers();
  }

  async recordHeartbeat(id: string, data: {
    status?: string;
    concurrency?: number;
    currentJobs?: any[];
    completedJobsCount?: number;
    failedJobsCount?: number;
    uptimeSeconds?: number;
  }): Promise<void> {
    const hasDb = await WorkerRepository.checkDb();
    if (hasDb) {
      try {
        await prisma.workerInstance.update({
          where: { id },
          data: {
            lastHeartbeat: new Date(),
            status: data.status ? (data.status.toUpperCase() as PrismaWorkerStatus) : undefined,
            concurrency: data.concurrency,
            currentJobs: data.currentJobs as any,
            completedJobsCount: data.completedJobsCount,
            failedJobsCount: data.failedJobsCount,
            uptimeSeconds: data.uptimeSeconds,
          },
        });
      } catch (err) {
        logger.error({ err }, 'Error recording worker heartbeat in DB');
      }
    }
  }

  async getQueueSummaries(): Promise<WorkerQueueSummary[]> {
    const metrics = await getQueueMetrics();
    const fallbackQueues = await store.getQueues();
    if (!metrics.isSimulated) {
      return [
        metrics,
        {
          queueName: 'dormammu-tasks-high-prio',
          activeCount: 0,
          waitingCount: 0,
          delayedCount: 0,
          completedCount: 0,
          failedCount: 0,
          isSimulated: false,
        },
      ];
    }
    return fallbackQueues;
  }
}

export const workerRepository = new WorkerRepository();
