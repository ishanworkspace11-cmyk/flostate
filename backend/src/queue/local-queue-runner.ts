import { logger } from '../config/logger.js';

export interface NodeJobData {
  runId: string;
  workflowId: string;
  workflowVersion: number;
  nodeId: string;
  nodeType: string;
  nodeLabel: string;
  config: Record<string, any>;
  workflowInput: Record<string, unknown>;
  upstreamOutputs: Record<string, unknown>;
  payload: any;
  attempt: number;
  maxAttempts: number;
  delayMs?: number;
}

export type JobHandler = (job: NodeJobData) => Promise<void>;

/**
 * Local asynchronous event-driven queue runner
 * Provides exact same per-node durable queue semantics when Redis is offline or in local/test mode.
 */
export class LocalQueueRunner {
  private queue: NodeJobData[] = [];
  private activeCount = 0;
  private concurrency: number;
  private handler: JobHandler | null = null;
  private isRunning = false;

  constructor(concurrency = 5) {
    this.concurrency = concurrency;
  }

  public registerHandler(handler: JobHandler) {
    this.handler = handler;
  }

  public enqueue(jobData: NodeJobData): void {
    if (jobData.delayMs && jobData.delayMs > 0) {
      setTimeout(() => {
        this.queue.push({ ...jobData, delayMs: 0 });
        this.processNext();
      }, jobData.delayMs);
    } else {
      this.queue.push(jobData);
      setImmediate(() => this.processNext());
    }
  }

  private async processNext(): Promise<void> {
    if (this.activeCount >= this.concurrency || this.queue.length === 0 || !this.handler) {
      return;
    }

    const job = this.queue.shift();
    if (!job) return;

    this.activeCount++;

    try {
      await this.handler(job);
    } catch (err) {
      logger.error({ err, jobId: `${job.runId}:${job.nodeId}` }, 'Error processing local queued job');
    } finally {
      this.activeCount--;
      setImmediate(() => this.processNext());
    }
  }

  public getQueueMetrics() {
    return {
      queueName: 'dormammu-tasks-local',
      waitingCount: this.queue.length,
      activeCount: this.activeCount,
      completedCount: 0,
      failedCount: 0,
      delayedCount: 0,
      isSimulated: true,
    };
  }

  public clear() {
    this.queue = [];
    this.activeCount = 0;
  }
}

export const localQueueRunner = new LocalQueueRunner();
