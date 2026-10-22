import { workflowRepository, WorkflowListFilters, WorkflowDeleteResult } from '../repositories/workflow.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { validateWorkflow } from '../engine/dag.validation.js';
import { Workflow, WorkflowNode, WorkflowEdge, WorkflowStatus, ValidationResult } from '../models/workflow.types.js';
import { createError } from '../middleware/error.middleware.js';

export class WorkflowService {
  async listWorkflows(filters?: WorkflowListFilters): Promise<{ workflows: Workflow[]; total: number }> {
    return workflowRepository.list(filters);
  }

  async getWorkflow(id: string, includeArchived = false): Promise<Workflow> {
    const wf = await workflowRepository.findById(id, includeArchived);
    if (!wf) {
      throw createError(404, `Workflow with ID '${id}' not found`, 'WORKFLOW_NOT_FOUND');
    }
    return wf;
  }

  async createWorkflow(data: {
    name: string;
    description?: string;
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
    status?: WorkflowStatus;
  }): Promise<Workflow> {
    const name = data.name.trim();
    if (!name) {
      throw createError(400, 'Workflow name cannot be empty', 'INVALID_WORKFLOW_NAME');
    }

    const created = await workflowRepository.create({
      name,
      description: data.description?.trim() || '',
      nodes: data.nodes || [],
      edges: data.edges || [],
      status: data.status || 'draft',
    });

    await auditRepository.log({
      action: 'WORKFLOW_CREATED',
      entityType: 'WORKFLOW',
      entityId: created.id,
      details: { name: created.name, draftVersion: created.draftVersion },
    });

    return created;
  }

  async updateWorkflow(
    id: string,
    updates: {
      name?: string;
      description?: string;
      nodes?: WorkflowNode[];
      edges?: WorkflowEdge[];
      status?: WorkflowStatus;
      expectedVersion?: number;
      changeSummary?: string;
    }
  ): Promise<Workflow> {
    const existing = await this.getWorkflow(id);

    if (updates.name !== undefined && !updates.name.trim()) {
      throw createError(400, 'Workflow name cannot be empty', 'INVALID_WORKFLOW_NAME');
    }

    // Validate graph structure if updating nodes or edges
    if (updates.nodes !== undefined || updates.edges !== undefined) {
      const candidateWf: Workflow = {
        ...existing,
        nodes: updates.nodes ?? existing.nodes,
        edges: updates.edges ?? existing.edges,
      };
      // Basic structure validation (endpoints exist)
      const nodeIds = new Set(candidateWf.nodes.map((n) => n.id));
      for (const e of candidateWf.edges) {
        if (!nodeIds.has(e.source) || !nodeIds.has(e.target)) {
          throw createError(
            400,
            `Malformed graph: Edge '${e.id}' references nonexistent node (source: '${e.source}', target: '${e.target}')`,
            'MALFORMED_GRAPH_STRUCTURE'
          );
        }
      }
    }

    const updated = await workflowRepository.update(id, {
      ...updates,
      name: updates.name?.trim(),
      description: updates.description?.trim(),
    });

    await auditRepository.log({
      action: 'WORKFLOW_UPDATED',
      entityType: 'WORKFLOW',
      entityId: id,
      details: {
        draftVersion: updated.draftVersion,
        nodeCount: updated.nodes.length,
        edgeCount: updated.edges.length,
        status: updated.status,
      },
    });

    return updated;
  }

  async duplicateWorkflow(id: string, newName?: string): Promise<Workflow> {
    const duplicated = await workflowRepository.duplicate(id, newName);

    await auditRepository.log({
      action: 'WORKFLOW_DUPLICATED',
      entityType: 'WORKFLOW',
      entityId: duplicated.id,
      details: {
        sourceWorkflowId: id,
        newName: duplicated.name,
      },
    });

    return duplicated;
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
      publishedVersion: wf.draftVersion,
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

  async activateWorkflow(id: string): Promise<Workflow> {
    const wf = await this.getWorkflow(id);

    if (wf.status === 'published') {
      return wf; // Already active
    }

    if (!wf.publishedVersion) {
      throw createError(
        400,
        'Cannot activate a draft workflow that has never been published. Please validate and publish first.',
        'INVALID_STATUS_TRANSITION'
      );
    }

    const updated = await workflowRepository.update(id, {
      status: 'published',
    });

    await auditRepository.log({
      action: 'WORKFLOW_ACTIVATED',
      entityType: 'WORKFLOW',
      entityId: id,
      details: { publishedVersion: updated.publishedVersion },
    });

    return updated;
  }

  async pauseWorkflow(id: string): Promise<Workflow> {
    const wf = await this.getWorkflow(id);

    if (wf.status === 'paused') {
      return wf; // Already paused
    }

    if (wf.status === 'draft') {
      throw createError(
        400,
        'Draft workflows cannot be paused. Only active published workflows can be paused.',
        'INVALID_STATUS_TRANSITION'
      );
    }

    const updated = await workflowRepository.update(id, {
      status: 'paused',
    });

    await auditRepository.log({
      action: 'WORKFLOW_PAUSED',
      entityType: 'WORKFLOW',
      entityId: id,
    });

    return updated;
  }

  async deleteWorkflow(id: string): Promise<WorkflowDeleteResult> {
    await this.getWorkflow(id, true); // Verify existence
    const result = await workflowRepository.delete(id);

    await auditRepository.log({
      action: result.archived ? 'WORKFLOW_ARCHIVED' : 'WORKFLOW_DELETED',
      entityType: 'WORKFLOW',
      entityId: id,
      details: { executionCount: result.executionCount, archived: result.archived },
    });

    return result;
  }

  async validateWorkflowById(id: string): Promise<ValidationResult> {
    const wf = await this.getWorkflow(id);
    return validateWorkflow(wf);
  }

  validate(workflow: Workflow): ValidationResult {
    return validateWorkflow(workflow);
  }
}

export const workflowService = new WorkflowService();
