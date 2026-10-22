import { executionRepository } from '../repositories/execution.repository.js';
import { workflowRepository } from '../repositories/workflow.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { BackendExecutionEngine } from '../engine/dag.engine.js';
import { Execution } from '../models/execution.types.js';
import { createError } from '../middleware/error.middleware.js';

export class ExecutionService {
  async listExecutions(filters?: { workflowId?: string; status?: string; page?: number; limit?: number }) {
    return executionRepository.list(filters);
  }

  async getExecution(id: string): Promise<Execution> {
    const run = await executionRepository.findById(id);
    if (!run) {
      throw createError(404, `Execution with ID '${id}' not found`, 'EXECUTION_NOT_FOUND');
    }
    return run;
  }

  async triggerExecution(workflowId: string, options: {
    input?: Record<string, unknown>;
    triggerType?: 'manual' | 'webhook' | 'cron';
  } = {}): Promise<Execution> {
    const workflow = await workflowRepository.findById(workflowId);
    if (!workflow) {
      throw createError(404, `Workflow with ID '${workflowId}' not found`, 'WORKFLOW_NOT_FOUND');
    }

    const version = await workflowRepository.getLatestVersion(workflowId);

    // Execute through engine
    const executionResult = await BackendExecutionEngine.execute(workflow, {
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
