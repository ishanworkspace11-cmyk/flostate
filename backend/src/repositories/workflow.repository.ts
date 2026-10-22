import { prisma } from '../database/prisma.js';
import { isDatabaseAvailable } from '../database/db-status.js';
import { Workflow, WorkflowNode, WorkflowEdge, WorkflowStatus } from '../models/workflow.types.js';
import { store } from '../services/store.service.js';
import { logger } from '../config/logger.js';
import { WorkflowStatus as PrismaWorkflowStatus } from '@prisma/client';

export class WorkflowRepository {
  private static async checkDb(): Promise<boolean> {
    return isDatabaseAvailable();
  }

  async list(filters?: { search?: string; status?: string }): Promise<Workflow[]> {
    const hasDb = await WorkflowRepository.checkDb();
    if (hasDb) {
      try {
        const where: any = {};
        if (filters?.status) {
          where.status = filters.status.toUpperCase() as PrismaWorkflowStatus;
        }
        if (filters?.search) {
          where.name = { contains: filters.search, mode: 'insensitive' };
        }
        const records = await prisma.workflow.findMany({
          where,
          include: {
            versions: {
              orderBy: { version: 'desc' },
              take: 1,
            },
          },
          orderBy: { updatedAt: 'desc' },
        });

        return records.map((r) => {
          const latestVersion = r.versions[0];
          return {
            id: r.id,
            name: r.name,
            description: r.description || '',
            status: r.status.toLowerCase() as any,
            draftVersion: r.draftVersion,
            publishedVersion: r.publishedVersion || undefined,
            nodes: (latestVersion?.nodes as unknown as WorkflowNode[]) || [],
            edges: (latestVersion?.edges as unknown as WorkflowEdge[]) || [],
            createdAt: r.createdAt.toISOString(),
            updatedAt: r.updatedAt.toISOString(),
          };
        });
      } catch (err) {
        logger.error({ err }, 'Error querying workflows from database, falling back to memory store');
      }
    }
    let list = await store.listWorkflows();
    if (filters?.status) {
      list = list.filter((w) => w.status === filters.status);
    }
    if (filters?.search) {
      const s = filters.search.toLowerCase();
      list = list.filter((w) => w.name.toLowerCase().includes(s) || w.description.toLowerCase().includes(s));
    }
    return list;
  }

  async findById(id: string): Promise<Workflow | null> {
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
        const latestVersion = record.versions[0];
        return {
          id: record.id,
          name: record.name,
          description: record.description || '',
          status: record.status.toLowerCase() as any,
          draftVersion: record.draftVersion,
          publishedVersion: record.publishedVersion || undefined,
          nodes: (latestVersion?.nodes as unknown as WorkflowNode[]) || [],
          edges: (latestVersion?.edges as unknown as WorkflowEdge[]) || [],
          createdAt: record.createdAt.toISOString(),
          updatedAt: record.updatedAt.toISOString(),
        };
      } catch (err) {
        logger.error({ err }, 'Error finding workflow by ID in database, falling back');
      }
    }
    return store.getWorkflow(id);
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
        const statusEnum = ((data.status?.toUpperCase() || 'DRAFT')) as PrismaWorkflowStatus;
        const created = await prisma.$transaction(async (tx) => {
          const wf = await tx.workflow.create({
            data: {
              name: data.name,
              description: data.description || '',
              status: statusEnum,
              draftVersion: 1,
              publishedVersion: statusEnum === PrismaWorkflowStatus.PUBLISHED ? 1 : null,
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

  async update(id: string, updates: {
    name?: string;
    description?: string;
    nodes?: WorkflowNode[];
    edges?: WorkflowEdge[];
    status?: WorkflowStatus;
    changeSummary?: string;
  }): Promise<Workflow> {
    const hasDb = await WorkflowRepository.checkDb();
    if (hasDb) {
      try {
        const existing = await prisma.workflow.findUnique({
          where: { id },
          include: { versions: { orderBy: { version: 'desc' }, take: 1 } },
        });

        if (!existing) {
          throw new Error(`Workflow ${id} not found`);
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
              publishedVersion: updates.status === 'published' ? newVersionNumber : existing.publishedVersion,
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
          nodes: activeNodes,
          edges: activeEdges,
          createdAt: updated.createdAt.toISOString(),
          updatedAt: updated.updatedAt.toISOString(),
        };
      } catch (err) {
        logger.error({ err }, 'Error updating workflow in database, falling back');
      }
    }
    return store.updateWorkflow(id, updates);
  }

  async delete(id: string): Promise<boolean> {
    const hasDb = await WorkflowRepository.checkDb();
    if (hasDb) {
      try {
        await prisma.workflow.delete({ where: { id } });
        return true;
      } catch (err) {
        logger.error({ err }, 'Error deleting workflow in database, falling back');
      }
    }
    return store.deleteWorkflow(id);
  }

  async getLatestVersion(workflowId: string): Promise<{ id: string; version: number; nodes: WorkflowNode[]; edges: WorkflowEdge[] } | null> {
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
    const wf = await store.getWorkflow(workflowId);
    if (!wf) return null;
    return {
      id: `ver-${wf.id}-${wf.draftVersion}`,
      version: wf.draftVersion,
      nodes: wf.nodes,
      edges: wf.edges,
    };
  }
}

export const workflowRepository = new WorkflowRepository();
