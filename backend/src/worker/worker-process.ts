import { Worker as BullMQWorker, Job } from 'bullmq';
import { getRedisClient, checkRedisConnection } from '../queue/redis.js';
import { QUEUE_NAMES } from '../queue/queue.js';
import { localQueueRunner, NodeJobData } from '../queue/local-queue-runner.js';
import { TaskProcessor } from './task-processor.js';
import { workerRepository } from '../repositories/worker.repository.js';
import { logger } from '../config/logger.js';
import os from 'os';

export interface WorkerProcessOptions {
  workerId?: string;
  concurrency?: number;
  heartbeatIntervalMs?: number;
}

export class WorkerProcess {
  public readonly workerId: string;
  public readonly hostname: string;
  public readonly concurrency: number;
  private heartbeatIntervalMs: number;
  private bullmqWorker: BullMQWorker<NodeJobData> | null = null;
  private heartbeatTimer: NodeJS.Timeout | null = null;
  private activeJobsMap: Map<string, { jobId: string; executionId: string; nodeId: string; nodeLabel: string; startedAt: string }> = new Map();
  private completedCount = 0;
  private failedCount = 0;
  private startedAt = Date.now();
  private isRunning = false;

  constructor(options: WorkerProcessOptions = {}) {
    this.hostname = os.hostname();
    this.workerId = options.workerId || process.env.WORKER_ID || `worker-${this.hostname}-${process.pid}`;
    this.concurrency = options.concurrency || Number(process.env.WORKER_CONCURRENCY) || 5;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || 10000;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.startedAt = Date.now();

    logger.info(
      { workerId: this.workerId, hostname: this.hostname, concurrency: this.concurrency },
      `[Dormammu Worker] Starting worker instance`
    );

    // 1. Connect local queue runner to TaskProcessor
    localQueueRunner.registerHandler(async (jobData: NodeJobData) => {
      const activeKey = `${jobData.runId}:${jobData.nodeId}`;
      this.activeJobsMap.set(activeKey, {
        jobId: activeKey,
        executionId: jobData.runId,
        nodeId: jobData.nodeId,
        nodeLabel: jobData.nodeLabel,
        startedAt: new Date().toISOString(),
      });

      try {
        await TaskProcessor.processNodeJob(jobData);
        this.completedCount++;
      } catch (err) {
        this.failedCount++;
        throw err;
      } finally {
        this.activeJobsMap.delete(activeKey);
      }
    });

    // 2. Connect BullMQ worker if Redis is reachable
    const redisCheck = await checkRedisConnection();
    if (redisCheck.connected) {
      try {
        this.bullmqWorker = new BullMQWorker<NodeJobData>(
          QUEUE_NAMES.DEFAULT_TASKS,
          async (job: Job<NodeJobData>) => {
            const activeKey = `${job.data.runId}:${job.data.nodeId}`;
            this.activeJobsMap.set(activeKey, {
              jobId: job.id || activeKey,
              executionId: job.data.runId,
              nodeId: job.data.nodeId,
              nodeLabel: job.data.nodeLabel,
              startedAt: new Date().toISOString(),
            });

            try {
              await TaskProcessor.processNodeJob(job.data);
              this.completedCount++;
            } catch (err) {
              this.failedCount++;
              throw err;
            } finally {
              this.activeJobsMap.delete(activeKey);
            }
          },
          {
            connection: getRedisClient(),
            concurrency: this.concurrency,
          }
        );

        this.bullmqWorker.on('error', (err) => {
          logger.warn({ err: err.message }, 'BullMQ Worker connection issue');
        });

        logger.info(`[Dormammu Worker] BullMQ worker listening on queue [${QUEUE_NAMES.DEFAULT_TASKS}]`);
      } catch (err: any) {
        logger.warn({ err: err?.message }, 'Failed to start BullMQ worker, running on local runner');
      }
    } else {
      logger.info('[Dormammu Worker] Redis queue offline/standby; local queue runner is active');
    }

    // 3. Register heartbeat recording
    await this.recordHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      this.recordHeartbeat().catch((err) => {
        logger.debug({ err: err?.message }, 'Worker heartbeat update issue');
      });
    }, this.heartbeatIntervalMs);

    logger.info(`[Dormammu Worker] Worker [${this.workerId}] successfully initialized and ready`);
  }

  private async recordHeartbeat(): Promise<void> {
    const uptimeSeconds = Math.floor((Date.now() - this.startedAt) / 1000);
    const status = this.activeJobsMap.size > 0 ? 'busy' : 'idle';
    const currentJobs = Array.from(this.activeJobsMap.values());

    await workerRepository.recordHeartbeat(this.workerId, {
      name: this.workerId,
      hostname: this.hostname,
      status,
      concurrency: this.concurrency,
      currentJobs,
      completedJobsCount: this.completedCount,
      failedJobsCount: this.failedCount,
      uptimeSeconds,
    });
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    logger.info(`[Dormammu Worker] Stopping worker [${this.workerId}]...`);

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.bullmqWorker) {
      await this.bullmqWorker.close();
      this.bullmqWorker = null;
    }

    // Record offline status
    await workerRepository.recordHeartbeat(this.workerId, {
      status: 'offline',
      currentJobs: [],
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
    });

    logger.info(`[Dormammu Worker] Worker [${this.workerId}] gracefully stopped.`);
  }
}

// Automatically start a default in-process worker listener so the API server can also run jobs locally
export const defaultWorker = new WorkerProcess();
defaultWorker.start().catch((err) => {
  logger.debug({ err: err?.message }, 'Default worker auto-start notice');
});
