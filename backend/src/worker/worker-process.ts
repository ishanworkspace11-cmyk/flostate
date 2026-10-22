import { Worker as BullMQWorker, Job } from 'bullmq';
import { getRedisClient, checkRedisConnection } from '../queue/redis.js';
import { QUEUE_NAMES } from '../queue/queue.js';
import { localQueueRunner, NodeJobData } from '../queue/local-queue-runner.js';
import { TaskProcessor } from './task-processor.js';
import { workerRepository } from '../repositories/worker.repository.js';
import { workerEventService } from '../services/worker-event.service.js';
import { WORKER_CONFIG } from '../config/worker.config.js';
import { logger } from '../config/logger.js';
import { WorkerErrorRecord, WorkerJob } from '../models/worker.types.js';
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
  private activeJobsMap: Map<string, WorkerJob> = new Map();
  private completedCount = 0;
  private failedCount = 0;
  private startedAt = Date.now();
  private registeredAt = new Date().toISOString();
  private isRunning = false;
  private isDraining = false;
  private lastError: WorkerErrorRecord | undefined = undefined;

  constructor(options: WorkerProcessOptions = {}) {
    this.hostname = os.hostname();
    this.workerId = options.workerId || process.env.WORKER_ID || `worker-${this.hostname}-${process.pid}`;
    this.concurrency = options.concurrency || Number(process.env.WORKER_CONCURRENCY) || 5;
    this.heartbeatIntervalMs = options.heartbeatIntervalMs || WORKER_CONFIG.HEARTBEAT_INTERVAL_MS;
  }

  public async start(): Promise<void> {
    if (this.isRunning) return;
    this.isRunning = true;
    this.isDraining = false;
    this.startedAt = Date.now();
    this.registeredAt = new Date().toISOString();

    logger.info(
      { workerId: this.workerId, hostname: this.hostname, concurrency: this.concurrency },
      `[Dormammu Worker] Starting worker instance`
    );

    // 1. Connect local queue runner to TaskProcessor
    localQueueRunner.registerHandler(async (jobData: NodeJobData) => {
      const activeKey = `${jobData.runId}:${jobData.nodeId}`;
      const jobInfo: WorkerJob = {
        jobId: activeKey,
        executionId: jobData.runId,
        nodeId: jobData.nodeId,
        nodeLabel: jobData.nodeLabel,
        startedAt: new Date().toISOString(),
      };
      this.activeJobsMap.set(activeKey, jobInfo);
      workerEventService.recordEvent(this.workerId, 'JOB_STARTED', {
        jobId: activeKey,
        runId: jobData.runId,
        nodeId: jobData.nodeId,
        nodeLabel: jobData.nodeLabel,
      });

      try {
        await TaskProcessor.processNodeJob(jobData);
        this.completedCount++;
        workerEventService.recordEvent(this.workerId, 'JOB_COMPLETED', {
          jobId: activeKey,
          runId: jobData.runId,
          nodeId: jobData.nodeId,
        });
      } catch (err: any) {
        this.failedCount++;
        const safeMsg = String(err?.message || err || 'Unknown execution error');
        this.lastError = {
          message: safeMsg,
          jobId: activeKey,
          nodeId: jobData.nodeId,
          timestamp: new Date().toISOString(),
        };
        workerEventService.recordEvent(this.workerId, 'JOB_FAILED', {
          jobId: activeKey,
          runId: jobData.runId,
          nodeId: jobData.nodeId,
          error: safeMsg,
        });
        throw err;
      } finally {
        this.activeJobsMap.delete(activeKey);
      }
    });

    // 2. Connect BullMQ worker if Redis is reachable
    const redisCheck = await checkRedisConnection();
    if (!this.isRunning) return;
    if (redisCheck.connected) {
      try {
        this.bullmqWorker = new BullMQWorker<NodeJobData>(
          QUEUE_NAMES.DEFAULT_TASKS,
          async (job: Job<NodeJobData>) => {
            const activeKey = `${job.data.runId}:${job.data.nodeId}`;
            const jobInfo: WorkerJob = {
              jobId: job.id || activeKey,
              executionId: job.data.runId,
              nodeId: job.data.nodeId,
              nodeLabel: job.data.nodeLabel,
              startedAt: new Date().toISOString(),
            };
            this.activeJobsMap.set(activeKey, jobInfo);
            workerEventService.recordEvent(this.workerId, 'JOB_STARTED', {
              jobId: job.id || activeKey,
              runId: job.data.runId,
              nodeId: job.data.nodeId,
              nodeLabel: job.data.nodeLabel,
            });

            try {
              await TaskProcessor.processNodeJob(job.data);
              this.completedCount++;
              workerEventService.recordEvent(this.workerId, 'JOB_COMPLETED', {
                jobId: job.id || activeKey,
                runId: job.data.runId,
                nodeId: job.data.nodeId,
              });
            } catch (err: any) {
              this.failedCount++;
              const safeMsg = String(err?.message || err || 'Unknown execution error');
              this.lastError = {
                message: safeMsg,
                jobId: job.id || activeKey,
                nodeId: job.data.nodeId,
                timestamp: new Date().toISOString(),
              };
              workerEventService.recordEvent(this.workerId, 'JOB_FAILED', {
                jobId: job.id || activeKey,
                runId: job.data.runId,
                nodeId: job.data.nodeId,
                error: safeMsg,
              });
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

    // 3. Register worker and initial heartbeat
    await this.recordHeartbeat();
    workerEventService.recordEvent(this.workerId, 'REGISTERED', {
      hostname: this.hostname,
      concurrency: this.concurrency,
    });

    this.heartbeatTimer = setInterval(() => {
      this.recordHeartbeat().catch((err) => {
        logger.debug({ err: err?.message }, 'Worker heartbeat update issue');
      });
    }, this.heartbeatIntervalMs);

    if (this.heartbeatTimer && typeof this.heartbeatTimer.unref === 'function') {
      this.heartbeatTimer.unref();
    }

    logger.info(`[Dormammu Worker] Worker [${this.workerId}] successfully initialized and ready`);
  }

  public async recordHeartbeat(): Promise<void> {
    const uptimeSeconds = Math.floor((Date.now() - this.startedAt) / 1000);
    const status = this.isDraining ? 'draining' : this.activeJobsMap.size > 0 ? 'busy' : 'idle';
    const currentJobs = Array.from(this.activeJobsMap.values());

    const mem = process.memoryUsage();
    const memoryUsage = {
      heapUsedMB: Math.round((mem.heapUsed / 1024 / 1024) * 10) / 10,
      heapTotalMB: Math.round((mem.heapTotal / 1024 / 1024) * 10) / 10,
      rssMB: Math.round((mem.rss / 1024 / 1024) * 10) / 10,
    };

    await workerRepository.recordHeartbeat(this.workerId, {
      name: this.workerId,
      hostname: this.hostname,
      status,
      concurrency: this.concurrency,
      currentJobs,
      completedJobsCount: this.completedCount,
      failedJobsCount: this.failedCount,
      uptimeSeconds,
      registeredAt: this.registeredAt,
      lastError: this.lastError,
      memoryUsage,
      isSimulated: false,
    });
  }

  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    logger.info(`[Dormammu Worker] Stopping worker [${this.workerId}]...`);

    // If active jobs are running, enter draining mode
    if (this.activeJobsMap.size > 0) {
      this.isDraining = true;
      workerEventService.recordEvent(this.workerId, 'DRAINING', {
        activeJobsCount: this.activeJobsMap.size,
      });

      // Pause/close BullMQ listener so no new jobs are pulled
      if (this.bullmqWorker) {
        await this.bullmqWorker.pause();
      }

      // Record draining status
      await this.recordHeartbeat();

      // Wait up to 5000ms for active jobs to complete
      const drainStart = Date.now();
      while (this.activeJobsMap.size > 0 && Date.now() - drainStart < 5000) {
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
    }

    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }

    if (this.bullmqWorker) {
      await this.bullmqWorker.close();
      this.bullmqWorker = null;
    }

    const shutdownInfo = {
      reason: 'Graceful shutdown',
      timestamp: new Date().toISOString(),
    };

    // Record final offline status
    await workerRepository.recordHeartbeat(this.workerId, {
      status: 'offline',
      currentJobs: [],
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      shutdownInfo,
    });

    workerEventService.recordEvent(this.workerId, 'OFFLINE', shutdownInfo);
    logger.info(`[Dormammu Worker] Worker [${this.workerId}] gracefully stopped.`);
  }
}

// Automatically start a default in-process worker listener so the API server can also run jobs locally
export const defaultWorker = new WorkerProcess();
if (process.env.AUTO_START_DEFAULT_WORKER !== 'false' && process.env.NODE_ENV !== 'test') {
  defaultWorker.start().catch((err) => {
    logger.debug({ err: err?.message }, 'Default worker auto-start notice');
  });
}
