import { executionRepository } from '../repositories/execution.repository.js';
import { workflowRepository } from '../repositories/workflow.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { BackendExecutionEngine } from '../engine/dag.engine.js';
import { durableDagOrchestrator } from '../engine/durable-dag.orchestrator.js';
import { Execution, NodeExecution, ExecutionSummary, ExecutionListFilters } from '../models/execution.types.js';
import { Workflow } from '../models/workflow.types.js';
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
    return run;
  }

  async getNodeExecutions(id: string): Promise<NodeExecution[]> {
    const run = await executionRepository.findById(id);
    if (!run) {
      throw createError(404, `Execution with ID '${id}' not found`, 'EXECUTION_NOT_FOUND');
    }
    return executionRepository.getNodeExecutions(id);
  }

  async createDurableRun(
    workflowId: string,
    options: { input?: Record<string, unknown>; triggerType?: string } = {}
  ): Promise<Execution> {
    return durableDagOrchestrator.createRun(workflowId, {
      input: options.input,
      triggerType: options.triggerType || 'manual',
    });
  }

  async retryExecution(id: string): Promise<Execution> {
    return durableDagOrchestrator.retryRun(id);
  }

  async triggerExecution(workflowId: string, options: {
    input?: Record<string, unknown>;
    triggerType?: 'manual' | 'webhook' | 'cron';
  } = {}): Promise<Execution> {
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

    return saved;
  }
}

export const executionService = new ExecutionService();
