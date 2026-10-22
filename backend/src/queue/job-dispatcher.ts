import { getTaskQueue, QUEUE_NAMES } from './queue.js';
import { checkRedisConnection } from './redis.js';
import { localQueueRunner, NodeJobData } from './local-queue-runner.js';
import { logger } from '../config/logger.js';

export class JobDispatcher {
  /**
   * Dispatches a ready DAG node as a durable job.
   * If Redis is connected, sends to BullMQ with idempotency key `${runId}:${nodeId}:${attempt}`.
   * If Redis is standby/offline, routes to the local queue runner seamlessly.
   */
  public static async dispatchNodeJob(jobData: NodeJobData): Promise<{ dispatchedTo: 'bullmq' | 'local'; jobId: string }> {
    const jobId = `${jobData.runId}:${jobData.nodeId}:${jobData.attempt}`;
    const redisStatus = await checkRedisConnection();

    if (redisStatus.connected) {
      try {
        const queue = getTaskQueue();
        await queue.add('execute-node', jobData, {
          jobId,
          delay: jobData.delayMs || 0,
          attempts: 1, // We control retries at DAG engine level for exact lifecycle tracking
          removeOnComplete: true,
          removeOnFail: false,
        });

        logger.info(
          { jobId, runId: jobData.runId, nodeId: jobData.nodeId, nodeType: jobData.nodeType },
          `Enqueued DAG node task to BullMQ queue [${QUEUE_NAMES.DEFAULT_TASKS}]`
        );
        return { dispatchedTo: 'bullmq', jobId };
      } catch (err: any) {
        logger.warn({ err: err?.message }, 'Failed to enqueue to BullMQ, falling back to local queue runner');
      }
    }

    localQueueRunner.enqueue(jobData);
    logger.info(
      { jobId, runId: jobData.runId, nodeId: jobData.nodeId, nodeType: jobData.nodeType },
      'Enqueued DAG node task to local queue runner'
    );
    return { dispatchedTo: 'local', jobId };
  }
}
