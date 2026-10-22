import { prisma } from '../database/prisma.js';
import { isDatabaseAvailable } from '../database/db-status.js';
import { store } from '../services/store.service.js';
import { logger } from '../config/logger.js';
import { auditRepository, AuditLogEntry } from './audit.repository.js';
import { ExecutionStatus as PrismaExecutionStatus, WorkflowStatus as PrismaWorkflowStatus } from '@prisma/client';

export type TimePeriod = '24h' | '7d' | '30d' | 'all';

export interface DashboardSummaryData {
  totalWorkflows: number;
  activeWorkflows: number;
  draftWorkflows: number;
  pausedWorkflows: number;

  period: TimePeriod;
  periodStart: string;
  periodEnd: string;

  totalExecutions: number;
  successfulExecutions: number;
  failedExecutions: number;
  runningExecutions: number;
  executionSuccessRate: number; // Percentage 0 - 100

  recentWorkflows: Array<{
    id: string;
    name: string;
    description: string;
    status: 'draft' | 'published' | 'paused' | 'archived';
    draftVersion: number;
    publishedVersion?: number;
    nodeCount: number;
    edgeCount: number;
    updatedAt: string;
    createdAt: string;
  }>;

  recentExecutions: Array<{
    id: string;
    workflowId: string;
    workflowName: string;
    workflowVersion: number;
    triggerType: string;
    status: 'Pending' | 'Ready' | 'Running' | 'Succeeded' | 'Failed' | 'Retrying' | 'Skipped';
    startedAt: string;
    completedAt?: string | null;
    durationMs?: number;
    error?: string | null;
  }>;
}

export interface DashboardActivityFeedItem {
  id: string;
  action: string;
  entityType: string;
  entityId: string;
  actor: string;
  details?: Record<string, any>;
  createdAt: string;
}

export class DashboardRepository {
  private static async checkDb(): Promise<boolean> {
    return isDatabaseAvailable();
  }

  private calculatePeriodBoundaries(period: TimePeriod): { start: Date; end: Date } {
    const end = new Date();
    let start: Date;

    switch (period) {
      case '7d':
        start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);
        break;
      case '30d':
        start = new Date(end.getTime() - 30 * 24 * 60 * 60 * 1000);
        break;
      case 'all':
        start = new Date(0);
        break;
      case '24h':
      default:
        start = new Date(end.getTime() - 24 * 60 * 60 * 1000);
        break;
    }

    return { start, end };
  }

  async getSummary(period: TimePeriod = '24h'): Promise<DashboardSummaryData> {
    const { start: periodStartDate, end: periodEndDate } = this.calculatePeriodBoundaries(period);
    const hasDb = await DashboardRepository.checkDb();

    if (hasDb) {
      try {
        const [
          totalWorkflows,
          activeWorkflows,
          draftWorkflows,
          pausedWorkflows,
          totalExecutions,
          successfulExecutions,
          failedExecutions,
          runningExecutions,
          recentWfRecords,
          recentExecRecords,
        ] = await Promise.all([
          prisma.workflow.count(),
          prisma.workflow.count({ where: { status: PrismaWorkflowStatus.PUBLISHED } }),
          prisma.workflow.count({ where: { status: PrismaWorkflowStatus.DRAFT } }),
          prisma.workflow.count({ where: { status: PrismaWorkflowStatus.PAUSED } }),
          prisma.execution.count({ where: { startedAt: { gte: periodStartDate } } }),
          prisma.execution.count({
            where: {
              status: PrismaExecutionStatus.SUCCEEDED,
              startedAt: { gte: periodStartDate },
            },
          }),
          prisma.execution.count({
            where: {
              status: PrismaExecutionStatus.FAILED,
              startedAt: { gte: periodStartDate },
            },
          }),
          prisma.execution.count({ where: { status: PrismaExecutionStatus.RUNNING } }),
          prisma.workflow.findMany({
            orderBy: { updatedAt: 'desc' },
            take: 5,
            include: {
              versions: {
                orderBy: { version: 'desc' },
                take: 1,
              },
            },
          }),
          prisma.execution.findMany({
            orderBy: { startedAt: 'desc' },
            take: 5,
          }),
        ]);

        const finishedExecutions = successfulExecutions + failedExecutions;
        const executionSuccessRate =
          finishedExecutions > 0
            ? Math.round((successfulExecutions / finishedExecutions) * 1000) / 10
            : 0;

        const recentWorkflows = recentWfRecords.map((r) => {
          const latestVersion = r.versions[0];
          const nodes = Array.isArray(latestVersion?.nodes) ? latestVersion.nodes : [];
          const edges = Array.isArray(latestVersion?.edges) ? latestVersion.edges : [];
          return {
            id: r.id,
            name: r.name,
            description: r.description || '',
            status: r.status.toLowerCase() as any,
            draftVersion: r.draftVersion,
            publishedVersion: r.publishedVersion || undefined,
            nodeCount: nodes.length,
            edgeCount: edges.length,
            updatedAt: r.updatedAt.toISOString(),
            createdAt: r.createdAt.toISOString(),
          };
        });

        const recentExecutions = recentExecRecords.map((r) => ({
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
        }));

        return {
          totalWorkflows,
          activeWorkflows,
          draftWorkflows,
          pausedWorkflows,
          period,
          periodStart: periodStartDate.toISOString(),
          periodEnd: periodEndDate.toISOString(),
          totalExecutions,
          successfulExecutions,
          failedExecutions,
          runningExecutions,
          executionSuccessRate,
          recentWorkflows,
          recentExecutions,
        };
      } catch (err) {
        logger.error({ err }, 'Error calculating dashboard summary from database, falling back');
      }
    }

    // In-memory fallback
    const allWorkflows = await store.listWorkflows();
    const allExecutions = await store.getAllExecutions();

    const totalWorkflows = allWorkflows.length;
    const activeWorkflows = allWorkflows.filter((w) => w.status === 'published').length;
    const draftWorkflows = allWorkflows.filter((w) => w.status === 'draft').length;
    const pausedWorkflows = allWorkflows.filter((w) => w.status === 'paused').length;

    const executionsInPeriod = allExecutions.filter(
      (e) => new Date(e.startedAt).getTime() >= periodStartDate.getTime()
    );

    const totalExecutions = executionsInPeriod.length;
    const successfulExecutions = executionsInPeriod.filter((e) => e.status === 'Succeeded').length;
    const failedExecutions = executionsInPeriod.filter((e) => e.status === 'Failed').length;
    const runningExecutions = executionsInPeriod.filter((e) => e.status === 'Running').length;

    const finishedExecutions = successfulExecutions + failedExecutions;
    const executionSuccessRate =
      finishedExecutions > 0
        ? Math.round((successfulExecutions / finishedExecutions) * 1000) / 10
        : 0;

    const recentWorkflows = allWorkflows
      .slice()
      .sort((a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime())
      .slice(0, 5)
      .map((w) => ({
        id: w.id,
        name: w.name,
        description: w.description,
        status: w.status,
        draftVersion: w.draftVersion,
        publishedVersion: w.publishedVersion,
        nodeCount: w.nodes.length,
        edgeCount: w.edges.length,
        updatedAt: w.updatedAt,
        createdAt: w.createdAt,
      }));

    const recentExecutions = allExecutions
      .slice()
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime())
      .slice(0, 5)
      .map((e) => ({
        id: e.id,
        workflowId: e.workflowId,
        workflowName: e.workflowName,
        workflowVersion: e.workflowVersion,
        triggerType: e.triggerType,
        status: e.status,
        startedAt: e.startedAt,
        completedAt: e.completedAt || null,
        durationMs: e.durationMs,
        error: e.error,
      }));

    return {
      totalWorkflows,
      activeWorkflows,
      draftWorkflows,
      pausedWorkflows,
      period,
      periodStart: periodStartDate.toISOString(),
      periodEnd: periodEndDate.toISOString(),
      totalExecutions,
      successfulExecutions,
      failedExecutions,
      runningExecutions,
      executionSuccessRate,
      recentWorkflows,
      recentExecutions,
    };
  }

  async getActivityFeed(page = 1, limit = 20): Promise<{ items: DashboardActivityFeedItem[]; total: number }> {
    const hasDb = await DashboardRepository.checkDb();
    const skip = (page - 1) * limit;

    if (hasDb) {
      try {
        const [records, total] = await Promise.all([
          prisma.auditLog.findMany({
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
          }),
          prisma.auditLog.count(),
        ]);

        const items: DashboardActivityFeedItem[] = records.map((r) => ({
          id: r.id,
          action: r.action,
          entityType: r.entityType,
          entityId: r.entityId,
          actor: r.actor,
          details: (r.details as Record<string, any>) || undefined,
          createdAt: r.createdAt.toISOString(),
        }));

        return { items, total };
      } catch (err) {
        logger.error({ err }, 'Error fetching activity feed from DB, falling back');
      }
    }

    const logs = await auditRepository.list({ limit: 100 });
    const items: DashboardActivityFeedItem[] = logs.slice(skip, skip + limit).map((l, index) => ({
      id: l.id || `act_${index}`,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      actor: l.actor || 'system',
      details: l.details,
      createdAt: l.createdAt || new Date().toISOString(),
    }));

    return { items, total: logs.length };
  }
}

export const dashboardRepository = new DashboardRepository();
