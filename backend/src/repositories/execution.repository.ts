import { prisma } from '../database/prisma.js';
import { isDatabaseAvailable } from '../database/db-status.js';
import { Execution, NodeExecution, ExecutionSummary, ExecutionListFilters } from '../models/execution.types.js';
import { store } from '../services/store.service.js';
import { logger } from '../config/logger.js';
import { ExecutionStatus as PrismaExecutionStatus } from '@prisma/client';

export class ExecutionRepository {
  private static async checkDb(): Promise<boolean> {
    return isDatabaseAvailable();
  }

  async list(filters?: ExecutionListFilters): Promise<{ executions: ExecutionSummary[]; total: number }> {
    const hasDb = await ExecutionRepository.checkDb();
    if (hasDb) {
      try {
        const where: any = {};
        if (filters?.workflowId) where.workflowId = filters.workflowId;
        if (filters?.status && filters.status !== 'all') {
          where.status = filters.status.toUpperCase() as PrismaExecutionStatus;
        }
        if (filters?.triggerType && filters.triggerType !== 'all') {
          where.triggerType = { equals: filters.triggerType, mode: 'insensitive' };
        }

        if (filters?.startDate || filters?.endDate) {
          where.startedAt = {};
          if (filters.startDate) {
            const startD = new Date(filters.startDate);
            if (!isNaN(startD.getTime())) where.startedAt.gte = startD;
          }
          if (filters.endDate) {
            const endD = new Date(filters.endDate);
            if (!isNaN(endD.getTime())) where.startedAt.lte = endD;
          }
        }

        if (filters?.search) {
          where.OR = [
            { workflowName: { contains: filters.search, mode: 'insensitive' } },
            { id: { contains: filters.search, mode: 'insensitive' } },
            { error: { contains: filters.search, mode: 'insensitive' } },
          ];
        }

        const allowedSortFields = ['startedAt', 'completedAt', 'durationMs', 'status', 'workflowName'];
        const sortField = allowedSortFields.includes(filters?.sortBy || '') ? filters!.sortBy! : 'startedAt';
        const sortDirection = filters?.sortOrder === 'asc' ? 'asc' : 'desc';
        const orderBy = { [sortField]: sortDirection };

        const page = Math.max(1, filters?.page || 1);
        const limit = Math.min(100, Math.max(1, filters?.limit || 20));
        const skip = (page - 1) * limit;

        const [records, total] = await Promise.all([
          prisma.execution.findMany({
            where,
            include: {
              nodeExecutions: {
                select: {
                  id: true,
                  status: true,
                },
              },
            },
            orderBy,
            skip,
            take: limit,
          }),
          prisma.execution.count({ where }),
        ]);

        const executions: ExecutionSummary[] = records.map((r) => {
          const nodeCount = r.nodeExecutions.length;
          const completedNodeCount = r.nodeExecutions.filter((ne) => ne.status === 'SUCCEEDED').length;

          return {
            id: r.id,
            workflowId: r.workflowId,
            workflowName: r.workflowName,
            workflowVersion: r.workflowVersion,
            triggerType: r.triggerType,
            status: (r.status.charAt(0).toUpperCase() + r.status.slice(1).toLowerCase()) as any,
            startedAt: r.startedAt.toISOString(),
            completedAt: r.completedAt?.toISOString() || null,
            durationMs: r.durationMs || undefined,
            error: r.error,
            nodeCount,
            completedNodeCount,
          };
        });

        return { executions, total };
      } catch (err) {
        logger.error({ err }, 'Error listing executions from DB, falling back');
      }
    }

    return store.listExecutions(filters);
  }

  async findById(id: string): Promise<Execution | null> {
    const hasDb = await ExecutionRepository.checkDb();
    if (hasDb) {
      try {
        const r = await prisma.execution.findUnique({
          where: { id },
          include: { nodeExecutions: true },
        });
        if (!r) return null;

        const nodeExecMap: Record<string, NodeExecution> = {};
        r.nodeExecutions.forEach((ne) => {
          nodeExecMap[ne.nodeId] = {
            id: ne.id,
            executionId: ne.executionId,
            nodeId: ne.nodeId,
            nodeLabel: ne.nodeLabel,
            nodeType: ne.nodeType as any,
            status: (ne.status.charAt(0).toUpperCase() + ne.status.slice(1).toLowerCase()) as any,
            attempt: ne.attempt,
            input: ne.input,
            output: ne.output,
            error: ne.error,
            startedAt: ne.startedAt?.toISOString() || null,
            completedAt: ne.completedAt?.toISOString() || null,
            durationMs: ne.durationMs || undefined,
            logs: (ne.logs as any) || [],
          };
        });

        return {
          id: r.id,
          workflowId: r.workflowId,
          workflowName: r.workflowName,
          workflowVersion: r.workflowVersion,
          triggerType: r.triggerType,
          status: (r.status.charAt(0).toUpperCase() + r.status.slice(1).toLowerCase()) as any,
          input: (r.input as any) || {},
          output: (r.output as any) || null,
          startedAt: r.startedAt.toISOString(),
          completedAt: r.completedAt?.toISOString() || null,
          durationMs: r.durationMs || undefined,
          error: r.error,
          nodeExecutions: nodeExecMap,
        };
      } catch (err) {
        logger.error({ err }, 'Error finding execution in DB, falling back');
      }
    }
    return store.getExecution(id);
  }

  async save(execution: Execution, workflowVersionId?: string): Promise<Execution> {
    const hasDb = await ExecutionRepository.checkDb();
    if (hasDb && workflowVersionId) {
      try {
        const statusEnum = (execution.status.toUpperCase()) as PrismaExecutionStatus;
        await prisma.$transaction(async (tx) => {
          await tx.execution.upsert({
            where: { id: execution.id },
            update: {
              status: statusEnum,
              output: execution.output as any,
              error: execution.error || null,
              completedAt: execution.completedAt ? new Date(execution.completedAt) : null,
              durationMs: execution.durationMs || null,
            },
            create: {
              id: execution.id,
              workflowId: execution.workflowId,
              workflowVersionId,
              workflowName: execution.workflowName,
              workflowVersion: execution.workflowVersion,
              triggerType: execution.triggerType,
              status: statusEnum,
              input: execution.input as any,
              output: execution.output as any,
              error: execution.error || null,
              startedAt: new Date(execution.startedAt),
              completedAt: execution.completedAt ? new Date(execution.completedAt) : null,
              durationMs: execution.durationMs || null,
            },
          });

          // Save / upsert node executions
          for (const ne of Object.values(execution.nodeExecutions)) {
            const neStatusEnum = ne.status.toUpperCase() as PrismaExecutionStatus;
            await tx.nodeExecution.upsert({
              where: { id: ne.id },
              update: {
                status: neStatusEnum,
                attempt: ne.attempt,
                input: ne.input as any,
                output: ne.output as any,
                error: ne.error || null,
                startedAt: ne.startedAt ? new Date(ne.startedAt) : null,
                completedAt: ne.completedAt ? new Date(ne.completedAt) : null,
                durationMs: ne.durationMs || null,
                logs: ne.logs as any,
              },
              create: {
                id: ne.id,
                executionId: execution.id,
                nodeId: ne.nodeId,
                nodeLabel: ne.nodeLabel,
                nodeType: ne.nodeType,
                status: neStatusEnum,
                attempt: ne.attempt,
                maxAttempts: 3,
                input: ne.input as any,
                output: ne.output as any,
                error: ne.error || null,
                startedAt: ne.startedAt ? new Date(ne.startedAt) : null,
                completedAt: ne.completedAt ? new Date(ne.completedAt) : null,
                durationMs: ne.durationMs || null,
                logs: ne.logs as any,
              },
            });
          }
        });
      } catch (err) {
        logger.error({ err }, 'Error saving execution to DB, falling back');
      }
    }
    return store.saveExecution(execution);
  }

  async createRun(execution: Execution, workflowVersionId?: string): Promise<Execution> {
    return this.save(execution, workflowVersionId);
  }

  async updateExecution(executionId: string, updates: Partial<Execution>): Promise<Execution | null> {
    const hasDb = await ExecutionRepository.checkDb();
    if (hasDb) {
      try {
        const statusEnum = updates.status ? (updates.status.toUpperCase() as PrismaExecutionStatus) : undefined;
        await prisma.execution.update({
          where: { id: executionId },
          data: {
            status: statusEnum,
            output: updates.output !== undefined ? (updates.output as any) : undefined,
            error: updates.error !== undefined ? updates.error : undefined,
            completedAt: updates.completedAt ? new Date(updates.completedAt) : undefined,
            durationMs: updates.durationMs !== undefined ? updates.durationMs : undefined,
          },
        });
      } catch (err) {
        logger.error({ err }, 'Error updating execution in DB, falling back');
      }
    }
    await store.updateExecution(executionId, updates);
    return this.findById(executionId);
  }

  async updateNodeExecution(
    executionId: string,
    nodeId: string,
    updates: Partial<NodeExecution>
  ): Promise<NodeExecution | null> {
    const hasDb = await ExecutionRepository.checkDb();
    if (hasDb) {
      try {
        const neStatusEnum = updates.status ? (updates.status.toUpperCase() as PrismaExecutionStatus) : undefined;
        await prisma.nodeExecution.updateMany({
          where: { executionId, nodeId },
          data: {
            status: neStatusEnum,
            attempt: updates.attempt,
            input: updates.input !== undefined ? (updates.input as any) : undefined,
            output: updates.output !== undefined ? (updates.output as any) : undefined,
            error: updates.error !== undefined ? updates.error : undefined,
            startedAt: updates.startedAt ? new Date(updates.startedAt) : undefined,
            completedAt: updates.completedAt ? new Date(updates.completedAt) : undefined,
            durationMs: updates.durationMs !== undefined ? updates.durationMs : undefined,
            logs: updates.logs !== undefined ? (updates.logs as any) : undefined,
          },
        });
      } catch (err) {
        logger.error({ err }, 'Error updating node execution in DB, falling back');
      }
    }
    return store.updateNodeExecution(executionId, nodeId, updates);
  }

  async getNodeExecutions(executionId: string): Promise<NodeExecution[]> {
    const hasDb = await ExecutionRepository.checkDb();
    if (hasDb) {
      try {
        const records = await prisma.nodeExecution.findMany({
          where: { executionId },
          orderBy: { startedAt: 'asc' },
        });
        if (records.length > 0) {
          return records.map((ne) => ({
            id: ne.id,
            executionId: ne.executionId,
            nodeId: ne.nodeId,
            nodeLabel: ne.nodeLabel,
            nodeType: ne.nodeType as any,
            status: (ne.status.charAt(0).toUpperCase() + ne.status.slice(1).toLowerCase()) as any,
            attempt: ne.attempt,
            input: ne.input,
            output: ne.output,
            error: ne.error,
            startedAt: ne.startedAt?.toISOString() || null,
            completedAt: ne.completedAt?.toISOString() || null,
            durationMs: ne.durationMs || undefined,
            logs: (ne.logs as any) || [],
          }));
        }
      } catch (err) {
        logger.error({ err }, 'Error getting node executions from DB, falling back');
      }
    }
    return store.getNodeExecutions(executionId);
  }
}

export const executionRepository = new ExecutionRepository();
