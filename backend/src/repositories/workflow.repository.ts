import { prisma } from '../database/prisma.js';
import { isDatabaseAvailable } from '../database/db-status.js';
import { Workflow, WorkflowNode, WorkflowEdge, WorkflowStatus } from '../models/workflow.types.js';
import { store } from '../services/store.service.js';
import { logger } from '../config/logger.js';
import { createError } from '../middleware/error.middleware.js';
import { WorkflowStatus as PrismaWorkflowStatus } from '@prisma/client';
import { randomUUID } from 'crypto';

export interface WorkflowListFilters {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  includeArchived?: boolean;
}

export interface WorkflowDeleteResult {
  deleted: boolean;
  archived: boolean;
  message: string;
  executionCount: number;
}

export class WorkflowRepository {
  private static async checkDb(): Promise<boolean> {
    return isDatabaseAvailable();
  }

  async list(filters?: WorkflowListFilters): Promise<{ workflows: Workflow[]; total: number }> {
    const hasDb = await WorkflowRepository.checkDb();
    const page = Math.max(1, filters?.page || 1);
    const limit = Math.min(100, Math.max(1, filters?.limit || 20));
    const skip = (page - 1) * limit;

    if (hasDb) {
      try {
        const where: any = {};
        if (!filters?.includeArchived) {
          where.isArchived = false;
          if (!filters?.status) {
            where.status = { not: PrismaWorkflowStatus.ARCHIVED };
          }
        }

        if (filters?.status && filters.status !== 'all') {
          where.status = filters.status.toUpperCase() as PrismaWorkflowStatus;
        }

        if (filters?.search) {
          where.OR = [
            { name: { contains: filters.search, mode: 'insensitive' } },
            { description: { contains: filters.search, mode: 'insensitive' } },
          ];
        }

        const [records, total] = await Promise.all([
          prisma.workflow.findMany({
            where,
            include: {
              versions: {
                orderBy: { version: 'desc' },
                take: 1,
              },
            },
            orderBy: { updatedAt: 'desc' },
            skip,
            take: limit,
          }),
          prisma.workflow.count({ where }),
        ]);

        const workflows: Workflow[] = records.map((r) => {
          const latestVersion = r.versions[0];
          return {
            id: r.id,
            name: r.name,
            description: r.description || '',
            status: r.status.toLowerCase() as any,
            draftVersion: r.draftVersion,
            publishedVersion: r.publishedVersion || undefined,
            isArchived: r.isArchived,
            nodes: (latestVersion?.nodes as unknown as WorkflowNode[]) || [],
            edges: (latestVersion?.edges as unknown as WorkflowEdge[]) || [],
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          };
        });

        return { workflows, total };
      } catch (err) {
        logger.error({ err }, 'Error querying workflows from database, falling back to memory store');
      }
    }

    let list = await store.listWorkflows();
    if (!filters?.includeArchived) {
      list = list.filter((w) => !w.isArchived && w.status !== 'archived');
    }
    if (filters?.status && filters.status !== 'all') {
      list = list.filter((w) => w.status === filters.status);
    }
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      list = list.filter(
        (w) => w.name.toLowerCase().includes(s) || w.description.toLowerCase().includes(s)
      );
    }

    const total = list.length;
    const paginated = list.slice(skip, skip + limit);
    return { workflows: paginated, total };
  }

  async findById(id: string, includeArchived = false): Promise<Workflow | null> {
    const hasDb = await WorkflowRepository.checkDb();
    if (hasDb) {
      try {
        const record = await prisma.workflow.findUnique({
          where: { id },
          include: {
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
            },
          },
        });
        if (!record) return null;
        if (!includeArchived && record.isArchived) return null;

        const latestVersion = record.versions[0];
        return {
          id: record.id,
          name: record.name,
          description: record.description || '',
          status: record.status.toLowerCase() as any,
          draftVersion: record.draftVersion,
          publishedVersion: record.publishedVersion || undefined,
          isArchived: record.isArchived,
          nodes: (latestVersion?.nodes as unknown as WorkflowNode[]) || [],
          edges: (latestVersion?.edges as unknown as WorkflowEdge[]) || [],
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        };
      } catch (err) {
        logger.error({ err }, 'Error finding workflow by ID in database, falling back');
      }
    }
    const wf = await store.getWorkflow(id);
    if (!wf) return null;
    if (!includeArchived && (wf.isArchived || wf.status === 'archived')) return null;
    return wf;
  }

  async create(data: {
    name: string;
    description?: string;
    nodes: WorkflowNode[];
    edges: WorkflowEdge[];
    status?: WorkflowStatus;
  }): Promise<Workflow> {
    const hasDb = await WorkflowRepository.checkDb();
    if (hasDb) {
      try {
        const statusEnum = (data.status?.toUpperCase() || 'DRAFT') as PrismaWorkflowStatus;
        const created = await prisma.$transaction(async (tx) => {
          const wf = await tx.workflow.create({
            data: {
              name: data.name,
              description: data.description || '',
              status: statusEnum,
              draftVersion: 1,
              publishedVersion: statusEnum === PrismaWorkflowStatus.PUBLISHED ? 1 : null,
              isArchived: false,
            },
          });

          await tx.workflowVersion.create({
            data: {
              workflowId: wf.id,
              version: 1,
              nodes: data.nodes as any,
              edges: data.edges as any,
              isPublished: statusEnum === PrismaWorkflowStatus.PUBLISHED,
              changeSummary: 'Initial version',
            },
          });

          return wf;
        });

        return {
          id: created.id,
          name: created.name,
          description: created.description || '',
          status: created.status.toLowerCase() as any,
          draftVersion: created.draftVersion,
          publishedVersion: created.publishedVersion || undefined,
          isArchived: false,
          nodes: data.nodes,
          edges: data.edges,
          createdAt: created.createdAt.toISOString(),
          updatedAt: created.updatedAt.toISOString(),
        };
      } catch (err) {
        logger.error({ err }, 'Error creating workflow in database, falling back');
      }
    }
    return store.createWorkflow({
      ...data,
      status: data.status || 'draft',
    });
  }

  async update(
    id: string,
    updates: {
      name?: string;
      description?: string;
      nodes?: WorkflowNode[];
      edges?: WorkflowEdge[];
      status?: WorkflowStatus;
      expectedVersion?: number;
      publishedVersion?: number;
      changeSummary?: string;
    }
  ): Promise<Workflow> {
    const hasDb = await WorkflowRepository.checkDb();
    if (hasDb) {
      try {
        const existing = await prisma.workflow.findUnique({
          where: { id },
          include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
        });

        if (!existing) {
          throw createError(404, `Workflow ${id} not found`, 'WORKFLOW_NOT_FOUND');
        }

        // Optimistic Concurrency Check
        if (updates.expectedVersion !== undefined && updates.expectedVersion !== existing.draftVersion) {
          throw createError(
            409,
            `Conflict: Workflow was updated by another request. Current version is ${existing.draftVersion}, but expected ${updates.expectedVersion}.`,
            'CONFLICT_CONCURRENT_EDIT',
            { currentVersion: existing.draftVersion, expectedVersion: updates.expectedVersion }
          );
        }

        const latestVersion = existing.versions[0];
        const hasGraphChanges = updates.nodes !== undefined || updates.edges !== undefined;
        const newVersionNumber = hasGraphChanges ? existing.draftVersion + 1 : existing.draftVersion;

        const updated = await prisma.$transaction(async (tx) => {
          const wf = await tx.workflow.update({
            where: { id },
            data: {
              name: updates.name ?? existing.name,
              description: updates.description ?? existing.description,
              status: updates.status ? (updates.status.toUpperCase() as PrismaWorkflowStatus) : existing.status,
              draftVersion: newVersionNumber,
              publishedVersion:
                updates.publishedVersion !== undefined
                  ? updates.publishedVersion
                  : updates.status === 'published'
                  ? newVersionNumber
                  : existing.publishedVersion,
            },
          });

          if (hasGraphChanges) {
            await tx.workflowVersion.create({
              data: {
                workflowId: id,
                version: newVersionNumber,
                nodes: (updates.nodes ?? (latestVersion?.nodes as any)) || [],
                edges: (updates.edges ?? (latestVersion?.edges as any)) || [],
                isPublished: updates.status === 'published',
                changeSummary: updates.changeSummary || `Version ${newVersionNumber} update`,
              },
            });
          }

          return wf;
        });

        const activeNodes = updates.nodes ?? ((latestVersion?.nodes as any) || []);
        const activeEdges = updates.edges ?? ((latestVersion?.edges as any) || []);

        return {
          id: updated.id,
          name: updated.name,
          description: updated.description || '',
          status: updated.status.toLowerCase() as any,
          draftVersion: updated.draftVersion,
          publishedVersion: updated.publishedVersion || undefined,
          isArchived: updated.isArchived,
          nodes: activeNodes,
          edges: activeEdges,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        };
      } catch (err) {
        if ((err as any)?.statusCode === 409 || (err as any)?.statusCode === 404) throw err;
        logger.error({ err }, 'Error updating workflow in database, falling back');
      }
    }

    const currentWf = await store.getWorkflow(id);
    if (!currentWf) throw createError(404, `Workflow ${id} not found`, 'WORKFLOW_NOT_FOUND');
    if (updates.expectedVersion !== undefined && updates.expectedVersion !== currentWf.draftVersion) {
      throw createError(
        409,
        `Conflict: Workflow was updated by another request. Current version is ${currentWf.draftVersion}, but expected ${updates.expectedVersion}.`,
        'CONFLICT_CONCURRENT_EDIT',
        { currentVersion: currentWf.draftVersion, expectedVersion: updates.expectedVersion }
      );
    }
    return store.updateWorkflow(id, updates);
  }

  async duplicate(id: string, newName?: string): Promise<Workflow> {
    const source = await this.findById(id, true);
    if (!source) {
      throw createError(404, `Source workflow '${id}' not found`, 'WORKFLOW_NOT_FOUND');
    }

    // Remap all node IDs and rewiring edge endpoints
    const nodeIdMap = new Map<string, string>();
    const clonedNodes: WorkflowNode[] = source.nodes.map((node) => {
      const newNodeId = `node_${randomUUID().substring(0, 8)}`;
      nodeIdMap.set(node.id, newNodeId);
      return {
        ...node,
        id: newNodeId,
        config: JSON.parse(JSON.stringify(node.config || {})),
      };
    });

    const clonedEdges: WorkflowEdge[] = source.edges.map((edge) => ({
      ...edge,
      id: `edge_${randomUUID().substring(0, 8)}`,
      source: nodeIdMap.get(edge.source) || edge.source,
      target: nodeIdMap.get(edge.target) || edge.target,
    }));

    const workflowName = newName?.trim() || `${source.name} (Copy)`;

    return this.create({
      name: workflowName,
      description: source.description,
      nodes: clonedNodes,
      edges: clonedEdges,
      status: 'draft',
    });
  }

  async delete(id: string): Promise<WorkflowDeleteResult> {
    const hasDb = await WorkflowRepository.checkDb();
    if (hasDb) {
      try {
        const executionCount = await prisma.execution.count({ where: { workflowId: id } });

        if (executionCount > 0) {
          // Archival policy: Retain execution audit trail!
          await prisma.$transaction(async (tx) => {
            await tx.workflow.update({
              where: { id },
              data: {
                isArchived: true,
                status: PrismaWorkflowStatus.ARCHIVED,
              },
            });
            await tx.trigger.updateMany({
              where: { workflowId: id },
              data: { enabled: false },
            });
          });

          return {
            deleted: false,
            archived: true,
            message: `Workflow '${id}' has ${executionCount} historical runs and was archived to preserve execution history.`,
            executionCount,
          };
        }

        // Clean delete if no executions
        await prisma.workflow.delete({ where: { id } });
        return {
          deleted: true,
          archived: false,
          message: `Workflow '${id}' deleted successfully.`,
          executionCount: 0,
        };
      } catch (err) {
        logger.error({ err }, 'Error deleting workflow in database, falling back');
      }
    }

    const hasExecs = await store.hasExecutions(id);
    if (hasExecs) {
      await store.archiveWorkflow(id);
      return {
        deleted: false,
        archived: true,
        message: `Workflow '${id}' was archived to preserve run history.`,
        executionCount: 1,
      };
    }

    const deleted = await store.deleteWorkflow(id);
    return {
      deleted,
      archived: false,
      message: `Workflow '${id}' deleted successfully.`,
      executionCount: 0,
    };
  }

  async getLatestVersion(
    workflowId: string
  ): Promise<{ id: string; version: number; nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null> {
    const hasDb = await WorkflowRepository.checkDb();
    if (hasDb) {
      try {
        const v = await prisma.workflowVersion.findFirst({
          where: { workflowId },
          orderBy: { version: 'desc' },
        });
        if (v) {
          return {
            id: v.id,
            version: v.version,
            nodes: v.nodes as unknown as WorkflowNode[],
            edges: v.edges as unknown as WorkflowEdge[],
          };
        }
      } catch (err) {
        logger.error({ err }, 'Error getting latest workflow version');
      }
    }
    const memLatest = await store.getLatestWorkflowVersion(workflowId);
    if (memLatest) {
      return {
        id: memLatest.id,
        version: memLatest.version,
        nodes: memLatest.nodes,
        edges: memLatest.edges,
      };
    }
    const wf = await store.getWorkflow(workflowId);
    if (!wf) return null;
    return {
      id: `ver-${wf.id}-${wf.draftVersion}`,
      version: wf.draftVersion,
      nodes: wf.nodes,
      edges: wf.edges,
    };
  }

  async getVersion(
    workflowId: string,
    versionNumber: number
  ): Promise<{ id: string; version: number; nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null> {
    const hasDb = await WorkflowRepository.checkDb();
    if (hasDb) {
      try {
        const v = await prisma.workflowVersion.findUnique({
          where: {
            workflowId_version: {
              workflowId,
              version: versionNumber,
            },
          },
        });
        if (v) {
          return {
            id: v.id,
            version: v.version,
            nodes: v.nodes as unknown as WorkflowNode[],
            edges: v.edges as unknown as WorkflowEdge[],
          };
        }
      } catch (err) {
        logger.error({ err }, 'Error getting workflow version');
      }
    }
    const memVersion = await store.getWorkflowVersion(workflowId, versionNumber);
    if (memVersion) {
      return {
        id: memVersion.id,
        version: memVersion.version,
        nodes: memVersion.nodes,
        edges: memVersion.edges,
      };
    }
    return this.getLatestVersion(workflowId);
  }
}

export const workflowRepository = new WorkflowRepository();
