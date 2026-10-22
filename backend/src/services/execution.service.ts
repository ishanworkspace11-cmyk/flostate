import { executionRepository } from '../repositories/execution.repository.js';
import { workflowRepository } from '../repositories/workflow.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { BackendExecutionEngine } from '../engine/dag.engine.js';
import { durableDagOrchestrator } from '../engine/durable-dag.orchestrator.js';
import { Execution, NodeExecution, ExecutionSummary, ExecutionListFilters } from '../models/execution.types.js';
import { Workflow } from '../models/workflow.types.js';
import { sanitizePayload, sanitizeLogs } from '../utils/sanitizer.js';
import { createError } from '../middleware/error.middleware.js';

export class ExecutionService {
  async listExecutions(filters?: ExecutionListFilters): Promise<{ executions: ExecutionSummary[]; total: number }> {
    return executionRepository.list(filters);
  }

  async getExecution(id: string): Promise<Execution> {
    const run = await executionRepository.findById(id);
    if (!run) {
      throw createError(404, `Execution with ID '${id}' not found`, 'EXECUTION_NOT_FOUND');
    }

    // Sanitize secrets from payloads and node logs before serving
    const sanitizedNodeExecs: Record<string, NodeExecution> = {};
    for (const [nodeId, ne] of Object.entries(run.nodeExecutions || {})) {
      sanitizedNodeExecs[nodeId] = {
        ...ne,
        input: sanitizePayload(ne.input),
        output: sanitizePayload(ne.output),
        logs: sanitizeLogs(ne.logs || []),
      };
    }

    return {
      ...run,
      input: sanitizePayload(run.input) as Record<string, unknown>,
      output: run.output ? (sanitizePayload(run.output) as Record<string, unknown>) : null,
      nodeExecutions: sanitizedNodeExecs,
    };
  }

  async getNodeExecutions(id: string): Promise<NodeExecution[]> {
    const run = await executionRepository.findById(id);
    if (!run) {
      throw createError(404, `Execution with ID '${id}' not found`, 'EXECUTION_NOT_FOUND');
    }
    const nodes = await executionRepository.getNodeExecutions(id);
    return nodes.map((n) => ({
      ...n,
      input: sanitizePayload(n.input),
      output: sanitizePayload(n.output),
      logs: sanitizeLogs(n.logs || []),
    }));
  }

  async getNodeExecution(
    runId: string,
    nodeExecutionId: string,
    options?: { limit?: number; offset?: number; level?: string }
  ): Promise<NodeExecution & { totalLogs: number }> {
    const run = await executionRepository.findById(runId);
    if (!run) {
      throw createError(404, `Execution with ID '${runId}' not found`, 'EXECUTION_NOT_FOUND');
    }

    const node = await executionRepository.findNodeExecution(runId, nodeExecutionId);
    if (!node) {
      throw createError(
        404,
        `Node execution '${nodeExecutionId}' not found in run '${runId}'`,
        'NODE_EXECUTION_NOT_FOUND'
      );
    }

    let logs = node.logs || [];
    if (options?.level) {
      logs = logs.filter((l) => l.level === options.level);
    }
    const totalLogs = logs.length;
    const offset = Math.max(0, options?.offset || 0);
    const limit = Math.min(500, Math.max(1, options?.limit || 100));
    const paginatedLogs = logs.slice(offset, offset + limit);

    return {
      ...node,
      input: sanitizePayload(node.input),
      output: sanitizePayload(node.output),
      logs: sanitizeLogs(paginatedLogs),
      totalLogs,
    };
  }

  async createDurableRun(
    workflowId: string,
    options: { input?: Record<string, unknown>; triggerType?: string } = {}
  ): Promise<Execution> {
    const run = await durableDagOrchestrator.createRun(workflowId, {
      input: options.input,
      triggerType: options.triggerType || 'manual',
    });
    return this.getExecution(run.id);
  }

  async retryExecution(id: string): Promise<Execution> {
    const newRun = await durableDagOrchestrator.retryRun(id);
    return this.getExecution(newRun.id);
  }

  async triggerExecution(
    workflowId: string,
    options: {
      input?: Record<string, unknown>;
      triggerType?: 'manual' | 'webhook' | 'cron';
    } = {}
  ): Promise<Execution> {
    const workflow = await workflowRepository.findById(workflowId);
    if (!workflow) {
      throw createError(404, `Workflow with ID '${workflowId}' not found`, 'WORKFLOW_NOT_FOUND');
    }

    // If published, execute the published immutable snapshot; otherwise execute latest draft
    const version = workflow.publishedVersion
      ? await workflowRepository.getVersion(workflowId, workflow.publishedVersion)
      : await workflowRepository.getLatestVersion(workflowId);

    const executableWorkflow: Workflow = version
      ? {
          ...workflow,
          nodes: version.nodes,
          edges: version.edges,
          draftVersion: version.version,
        }
      : workflow;

    // Execute through engine
    const executionResult = await BackendExecutionEngine.execute(executableWorkflow, {
      initialInput: options.input || {},
      triggerType: options.triggerType || 'manual',
    });

    // Save to repository (linking to workflowVersionId)
    const saved = await executionRepository.save(executionResult, version?.id);

    await auditRepository.log({
      action: 'EXECUTION_TRIGGERED',
      entityType: 'EXECUTION',
      entityId: saved.id,
      details: {
        workflowId,
        workflowVersion: saved.workflowVersion,
        triggerType: saved.triggerType,
        status: saved.status,
      },
    });

    return this.getExecution(saved.id);
  }
}

export const executionService = new ExecutionService();
