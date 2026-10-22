import { NodeType, TriggerType } from '../workflows/workflow.types';

export type ExecutionStatus = 
  | 'Pending'
  | 'Ready'
  | 'Running'
  | 'Succeeded'
  | 'Failed'
  | 'Retrying'
  | 'Skipped';

export interface ExecutionLogEntry {
  timestamp: string;
  level: 'info' | 'warn' | 'error' | 'debug';
  message: string;
  details?: unknown;
}

export interface NodeExecution {
  id: string;
  executionId: string;
  nodeId: string;
  nodeLabel: string;
  nodeType: NodeType;
  status: ExecutionStatus;
  attempt: number;
  input: unknown;
  output: unknown;
  error?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  durationMs?: number;
  logs: ExecutionLogEntry[];
}

export interface Execution {
  id: string;
  workflowId: string;
  workflowName: string;
  workflowVersion: number;
  triggerType: TriggerType | string;
  status: ExecutionStatus;
  input: Record<string, unknown>;
  output: Record<string, unknown> | null;
  startedAt: string;
  completedAt?: string | null;
  durationMs?: number;
  error?: string | null;
  nodeExecutions: Record<string, NodeExecution>; // keyed by nodeId
}
