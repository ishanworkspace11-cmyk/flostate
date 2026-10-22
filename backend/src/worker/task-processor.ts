import { NodeJobData } from '../queue/local-queue-runner.js';
import { NodeExecutorRegistry, NodeExecutionContext } from '../engine/node-executor.registry.js';
import { durableDagOrchestrator } from '../engine/durable-dag.orchestrator.js';
import { executionRepository } from '../repositories/execution.repository.js';
import { ExecutionLogEntry } from '../models/execution.types.js';
import { logger } from '../config/logger.js';

export class TaskProcessor {
  /**
   * Processes a single ready DAG node job.
   */
  public static async processNodeJob(jobData: NodeJobData): Promise<void> {
    const startedAt = new Date().toISOString();
    const startTimeMs = Date.now();
    const logs: ExecutionLogEntry[] = [];

    const log = (level: ExecutionLogEntry['level'], message: string, details?: unknown) => {
      logs.push({
        timestamp: new Date().toISOString(),
        level,
        message,
        details,
      });
    };

    // 1. Transition NodeExecution to 'Running'
    await executionRepository.updateNodeExecution(jobData.runId, jobData.nodeId, {
      status: 'Running',
      startedAt,
      attempt: jobData.attempt,
    });

    log('info', `Worker started task for node "${jobData.nodeLabel}" (${jobData.nodeType}) [Attempt ${jobData.attempt}]`);

    const abortController = new AbortController();
    const context: NodeExecutionContext = {
      runId: jobData.runId,
      nodeId: jobData.nodeId,
      nodeLabel: jobData.nodeLabel,
      workflowInput: jobData.workflowInput,
      upstreamOutputs: jobData.upstreamOutputs,
      payload: jobData.payload,
      attempt: jobData.attempt,
      maxAttempts: jobData.maxAttempts,
      log,
      abortSignal: abortController.signal,
    };

    try {
      const executor = NodeExecutorRegistry.get(jobData.nodeType);
      const output = await executor.execute(
        {
          id: jobData.nodeId,
          type: jobData.nodeType as any,
          label: jobData.nodeLabel,
          position: { x: 0, y: 0 },
          config: jobData.config,
        },
        context
      );

      const durationMs = Date.now() - startTimeMs;
      log('info', `Node "${jobData.nodeLabel}" completed successfully in ${durationMs}ms`);

      await durableDagOrchestrator.handleNodeCompletion(jobData, {
        success: true,
        output,
        logs,
        attempt: jobData.attempt,
        durationMs,
      });
    } catch (err: any) {
      const durationMs = Date.now() - startTimeMs;
      const errorMsg = err?.message || 'Node execution failed';
      log('error', `Node "${jobData.nodeLabel}" failed: ${errorMsg}`);

      logger.warn(
        { runId: jobData.runId, nodeId: jobData.nodeId, attempt: jobData.attempt, err: errorMsg },
        'TaskProcessor node execution failure'
      );

      await durableDagOrchestrator.handleNodeCompletion(jobData, {
        success: false,
        error: errorMsg,
        logs,
        attempt: jobData.attempt,
        durationMs,
      });
    }
  }
}
