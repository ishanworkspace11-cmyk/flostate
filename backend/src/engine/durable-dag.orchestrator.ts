import { Workflow, WorkflowNode } from '../models/workflow.types.js';
import { Execution, NodeExecution, ExecutionLogEntry } from '../models/execution.types.js';
import { workflowRepository } from '../repositories/workflow.repository.js';
import { executionRepository } from '../repositories/execution.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { validateWorkflow } from './dag.validation.js';
import { JobDispatcher } from '../queue/job-dispatcher.js';
import { NodeJobData } from '../queue/local-queue-runner.js';
import { RetryRecoveryManager } from './retry-recovery.manager.js';
import { executionEventBus } from './execution-events.js';
import { createError } from '../middleware/error.middleware.js';
import { logger } from '../config/logger.js';

function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

export interface CreateRunOptions {
  input?: Record<string, unknown>;
  triggerType?: string;
  sync?: boolean;
  timeoutMs?: number;
}

export class DurableDagOrchestrator {
  /**
   * Creates a durable DAG run, initializes execution and node records,
   * schedules ready nodes as durable jobs, and returns the run record immediately.
   */
  public async createRun(workflowId: string, options: CreateRunOptions = {}): Promise<Execution> {
    const workflow = await workflowRepository.findById(workflowId);
    if (!workflow) {
      throw createError(404, `Workflow with ID '${workflowId}' not found`, 'WORKFLOW_NOT_FOUND');
    }

    // Load immutable published snapshot version (or latest version in dev/test)
    const versionNumber = workflow.publishedVersion ?? workflow.draftVersion;
    const version = await workflowRepository.getVersion(workflowId, versionNumber);

    const activeWorkflow: Workflow = version
      ? {
          ...workflow,
          nodes: version.nodes,
          edges: version.edges,
          draftVersion: version.version,
        }
      : workflow;

    // Validate graph and calculate dependencies
    const validation = validateWorkflow(activeWorkflow);
    if (!validation.isValid) {
      throw createError(
        400,
        `Cannot execute invalid workflow: ${validation.errors.map((e) => e.message).join('; ')}`,
        'WORKFLOW_VALIDATION_FAILED',
        validation.errors
      );
    }

    const executionId = generateId('run');
    const startedAt = new Date().toISOString();
    const triggerType = options.triggerType || 'manual';
    const workflowInput = options.input || {};

    // Dependency maps
    const nodeMap = new Map<string, WorkflowNode>(activeWorkflow.nodes.map((n) => [n.id, n]));
    const parentMap = new Map<string, string[]>();
    for (const node of activeWorkflow.nodes) {
      parentMap.set(node.id, []);
    }
    for (const edge of activeWorkflow.edges) {
      if (parentMap.has(edge.target)) {
        parentMap.get(edge.target)!.push(edge.source);
      }
    }

    // Initialize all NodeExecution records to 'Pending'
    const nodeExecutions: Record<string, NodeExecution> = {};
    for (const node of activeWorkflow.nodes) {
      nodeExecutions[node.id] = {
        id: generateId('node_run'),
        executionId,
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.type,
        status: 'Pending',
        attempt: 1,
        input: null,
        output: null,
        startedAt: null,
        completedAt: null,
        durationMs: 0,
        logs: [],
      };
    }

    // Identify initial ready nodes (nodes with 0 upstream parents)
    const initialReadyNodeIds = activeWorkflow.nodes
      .filter((n) => (parentMap.get(n.id) || []).length === 0)
      .map((n) => n.id);

    // Transition initial ready nodes to 'Ready'
    for (const nodeId of initialReadyNodeIds) {
      const node = nodeMap.get(nodeId);
      if (nodeExecutions[nodeId] && node) {
        nodeExecutions[nodeId].status = 'Ready';
        nodeExecutions[nodeId].input = {
          workflowInput,
          upstream: {},
          payload: workflowInput,
        };
      }
    }

    // Create overall Execution record
    const execution: Execution = {
      id: executionId,
      workflowId: activeWorkflow.id,
      workflowName: activeWorkflow.name,
      workflowVersion: versionNumber,
      triggerType,
      status: 'Running',
      input: workflowInput,
      output: null,
      startedAt,
      completedAt: null,
      durationMs: undefined,
      error: null,
      nodeExecutions,
    };

    // Persist run and all node executions
    const saved = await executionRepository.createRun(execution, version?.id);

    // Publish initial run status and ready nodes to event stream
    executionEventBus.publish(executionId, 'run_state', {
      id: executionId,
      status: 'Running',
      startedAt,
      workflowId: activeWorkflow.id,
      workflowName: activeWorkflow.name,
      workflowVersion: versionNumber,
    });

    for (const nodeId of initialReadyNodeIds) {
      executionEventBus.publish(executionId, 'node_state', {
        nodeId,
        status: 'Ready',
      });
    }

    await auditRepository.log({
      action: 'EXECUTION_CREATED',
      entityType: 'EXECUTION',
      entityId: executionId,
      details: {
        workflowId: activeWorkflow.id,
        workflowVersion: versionNumber,
        initialReadyNodes: initialReadyNodeIds,
      },
    });

    // Schedule all initial ready nodes as durable jobs
    for (const nodeId of initialReadyNodeIds) {
      const node = nodeMap.get(nodeId)!;
      const jobData: NodeJobData = {
        runId: executionId,
        workflowId: activeWorkflow.id,
        workflowVersion: versionNumber,
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: node.label,
        config: node.config || {},
        workflowInput,
        upstreamOutputs: {},
        payload: workflowInput,
        attempt: 1,
        maxAttempts: 3,
      };

      await JobDispatcher.dispatchNodeJob(jobData);
    }

    // If synchronous execution requested (for test assertion or inline callers), wait for completion
    if (options.sync) {
      return this.waitForCompletion(executionId, options.timeoutMs || 10000);
    }

    return saved;
  }

  /**
   * Handles completion of a node execution by a worker.
   * Manages status transitions, child scheduling, error propagation, retries, and run completion.
   */
  public async handleNodeCompletion(
    jobData: NodeJobData,
    result: {
      success: boolean;
      output?: any;
      error?: string;
      logs: ExecutionLogEntry[];
      attempt: number;
      durationMs: number;
    }
  ): Promise<void> {
    const execution = await executionRepository.findById(jobData.runId);
    if (!execution) {
      logger.error({ runId: jobData.runId }, 'Orchestrator could not find execution for completed job');
      return;
    }

    const version = await workflowRepository.getVersion(jobData.workflowId, jobData.workflowVersion);
    const nodes = version?.nodes || [];
    const edges = version?.edges || [];

    const parentMap = new Map<string, string[]>();
    const childMap = new Map<string, string[]>();
    const nodeMap = new Map<string, WorkflowNode>();

    for (const n of nodes) {
      nodeMap.set(n.id, n);
      parentMap.set(n.id, []);
      childMap.set(n.id, []);
    }
    for (const e of edges) {
      if (parentMap.has(e.target)) parentMap.get(e.target)!.push(e.source);
      if (childMap.has(e.source)) childMap.get(e.source)!.push(e.target);
    }

    const completedAt = new Date().toISOString();

    if (result.success) {
      // 1. Mark node as Succeeded
      await executionRepository.updateNodeExecution(jobData.runId, jobData.nodeId, {
        status: 'Succeeded',
        output: result.output,
        logs: result.logs,
        attempt: result.attempt,
        durationMs: result.durationMs,
        completedAt,
        error: null,
      });

      // Stream node state transition
      executionEventBus.publish(jobData.runId, 'node_state', {
        nodeId: jobData.nodeId,
        nodeLabel: jobData.nodeLabel,
        status: 'Succeeded',
        attempt: result.attempt,
        durationMs: result.durationMs,
        output: result.output,
      });

      // 2. Refresh node executions
      const updatedExec = await executionRepository.findById(jobData.runId);
      const allNodeExecs = updatedExec?.nodeExecutions || {};

      // 3. Check downstream children of this node
      const children = childMap.get(jobData.nodeId) || [];
      for (const childId of children) {
        const childNode = nodeMap.get(childId);
        const childExec = allNodeExecs[childId];
        if (!childNode || !childExec || childExec.status !== 'Pending') continue;

        const parents = parentMap.get(childId) || [];
        const allParentsSucceeded = parents.every((pId) => allNodeExecs[pId]?.status === 'Succeeded');

        if (allParentsSucceeded) {
          // Prepare child inputs
          const upstreamOutputs: Record<string, unknown> = {};
          let lastParentOutput: unknown = null;
          for (const pId of parents) {
            const pOutput = allNodeExecs[pId]?.output;
            upstreamOutputs[pId] = pOutput;
            lastParentOutput = pOutput;
          }

          const childInput = {
            workflowInput: execution.input,
            upstream: upstreamOutputs,
            payload: lastParentOutput !== null ? lastParentOutput : execution.input,
          };

          // Mark child as Ready
          await executionRepository.updateNodeExecution(jobData.runId, childId, {
            status: 'Ready',
            input: childInput,
          });

          executionEventBus.publish(jobData.runId, 'node_state', {
            nodeId: childId,
            status: 'Ready',
          });

          // Dispatch child job
          const childJobData: NodeJobData = {
            runId: jobData.runId,
            workflowId: jobData.workflowId,
            workflowVersion: jobData.workflowVersion,
            nodeId: childNode.id,
            nodeType: childNode.type,
            nodeLabel: childNode.label,
            config: childNode.config || {},
            workflowInput: execution.input,
            upstreamOutputs,
            payload: childInput.payload,
            attempt: 1,
            maxAttempts: 3,
          };

          await JobDispatcher.dispatchNodeJob(childJobData);
        }
      }

      // 4. Check if the entire workflow has finished
      await this.evaluateRunCompletion(jobData.runId, nodes, childMap);
    } else {
      // Node failed
      const currentAttempt = result.attempt;
      const maxAttempts = jobData.maxAttempts || 3;
      const retryEval = RetryRecoveryManager.evaluateFailure(result.error, currentAttempt, maxAttempts);

      if (retryEval.shouldRetry) {
        // Retry node with backoff
        await executionRepository.updateNodeExecution(jobData.runId, jobData.nodeId, {
          status: 'Retrying',
          error: `${result.error} (Attempt ${currentAttempt}/${maxAttempts})`,
          logs: result.logs,
          attempt: currentAttempt,
        });

        executionEventBus.publish(jobData.runId, 'node_state', {
          nodeId: jobData.nodeId,
          nodeLabel: jobData.nodeLabel,
          status: 'Retrying',
          attempt: currentAttempt,
          error: result.error,
        });

        logger.info(
          { runId: jobData.runId, nodeId: jobData.nodeId, nextAttempt: currentAttempt + 1 },
          `Scheduling retry for node "${jobData.nodeLabel}" with backoff ${retryEval.backoffDelayMs}ms`
        );

        const retryJobData: NodeJobData = {
          ...jobData,
          attempt: currentAttempt + 1,
          delayMs: retryEval.backoffDelayMs,
        };

        await JobDispatcher.dispatchNodeJob(retryJobData);
      } else {
        // Permanent failure: mark node as Failed
        await executionRepository.updateNodeExecution(jobData.runId, jobData.nodeId, {
          status: 'Failed',
          error: result.error || 'Execution failure',
          logs: result.logs,
          attempt: currentAttempt,
          durationMs: result.durationMs,
          completedAt,
        });

        executionEventBus.publish(jobData.runId, 'node_state', {
          nodeId: jobData.nodeId,
          nodeLabel: jobData.nodeLabel,
          status: 'Failed',
          attempt: currentAttempt,
          error: result.error,
          durationMs: result.durationMs,
        });

        // Downstream failure propagation: Mark all reachable descendant nodes as Skipped
        const skippedNodeIds = new Set<string>();
        const queue = [...(childMap.get(jobData.nodeId) || [])];

        while (queue.length > 0) {
          const curr = queue.shift()!;
          if (!skippedNodeIds.has(curr)) {
            skippedNodeIds.add(curr);
            const nextChildren = childMap.get(curr) || [];
            queue.push(...nextChildren);
          }
        }

        for (const skippedId of skippedNodeIds) {
          const skipReason = `Skipped because upstream dependency "${jobData.nodeLabel}" failed.`;
          await executionRepository.updateNodeExecution(jobData.runId, skippedId, {
            status: 'Skipped',
            error: skipReason,
            completedAt,
            logs: [
              {
                timestamp: completedAt,
                level: 'warn',
                message: skipReason,
              },
            ],
          });

          executionEventBus.publish(jobData.runId, 'node_state', {
            nodeId: skippedId,
            status: 'Skipped',
            error: skipReason,
          });
        }

        // Evaluate run completion
        await this.evaluateRunCompletion(jobData.runId, nodes, childMap);
      }
    }
  }

  /**
   * Checks whether all nodes in the DAG have reached terminal states and finalizes run status.
   */
  private async evaluateRunCompletion(
    runId: string,
    nodes: WorkflowNode[],
    childMap: Map<string, string[]>
  ): Promise<void> {
    const execution = await executionRepository.findById(runId);
    if (!execution || ['Succeeded', 'Failed', 'Cancelled'].includes(execution.status)) {
      return;
    }

    const allExecs = Object.values(execution.nodeExecutions);
    const isAnyActive = allExecs.some((n) => ['Pending', 'Ready', 'Running', 'Retrying'].includes(n.status));

    if (!isAnyActive) {
      const completedAt = new Date().toISOString();
      const startedAtMs = new Date(execution.startedAt).getTime();
      const completedAtMs = new Date(completedAt).getTime();
      const durationMs = completedAtMs - startedAtMs;

      const hasFailures = allExecs.some((n) => n.status === 'Failed');
      const allSkipped = allExecs.every((n) => n.status === 'Skipped');

      if (hasFailures) {
        const failedNodes = allExecs.filter((n) => n.status === 'Failed');
        const errorMsg = `Workflow failed in nodes: ${failedNodes.map((n) => `"${n.nodeLabel}" (${n.error})`).join('; ')}`;
        await executionRepository.updateExecution(runId, {
          status: 'Failed',
          error: errorMsg,
          completedAt,
          durationMs,
        });

        executionEventBus.publish(runId, 'run_state', {
          status: 'Failed',
          error: errorMsg,
          completedAt,
          durationMs,
        });
        executionEventBus.publish(runId, 'close', {
          status: 'Failed',
          error: errorMsg,
          completedAt,
          durationMs,
        });
        executionEventBus.cleanupRun(runId);
      } else if (allSkipped && allExecs.length > 0) {
        await executionRepository.updateExecution(runId, {
          status: 'Skipped',
          error: 'All workflow nodes were skipped.',
          completedAt,
          durationMs,
        });

        executionEventBus.publish(runId, 'run_state', {
          status: 'Skipped',
          error: 'All workflow nodes were skipped.',
          completedAt,
          durationMs,
        });
        executionEventBus.publish(runId, 'close', {
          status: 'Skipped',
          completedAt,
          durationMs,
        });
        executionEventBus.cleanupRun(runId);
      } else {
        // Succeeded! Find terminal nodes (nodes with 0 outgoing edges)
        const terminalNodes = nodes.filter((n) => (childMap.get(n.id) || []).length === 0);
        let finalOutput: any = {};
        if (terminalNodes.length === 1) {
          finalOutput = execution.nodeExecutions[terminalNodes[0].id]?.output || {};
        } else {
          for (const tNode of terminalNodes) {
            finalOutput[tNode.id] = execution.nodeExecutions[tNode.id]?.output || null;
          }
        }

        await executionRepository.updateExecution(runId, {
          status: 'Succeeded',
          output: finalOutput,
          completedAt,
          durationMs,
        });

        executionEventBus.publish(runId, 'run_state', {
          status: 'Succeeded',
          output: finalOutput,
          completedAt,
          durationMs,
        });
        executionEventBus.publish(runId, 'close', {
          status: 'Succeeded',
          completedAt,
          durationMs,
        });
        executionEventBus.cleanupRun(runId);
      }
    }
  }

  /**
   * Resumes and retries a failed run by creating a new child execution attempt.
   * NEVER mutates the original failed run record, keeping execution history authentic.
   * Succeeded nodes from previous run are reused; failed/skipped nodes are re-executed.
   */
  public async retryRun(runId: string): Promise<Execution> {
    const execution = await executionRepository.findById(runId);
    if (!execution) {
      throw createError(404, `Execution with ID '${runId}' not found`, 'EXECUTION_NOT_FOUND');
    }

    // Eligibility check: cannot retry active runs
    if (['Running', 'Pending', 'Ready'].includes(execution.status)) {
      throw createError(
        409,
        `Cannot retry execution in active status '${execution.status}'. Wait for the run to complete or cancel it first.`,
        'CONFLICT_RUN_ACTIVE'
      );
    }

    // Eligibility check: cannot retry succeeded runs
    if (execution.status === 'Succeeded') {
      throw createError(
        400,
        'Execution has already succeeded. Succeeded runs are not eligible for retry.',
        'RUN_ALREADY_SUCCEEDED'
      );
    }

    // Eligibility check: must be Failed or Cancelled
    if (execution.status !== 'Failed' && execution.status !== 'Cancelled') {
      throw createError(
        400,
        `Cannot retry execution in status '${execution.status}'. Only failed executions can be retried.`,
        'INVALID_EXECUTION_STATUS'
      );
    }

    // Attempt limit check
    const currentAttempt = execution.retryAttempt || 1;
    if (currentAttempt >= 5) {
      throw createError(
        400,
        'Maximum retry attempts (5) exceeded for this workflow execution.',
        'MAX_RETRIES_EXCEEDED'
      );
    }

    const currentWf = await workflowRepository.findById(execution.workflowId);
    const versionNumberToUse = currentWf?.publishedVersion || execution.workflowVersion;
    const version = await workflowRepository.getVersion(execution.workflowId, versionNumberToUse);
    const nodes = version?.nodes || [];
    const edges = version?.edges || [];

    const parentMap = new Map<string, string[]>();
    const childMap = new Map<string, string[]>();
    const nodeMap = new Map<string, WorkflowNode>();

    for (const n of nodes) {
      nodeMap.set(n.id, n);
      parentMap.set(n.id, []);
      childMap.set(n.id, []);
    }
    for (const e of edges) {
      if (parentMap.has(e.target)) parentMap.get(e.target)!.push(e.source);
      if (childMap.has(e.source)) childMap.get(e.source)!.push(e.target);
    }

    // Create a NEW execution record for the retry attempt (never mutating original run)
    const newRunId = generateId('run');
    const startedAt = new Date().toISOString();
    const nodeExecutions: Record<string, NodeExecution> = {};

    // Copy forward succeeded nodes, reset failed/skipped nodes to Pending
    for (const node of nodes) {
      const origNodeExec = execution.nodeExecutions[node.id];
      if (origNodeExec && origNodeExec.status === 'Succeeded') {
        // Node previously succeeded: carry forward its outputs and state
        nodeExecutions[node.id] = {
          id: generateId('node_run'),
          executionId: newRunId,
          nodeId: node.id,
          nodeLabel: node.label,
          nodeType: node.type,
          status: 'Succeeded',
          attempt: origNodeExec.attempt || 1,
          input: origNodeExec.input,
          output: origNodeExec.output,
          startedAt: origNodeExec.startedAt,
          completedAt: origNodeExec.completedAt,
          durationMs: origNodeExec.durationMs,
          logs: origNodeExec.logs || [],
          error: null,
        };
      } else {
        // Node failed, skipped, or was pending: initialize fresh Pending node for retry
        nodeExecutions[node.id] = {
          id: generateId('node_run'),
          executionId: newRunId,
          nodeId: node.id,
          nodeLabel: node.label,
          nodeType: node.type,
          status: 'Pending',
          attempt: (origNodeExec?.attempt || 0) + 1,
          input: null,
          output: null,
          startedAt: null,
          completedAt: null,
          durationMs: 0,
          logs: [],
          error: null,
        };
      }
    }

    // Identify ready nodes among the pending ones (where all parents are Succeeded)
    const readyNodesToDispatch: string[] = [];
    for (const node of nodes) {
      if (nodeExecutions[node.id].status === 'Pending') {
        const parents = parentMap.get(node.id) || [];
        const allParentsSucceeded = parents.every((pId) => nodeExecutions[pId]?.status === 'Succeeded');
        if (allParentsSucceeded) {
          readyNodesToDispatch.push(node.id);
        }
      }
    }

    // Prepare inputs for ready nodes
    for (const nodeId of readyNodesToDispatch) {
      const parents = parentMap.get(nodeId) || [];
      const upstreamOutputs: Record<string, unknown> = {};
      let lastParentOutput: unknown = null;
      for (const pId of parents) {
        const pOutput = nodeExecutions[pId]?.output;
        upstreamOutputs[pId] = pOutput;
        lastParentOutput = pOutput;
      }

      const input = {
        workflowInput: execution.input,
        upstream: upstreamOutputs,
        payload: lastParentOutput !== null ? lastParentOutput : execution.input,
      };

      nodeExecutions[nodeId].status = 'Ready';
      nodeExecutions[nodeId].input = input;
    }

    const newExecution: Execution = {
      id: newRunId,
      workflowId: execution.workflowId,
      workflowName: execution.workflowName,
      workflowVersion: versionNumberToUse,
      triggerType: 'retry',
      status: 'Running',
      input: execution.input,
      output: null,
      startedAt,
      completedAt: null,
      durationMs: undefined,
      error: null,
      retryOfRunId: execution.id,
      retryAttempt: currentAttempt + 1,
      nodeExecutions,
    };

    // Save newly created retry execution
    const saved = await executionRepository.createRun(newExecution, version?.id);

    await auditRepository.log({
      action: 'EXECUTION_RETRIED',
      entityType: 'EXECUTION',
      entityId: newRunId,
      details: {
        originalRunId: execution.id,
        retryAttempt: currentAttempt + 1,
        readyNodes: readyNodesToDispatch,
      },
    });

    // Stream initial state for the new retry run
    executionEventBus.publish(newRunId, 'run_state', {
      id: newRunId,
      status: 'Running',
      startedAt,
      workflowId: execution.workflowId,
      retryOfRunId: execution.id,
      retryAttempt: currentAttempt + 1,
    });

    // Dispatch ready jobs to workers
    for (const nodeId of readyNodesToDispatch) {
      const node = nodeMap.get(nodeId)!;
      const parents = parentMap.get(nodeId) || [];
      const upstreamOutputs: Record<string, unknown> = {};
      let lastParentOutput: unknown = null;
      for (const pId of parents) {
        const pOutput = nodeExecutions[pId]?.output;
        upstreamOutputs[pId] = pOutput;
        lastParentOutput = pOutput;
      }

      const jobData: NodeJobData = {
        runId: newRunId,
        workflowId: execution.workflowId,
        workflowVersion: versionNumberToUse,
        nodeId: node.id,
        nodeType: node.type,
        nodeLabel: node.label,
        config: node.config || {},
        workflowInput: execution.input,
        upstreamOutputs,
        payload: nodeExecutions[nodeId].input && (nodeExecutions[nodeId].input as any).payload !== undefined
          ? (nodeExecutions[nodeId].input as any).payload
          : execution.input,
        attempt: nodeExecutions[nodeId].attempt,
        maxAttempts: 3,
      };

      await JobDispatcher.dispatchNodeJob(jobData);
    }

    return saved;
  }

  /**
   * Helper to await execution completion (used in sync mode or tests)
   */
  public async waitForCompletion(executionId: string, timeoutMs = 10000): Promise<Execution> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const exec = await executionRepository.findById(executionId);
      if (exec && ['Succeeded', 'Failed', 'Skipped', 'Cancelled'].includes(exec.status)) {
        return exec;
      }
      await new Promise((r) => setTimeout(r, 50));
    }
    return (await executionRepository.findById(executionId))!;
  }
}

export const durableDagOrchestrator = new DurableDagOrchestrator();
