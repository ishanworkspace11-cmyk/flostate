import { prisma } from '../database/prisma.js';
import { isDatabaseAvailable } from '../database/db-status.js';
import { WorkerInstance, WorkerQueueSummary } from '../models/worker.types.js';
import { store } from '../services/store.service.js';
import { logger } from '../config/logger.js';
import { getAllQueueSummaries } from '../queue/queue.js';
import { evaluateWorkerStatus } from '../config/worker.config.js';
import { WorkerStatus as PrismaWorkerStatus } from '@prisma/client';

export class WorkerRepository {
  private static async checkDb(): Promise<boolean> {
    return isDatabaseAvailable();
  }

  async listWorkers(options: { status?: string; includeSimulated?: boolean } = {}): Promise<WorkerInstance[]> {
    let workers: WorkerInstance[] = [];
    const hasDb = await WorkerRepository.checkDb();

    if (hasDb) {
      try {
        const records = await prisma.workerInstance.findMany({
          orderBy: { lastHeartbeat: 'desc' },
        });

        if (records.length > 0) {
          workers = records.map((r) => {
            const metadata = (r.metadata as any) || {};
            return {
              id: r.id,
              name: r.name,
              hostname: r.hostname,
              status: r.status.toLowerCase() as any,
              concurrency: r.concurrency,
              currentJobs: (r.currentJobs as any) || [],
              completedJobsCount: r.completedJobsCount,
              failedJobsCount: r.failedJobsCount,
              uptimeSeconds: r.uptimeSeconds,
              registeredAt: metadata.registeredAt || r.createdAt.toISOString(),
              lastHeartbeat: r.lastHeartbeat.toISOString(),
              isSimulated: r.isSimulated,
              lastError: metadata.lastError,
              shutdownInfo: metadata.shutdownInfo,
              memoryUsage: metadata.memoryUsage,
            };
          });
        }
      } catch (err) {
        logger.error({ err }, 'Error listing workers from DB, falling back to memory store');
      }
    }

    if (workers.length === 0) {
      workers = await store.getWorkers();
    }

    // Dynamically evaluate status based on elapsed time since last heartbeat
    const now = Date.now();
    let evaluated = workers.map((w) => evaluateWorkerStatus(w, now));

    if (!options.includeSimulated) {
      evaluated = evaluated.filter((w) => !w.isSimulated);
    }

    if (options.status && options.status !== 'all') {
      const target = options.status.toLowerCase();
      evaluated = evaluated.filter((w) => w.status.toLowerCase() === target);
    }

    return evaluated;
  }

  async findWorkerById(id: string): Promise<WorkerInstance | null> {
    const hasDb = await WorkerRepository.checkDb();
    let worker: WorkerInstance | null = null;

    if (hasDb) {
      try {
        const record = await prisma.workerInstance.findUnique({
          where: { id },
        });

        if (record) {
          const metadata = (record.metadata as any) || {};
          worker = {
            id: record.id,
            name: record.name,
            hostname: record.hostname,
            status: record.status.toLowerCase() as any,
            concurrency: record.concurrency,
            currentJobs: (record.currentJobs as any) || [],
            completedJobsCount: record.completedJobsCount,
            failedJobsCount: record.failedJobsCount,
            uptimeSeconds: record.uptimeSeconds,
            registeredAt: metadata.registeredAt || record.createdAt.toISOString(),
            lastHeartbeat: record.lastHeartbeat.toISOString(),
            isSimulated: record.isSimulated,
            lastError: metadata.lastError,
            shutdownInfo: metadata.shutdownInfo,
            memoryUsage: metadata.memoryUsage,
          };
        }
      } catch (err) {
        logger.error({ err }, `Error finding worker ${id} in DB, falling back`);
      }
    }

    if (!worker) {
      worker = await store.getWorkerById(id);
    }

    if (!worker) return null;

    return evaluateWorkerStatus(worker, Date.now());
  }

  async recordHeartbeat(id: string, data: {
    status?: string;
    concurrency?: number;
    currentJobs?: any[];
    completedJobsCount?: number;
    failedJobsCount?: number;
    uptimeSeconds?: number;
    hostname?: string;
    name?: string;
    registeredAt?: string;
    lastError?: any;
    shutdownInfo?: any;
    memoryUsage?: any;
    isSimulated?: boolean;
  }): Promise<void> {
    const now = new Date();
    const hasDb = await WorkerRepository.checkDb();

    if (hasDb) {
      try {
        let prismaStatus: PrismaWorkerStatus = PrismaWorkerStatus.IDLE;
        if (data.status) {
          const s = data.status.toUpperCase();
          if (s === 'BUSY') prismaStatus = PrismaWorkerStatus.BUSY;
          else if (s === 'OFFLINE') prismaStatus = PrismaWorkerStatus.OFFLINE;
          else if (s === 'PAUSED') prismaStatus = PrismaWorkerStatus.PAUSED;
          else prismaStatus = PrismaWorkerStatus.IDLE;
        }

        await prisma.workerInstance.upsert({
          where: { id },
          update: {
            lastHeartbeat: now,
            status: prismaStatus,
            concurrency: data.concurrency,
            currentJobs: data.currentJobs as any,
            completedJobsCount: data.completedJobsCount,
            failedJobsCount: data.failedJobsCount,
            uptimeSeconds: data.uptimeSeconds,
            metadata: {
              registeredAt: data.registeredAt,
              lastError: data.lastError,
              shutdownInfo: data.shutdownInfo,
              memoryUsage: data.memoryUsage,
              actualStatus: data.status,
            } as any,
          },
          create: {
            id,
            name: data.name || id,
            hostname: data.hostname || 'localhost',
            status: prismaStatus,
            concurrency: data.concurrency || 5,
            currentJobs: data.currentJobs as any,
            completedJobsCount: data.completedJobsCount || 0,
            failedJobsCount: data.failedJobsCount || 0,
            uptimeSeconds: data.uptimeSeconds || 0,
            lastHeartbeat: now,
            isSimulated: data.isSimulated || false,
            metadata: {
              registeredAt: data.registeredAt || now.toISOString(),
              lastError: data.lastError,
              shutdownInfo: data.shutdownInfo,
              memoryUsage: data.memoryUsage,
              actualStatus: data.status,
            } as any,
          },
        });
      } catch (err) {
        logger.error({ err }, 'Error recording worker heartbeat in DB');
      }
    }

    await store.recordWorkerHeartbeat(id, {
      ...data,
      status: data.status ? (data.status.toLowerCase() as any) : undefined,
    });
  }

  async getQueueSummaries(): Promise<WorkerQueueSummary[]> {
    return getAllQueueSummaries();
  }

  async clearWorkers(): Promise<void> {
    const hasDb = await WorkerRepository.checkDb();
    if (hasDb) {
      try {
        await prisma.workerInstance.deleteMany({});
      } catch (err) {
        logger.error({ err }, 'Error clearing workers in DB');
      }
    }
    await store.clearWorkers();
  }
}

export const workerRepository = new WorkerRepository();
