import { prisma } from '../database/prisma.js';
import { isDatabaseAvailable } from '../database/db-status.js';
import { Execution, NodeExecution } from '../models/execution.types.js';
import { store } from '../services/store.service.js';
import { logger } from '../config/logger.js';
import { ExecutionStatus as PrismaExecutionStatus } from '@prisma/client';

export class ExecutionRepository {
  private static async checkDb(): Promise<boolean> {
    return isDatabaseAvailable();
  }

  async list(filters?: { workflowId?: string; status?: string; page?: number; limit?: number }): Promise<{ executions: Execution[]; total: number }> {
    const hasDb = await ExecutionRepository.checkDb();
    if (hasDb) {
      try {
        const where: any = {};
        if (filters?.workflowId) where.workflowId = filters.workflowId;
        if (filters?.status) where.status = filters.status.toUpperCase() as PrismaExecutionStatus;

        const page = filters?.page || 1;
        const limit = filters?.limit || 20;
        const skip = (page - 1) * limit;

        const [records, total] = await Promise.all([
          prisma.execution.findMany({
            where,
            include: { nodeExecutions: true },
            orderBy: { startedAt: 'desc' },
            skip,
            take: limit,
          }),
          prisma.execution.count({ where }),
        ]);

        const executions: Execution[] = records.map((r) => {
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
        });

        return { executions, total };
      } catch (err) {
        logger.error({ err }, 'Error listing executions from DB, falling back');
      }
    }

    let all = await store.listExecutions();
    if (filters?.workflowId) {
      all = all.filter((e) => e.workflowId === filters.workflowId);
    }
    if (filters?.status) {
      all = all.filter((e) => e.status.toLowerCase() === filters.status!.toLowerCase());
    }
    const page = filters?.page || 1;
    const limit = filters?.limit || 20;
    const start = (page - 1) * limit;
    return {
      executions: all.slice(start, start + limit),
      total: all.length,
    };
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
}

export const executionRepository = new ExecutionRepository();
