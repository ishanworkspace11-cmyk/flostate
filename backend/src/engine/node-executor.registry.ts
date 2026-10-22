import { WorkflowNode } from '../models/workflow.types.js';
import { ExecutionLogEntry } from '../models/execution.types.js';
import { validateSsrfTargetUrl } from '../utils/ssrf-protection.js';

export interface NodeExecutionContext {
  runId: string;
  nodeId: string;
  nodeLabel: string;
  workflowInput: Record<string, unknown>;
  upstreamOutputs: Record<string, unknown>;
  payload: any;
  attempt: number;
  maxAttempts: number;
  log: (level: ExecutionLogEntry['level'], message: string, details?: unknown) => void;
  abortSignal?: AbortSignal;
}

export interface NodeExecutionResult {
  output: any;
  logs: ExecutionLogEntry[];
}

export interface NodeExecutor {
  execute(node: WorkflowNode, context: NodeExecutionContext): Promise<any>;
}

function getNestedValue(obj: any, path: string): any {
  if (!obj || !path) return undefined;
  const parts = path.replace(/\[(\w+)\]/g, '.$1').replace(/^\./, '').split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return undefined;
    current = current[part];
  }
  return current;
}

function interpolateTemplate(template: string, context: Record<string, unknown>): string {
  return template.replace(/\{\{([^}]+)\}\}/g, (_, key) => {
    const val = getNestedValue(context, key.trim());
    return val !== undefined ? String(val) : '';
  });
}

function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
}

/**
 * Trigger Node Executor
 * Sets initial input payload and captures trigger metadata
 */
export class TriggerExecutor implements NodeExecutor {
  async execute(node: WorkflowNode, context: NodeExecutionContext): Promise<any> {
    const config = node.config || {};
    const triggerType = config.triggerType || 'manual';
    const payloadData = config.defaultPayload || context.workflowInput || { triggeredAt: new Date().toISOString() };

    context.log('info', `Trigger activated [${triggerType}]`, payloadData);

    return {
      source: 'trigger',
      triggerType,
      timestamp: new Date().toISOString(),
      data: payloadData,
    };
  }
}

/**
 * Transform Node Executor
 * Predefined safe transformations: pass_through, json_extract, string_template, filter_array, math_aggregate, map_fields
 * Disallows arbitrary JS code or eval for security.
 */
export class TransformExecutor implements NodeExecutor {
  async execute(node: WorkflowNode, context: NodeExecutionContext): Promise<any> {
    const config = node.config || {};
    const op = config.operation || 'pass_through';
    const sourceData = context.payload;

    context.log('info', `Running transform operation: ${op}`);

    switch (op) {
      case 'pass_through':
        return sourceData;

      case 'json_extract': {
        const extractPath = config.extractPath || '';
        const extracted = getNestedValue(sourceData, extractPath);
        const targetField = config.targetField || 'extracted';
        return {
          ...(typeof sourceData === 'object' && sourceData !== null ? sourceData : {}),
          [targetField]: extracted !== undefined ? extracted : null,
        };
      }

      case 'string_template': {
        const template = config.template || '';
        const rendered = interpolateTemplate(template, {
          ...context.workflowInput,
          ...(typeof sourceData === 'object' && sourceData !== null ? sourceData : {}),
        });
        const targetField = config.targetField || 'message';
        return {
          ...(typeof sourceData === 'object' && sourceData !== null ? sourceData : {}),
          [targetField]: rendered,
        };
      }

      case 'filter_array': {
        const items = Array.isArray(sourceData)
          ? sourceData
          : Array.isArray(sourceData?.items)
          ? sourceData.items
          : Array.isArray(sourceData?.data?.items)
          ? sourceData.data.items
          : Array.isArray(sourceData?.data)
          ? sourceData.data
          : [];
        const filterKey = config.filterKey;
        const filterValue = config.filterValue;

        let filtered = items;
        if (filterKey) {
          filtered = items.filter(
            (item: any) => String(item[filterKey] ?? '').toLowerCase() === String(filterValue ?? '').toLowerCase()
          );
        }

        return { totalItems: items.length, matchedItems: filtered.length, items: filtered };
      }

      case 'math_aggregate': {
        const items = Array.isArray(sourceData)
          ? sourceData
          : Array.isArray(sourceData?.items)
          ? sourceData.items
          : Array.isArray(sourceData?.data?.items)
          ? sourceData.data.items
          : Array.isArray(sourceData?.data)
          ? sourceData.data
          : [];
        const field = config.aggregateField || 'value';
        const numbers = items
          .map((i: any) => (typeof i === 'number' ? i : Number(i[field])))
          .filter((n: number) => !isNaN(n));
        const aggOp = config.aggregateOp || 'sum';

        let result = 0;
        if (numbers.length > 0) {
          if (aggOp === 'sum') result = numbers.reduce((a: number, b: number) => a + b, 0);
          else if (aggOp === 'count') result = numbers.length;
          else if (aggOp === 'avg') result = numbers.reduce((a: number, b: number) => a + b, 0) / numbers.length;
          else if (aggOp === 'min') result = Math.min(...numbers);
          else if (aggOp === 'max') result = Math.max(...numbers);
        }

        return { operation: aggOp, field, count: numbers.length, result };
      }

      case 'map_fields': {
        const mappings: Array<{ sourceField: string; targetField: string }> = config.fieldMappings || [];
        const result: Record<string, unknown> = {};
        for (const { sourceField, targetField } of mappings) {
          if (sourceField && targetField) {
            result[targetField] = getNestedValue(sourceData, sourceField);
          }
        }
        return result;
      }

      default:
        return sourceData;
    }
  }
}

/**
 * Delay Node Executor
 * Asynchronously pauses execution without blocking the event loop or node worker.
 */
export class DelayExecutor implements NodeExecutor {
  async execute(node: WorkflowNode, context: NodeExecutionContext): Promise<any> {
    const config = node.config || {};
    const configuredMs = Number(config.durationMs) || 1000;
    // Cap delay at 30 seconds for distributed workers (or maxDelay if specified in env/tests)
    const actualMs = Math.max(0, Math.min(configuredMs, 30000));

    context.log('info', `Pausing execution for ${actualMs}ms (configured: ${configuredMs}ms)`);

    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, actualMs);
      if (context.abortSignal) {
        context.abortSignal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('Delay cancelled by abort signal'));
        });
      }
    });

    return {
      delayedMs: actualMs,
      configuredMs,
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * HTTP Request Node Executor
 * Performs outbound HTTP request subject to SSRF controls, timeouts, response size limits, and mock support.
 */
export class HttpRequestExecutor implements NodeExecutor {
  async execute(node: WorkflowNode, context: NodeExecutionContext): Promise<any> {
    const config = node.config || {};
    const url = (config.url || '').trim();
    const method = (config.method || 'GET').toUpperCase();
    const headers = config.headers || {};
    const timeoutMs = Math.min(Math.max(Number(config.timeoutMs) || 5000, 500), 30000);
    const mockConfig = config.mockResponse;

    // Check mock mode
    if (mockConfig?.enabled) {
      context.log('info', `[MOCK RESPONSE] HTTP ${mockConfig.status || 200}`);
      if (mockConfig.status && mockConfig.status >= 400) {
        const err: any = new Error(`HTTP ${mockConfig.status}: Mock response error`);
        err.statusCode = mockConfig.status;
        err.isTransient = mockConfig.status >= 500 || mockConfig.status === 429;
        throw err;
      }
      return { status: mockConfig.status || 200, isMock: true, data: mockConfig.body || {} };
    }

    // SSRF URL Security Validation & DNS inspection
    await validateSsrfTargetUrl(url);

    context.log('info', `Dispatching ${method} request to: ${url}`);

    const controller = new AbortController();
    const timeoutTimer = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let body: string | undefined = undefined;
      if (['POST', 'PUT', 'PATCH'].includes(method)) {
        body = config.body || (context.payload ? JSON.stringify(context.payload) : undefined);
      }

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json', ...headers },
        body,
        signal: controller.signal,
        redirect: 'error', // Prevent SSRF bypass via 3xx redirects to private/metadata IP
      });

      clearTimeout(timeoutTimer);

      const contentType = response.headers.get('content-type') || '';
      let data: any;

      if (contentType.includes('application/json')) {
        data = await response.json();
      } else {
        const text = await response.text();
        // Enforce 5MB limit
        data = text.length > 5 * 1024 * 1024 ? text.substring(0, 5 * 1024 * 1024) + '... [truncated]' : text;
      }

      if (!response.ok) {
        const err: any = new Error(`HTTP ${response.status}: ${response.statusText}`);
        err.statusCode = response.status;
        err.isTransient = response.status >= 500 || response.status === 429;
        throw err;
      }

      return {
        status: response.status,
        statusText: response.statusText,
        data,
      };
    } catch (err: any) {
      clearTimeout(timeoutTimer);
      if (err.name === 'AbortError') {
        const timeoutErr: any = new Error(`HTTP request timed out after ${timeoutMs}ms`);
        timeoutErr.isTransient = true;
        throw timeoutErr;
      }
      throw err;
    }
  }
}

/**
 * Webhook Action Node Executor
 * Performs outbound POST to external webhook destination (or safe mock mode).
 */
export class WebhookActionExecutor implements NodeExecutor {
  async execute(node: WorkflowNode, context: NodeExecutionContext): Promise<any> {
    const config = node.config || {};
    const url = (config.url || '').trim();
    const isMock = config.mockMode ?? (!url || url.includes('example.com') || url.includes('hooks.slack.com/services/T00'));

    if (isMock) {
      context.log('info', `[MOCK WEBHOOK] Simulating delivery to ${url || 'webhook target'}`);
      await new Promise((r) => setTimeout(r, 50));
      return {
        deliveryId: generateId('wh_mock'),
        endpoint: url || 'mock://webhook',
        timestamp: new Date().toISOString(),
        status: 'delivered',
        statusCode: 200,
        isMock: true,
        deliveredPayload: config.customPayload || context.payload,
      };
    }

    // SSRF Safeguard inspection
    await validateSsrfTargetUrl(url);

    context.log('info', `Dispatching outbound webhook payload to: ${url}`);
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);

    try {
      const payloadToSend = config.customPayload || context.payload;
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(config.headers || {}) },
        body: JSON.stringify(payloadToSend),
        signal: controller.signal,
        redirect: 'error',
      });

      clearTimeout(timeout);

      return {
        deliveryId: generateId('wh_dlv'),
        endpoint: url,
        timestamp: new Date().toISOString(),
        status: res.ok ? 'delivered' : 'failed',
        statusCode: res.status,
        deliveredPayload: payloadToSend,
      };
    } catch (err: any) {
      clearTimeout(timeout);
      throw new Error(`Webhook delivery failed: ${err.message}`);
    }
  }
}

/**
 * Node Executor Registry
 */
export class NodeExecutorRegistry {
  private static executors: Map<string, NodeExecutor> = new Map<string, NodeExecutor>([
    ['trigger', new TriggerExecutor()],
    ['transform', new TransformExecutor()],
    ['delay', new DelayExecutor()],
    ['httpRequest', new HttpRequestExecutor()],
    ['webhookAction', new WebhookActionExecutor()],
  ]);

  public static get(nodeType: string): NodeExecutor {
    const executor = this.executors.get(nodeType);
    if (!executor) {
      throw new Error(`Unsupported node type '${nodeType}'. No registered executor found.`);
    }
    return executor;
  }

  public static register(nodeType: string, executor: NodeExecutor): void {
    this.executors.set(nodeType, executor);
  }
}

/**
 * Error Classifier: Distinguishes transient retryable failures from permanent failures
 */
export function isTransientError(err: any): boolean {
  if (!err) return false;
  if (err.isPermanent) return false;
  if (err.isTransient) return true;

  const msg = (err.message || '').toLowerCase();
  const code = (err.code || '').toLowerCase();

  // Network and timeout errors are transient
  if (
    code === 'econnreset' ||
    code === 'etimedout' ||
    code === 'econnrefused' ||
    code === 'enotfound' ||
    msg.includes('timed out') ||
    msg.includes('timeout') ||
    msg.includes('network error') ||
    msg.includes('econnreset')
  ) {
    return true;
  }

  // 5xx HTTP errors are transient
  if (err.statusCode && (err.statusCode >= 500 || err.statusCode === 429)) {
    return true;
  }

  return false;
}
