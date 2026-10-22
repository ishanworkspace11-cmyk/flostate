export type WorkflowStatus = 'draft' | 'published' | 'paused' | 'archived';

export type NodeType = 'trigger' | 'transform' | 'httpRequest' | 'delay' | 'webhookAction';

export type TriggerType = 'manual' | 'webhook' | 'cron';

export interface TriggerConfig {
  triggerType: TriggerType;
  cronExpression?: string; // e.g. "0 * * * *"
  webhookPath?: string; // e.g. "/webhooks/order-created"
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
  // Configuration options for safe execution without arbitrary eval
  extractPath?: string; // e.g. "user.email" or "data.items[0]"
  targetField?: string; // key to assign output to
  template?: string; // e.g. "Hello, {{user.name}}! Order #{{order.id}} confirmed."
  filterKey?: string; // key to filter list items by
  filterValue?: string; // value to match
  aggregateOp?: 'sum' | 'count' | 'avg' | 'min' | 'max';
  aggregateField?: string;
  fieldMappings?: Array<{ sourceField: string; targetField: string }>;
}

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export interface HttpRequestConfig {
  method: HttpMethod;
  url: string;
  headers?: Record<string, string>;
  body?: string; // JSON string or template string
  timeoutMs?: number;
  mockResponse?: {
    enabled: boolean;
    status: number;
    body: Record<string, unknown>;
  };
}

export interface DelayConfig {
  durationMs: number; // e.g. 1000ms
  description?: string;
}

export interface WebhookActionConfig {
  url: string;
  secretToken?: string;
  includeParentOutput?: boolean;
  customPayload?: Record<string, unknown>;
}

export type NodeConfig = 
  | ({ nodeKind: 'trigger' } & TriggerConfig)
  | ({ nodeKind: 'transform' } & TransformConfig)
  | ({ nodeKind: 'httpRequest' } & HttpRequestConfig)
  | ({ nodeKind: 'delay' } & DelayConfig)
  | ({ nodeKind: 'webhookAction' } & WebhookActionConfig);

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
