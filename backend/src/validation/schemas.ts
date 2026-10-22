import { z } from 'zod';

export const paginationQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().optional(),
  status: z.string().optional(),
  includeArchived: z.preprocess((val) => val === 'true' || val === true, z.boolean().default(false)),
});

export const idParamSchema = z.object({
  id: z.string().min(1, 'ID is required').optional(),
  workflowId: z.string().min(1, 'Workflow ID is required').optional(),
}).refine((data) => data.id || data.workflowId, {
  message: 'Workflow ID or ID must be provided',
});

export const duplicateWorkflowSchema = z.object({
  name: z.string().min(1).max(100).optional(),
});

export const nodeSchema = z.object({
  id: z.string().min(1),
  type: z.enum(['trigger', 'transform', 'httpRequest', 'delay', 'webhookAction']),
  label: z.string().min(1),
  position: z.object({
    x: z.number(),
    y: z.number(),
  }),
  config: z.record(z.any()).default({}),
});

export const edgeSchema = z.object({
  id: z.string().min(1),
  source: z.string().min(1),
  target: z.string().min(1),
  sourceHandle: z.string().nullable().optional(),
  targetHandle: z.string().nullable().optional(),
});

export const createWorkflowSchema = z.object({
  name: z.string().trim().min(1, 'Workflow name cannot be empty').max(100),
  description: z.string().optional().default(''),
  nodes: z.array(nodeSchema).default([]),
  edges: z.array(edgeSchema).default([]),
  status: z.enum(['draft', 'published', 'paused', 'archived']).default('draft'),
});

export const updateWorkflowSchema = z.object({
  name: z.string().trim().min(1, 'Workflow name cannot be empty').max(100).optional(),
  description: z.string().optional(),
  nodes: z.array(nodeSchema).optional(),
  edges: z.array(edgeSchema).optional(),
  status: z.enum(['draft', 'published', 'paused', 'archived']).optional(),
  expectedVersion: z.coerce.number().int().optional(),
  changeSummary: z.string().optional(),
});

export const runWorkflowSchema = z.object({
  input: z.record(z.any()).optional().default({}),
  triggerType: z.enum(['manual', 'webhook', 'cron']).default('manual'),
});

export const createTriggerSchema = z.object({
  workflowId: z.string().min(1, 'Workflow ID is required'),
  name: z.string().min(1, 'Trigger name is required'),
  kind: z.enum(['webhook', 'cron', 'manual']),
  enabled: z.boolean().default(true),
  cronExpression: z.string().optional(),
  webhookPath: z.string().optional(),
  webhookSecret: z.string().optional(),
  config: z.record(z.any()).optional(),
});

export const updateTriggerSchema = z.object({
  name: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  cronExpression: z.string().optional(),
  webhookPath: z.string().optional(),
  webhookSecret: z.string().optional(),
  config: z.record(z.any()).optional(),
});

export const applicationSettingSchema = z.object({
  key: z.string().min(1),
  value: z.any(),
  category: z.string().default('general'),
  description: z.string().optional(),
});

export const runsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  workflowId: z.string().optional(),
  status: z.string().optional(),
  triggerType: z.string().optional(),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  search: z.string().optional(),
  sortBy: z.enum(['startedAt', 'completedAt', 'durationMs', 'status', 'workflowName']).optional().default('startedAt'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

export const runParamSchema = z.object({
  id: z.string().min(1, 'Run ID is required').optional(),
  runId: z.string().min(1, 'Run ID is required').optional(),
}).refine((data) => data.id || data.runId, {
  message: 'Run ID must be provided',
});

export const nodeExecutionParamSchema = z.object({
  id: z.string().min(1).optional(),
  runId: z.string().min(1).optional(),
  nodeExecutionId: z.string().min(1, 'Node execution ID is required'),
});

export const nodeExecutionLogsQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
  level: z.enum(['info', 'warn', 'error', 'debug']).optional(),
});

