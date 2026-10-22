export type WorkflowStatus = 'draft' | 'published' | 'paused' | 'archived';

export type NodeType = 'trigger' | 'transform' | 'httpRequest' | 'delay' | 'webhookAction';

export type TriggerType = 'manual' | 'webhook' | 'cron';

export interface TriggerConfig {
  triggerType: TriggerType;
  cronExpression?: string;
  webhookPath?: string;
  defaultPayload?: Record<string, unknown>;
  description?: string;
}

export type TransformOperation = 
  | 'pass_through'
  | 'json_extract'
  | 'map_fields'
  | 'filter_array'
  | 'string_template'
  | 'math_aggregate';

export interface TransformConfig {
  operation: TransformOperation;
  extractPath?: string;
  targetField?: string;
  template?: string;
  filterKey?: string;
  filterValue?: string;
  aggregateOp?: 'sum' | 'count' | 'avg' | 'min' | 'max';
  aggregateField?: string;
  fieldMappings?: Array<{ sourceField: string; targetField: string }>;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpRequestConfig {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: string;
  timeoutMs?: number;
  mockResponse?: {
    enabled: boolean;
    status: number;
    body: Record<string, unknown>;
  };
}

export interface DelayConfig {
  durationMs: number;
  description?: string;
}

export interface WebhookActionConfig {
  url: string;
  secretToken?: string;
  includeParentOutput?: boolean;
  customPayload?: Record<string, unknown>;
}

export interface WorkflowNode {
  id: string;
  type: NodeType;
  label: string;
  position: { x: number; y: number };
  config: Record<string, any>;
}

export interface WorkflowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string | null;
  targetHandle?: string | null;
}

export interface Workflow {
  id: string;
  name: string;
  description: string;
  status: WorkflowStatus;
  draftVersion: number;
  publishedVersion?: number;
  isArchived?: boolean;
  nodes: WorkflowNode[];
  edges: WorkflowEdge[];
  createdAt: string;
  updatedAt: string;
}

export interface ValidationError {
  nodeId?: string;
  edgeId?: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  topologicalOrder?: string[];
}
