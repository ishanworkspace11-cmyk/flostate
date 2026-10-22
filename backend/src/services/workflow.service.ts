import { workflowRepository } from '../repositories/workflow.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { validateWorkflow } from '../engine/dag.validation.js';
import { Workflow, WorkflowNode, WorkflowEdge, WorkflowStatus, ValidationResult } from '../models/workflow.types.js';
import { createError } from '../middleware/error.middleware.js';

export class WorkflowService {
  async listWorkflows(filters?: { search?: string; status?: string }): Promise<Workflow[]> {
    return workflowRepository.list(filters);
  }

  async getWorkflow(id: string): Promise<Workflow> {
    const wf = await workflowRepository.findById(id);
    if (!wf) {
      throw createError(404, `Workflow with ID '${id}' not found`, 'WORKFLOW_NOT_FOUND');
    }
    return wf;
  }

  async createWorkflow(data: {
    name: string;
    description?: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    status?: WorkflowStatus;
  }): Promise<Workflow> {
    const created = await workflowRepository.create(data);
    await auditRepository.log({
      action: 'WORKFLOW_CREATED',
      entityType: 'WORKFLOW',
      entityId: created.id,
      details: { name: created.name, draftVersion: created.draftVersion },
    });
    return created;
  }

  async updateWorkflow(id: string, updates: {
    name?: string;
    description?: string;
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
    status?: WorkflowStatus;
    changeSummary?: string;
  }): Promise<Workflow> {
    await this.getWorkflow(id); // Ensures existence
    const updated = await workflowRepository.update(id, updates);
    await auditRepository.log({
      action: 'WORKFLOW_UPDATED',
      entityType: 'WORKFLOW',
      entityId: id,
      details: {
        draftVersion: updated.draftVersion,
        nodeCount: updated.nodes.length,
        edgeCount: updated.edges.length,
      },
    });
    return updated;
  }

  async publishWorkflow(id: string): Promise<Workflow> {
    const wf = await this.getWorkflow(id);
    const validation = validateWorkflow(wf);
    if (!validation.isValid) {
      throw createError(
        400,
        `Cannot publish invalid workflow: ${validation.errors.map((e) => e.message).join('; ')}`,
        'WORKFLOW_VALIDATION_FAILED',
        validation.errors
      );
    }

    const updated = await workflowRepository.update(id, {
      status: 'published',
      changeSummary: `Published version ${wf.draftVersion}`,
    });

    await auditRepository.log({
      action: 'WORKFLOW_PUBLISHED',
      entityType: 'WORKFLOW',
      entityId: id,
      details: { publishedVersion: updated.draftVersion },
    });

    return updated;
  }

  async deleteWorkflow(id: string): Promise<boolean> {
    await this.getWorkflow(id);
    const deleted = await workflowRepository.delete(id);
    await auditRepository.log({
      action: 'WORKFLOW_DELETED',
      entityType: 'WORKFLOW',
      entityId: id,
    });
    return deleted;
  }

  validate(workflow: Workflow): ValidationResult {
    return validateWorkflow(workflow);
  }
}

export const workflowService = new WorkflowService();
