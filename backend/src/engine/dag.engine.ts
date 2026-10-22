import { Workflow, WorkflowNode } from '../models/workflow.types.js';
import { Execution, NodeExecution, ExecutionLogEntry } from '../models/execution.types.js';
import { validateWorkflow } from './dag.validation.js';

export interface ExecutionOptions {
  initialInput?: Record<string, unknown>;
  triggerType?: string;
  onNodeStart?: (nodeId: string, nodeExecution: NodeExecution) => void;
  onNodeComplete?: (nodeId: string, nodeExecution: NodeExecution) => void;
  maxDelayMs?: number;
}

function generateId(prefix = 'id'): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).substring(2, 7)}`;
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

export class BackendExecutionEngine {
  public static async execute(
    workflow: Workflow,
    options: ExecutionOptions = {}
  ): Promise<Execution> {
    const executionId = generateId('run');
    const startedAt = new Date().toISOString();

    const validation = validateWorkflow(workflow);
    if (!validation.isValid) {
      const errorMsg = `Workflow validation failed: ${validation.errors.map((e) => e.message).join('; ')}`;
      return {
        id: executionId,
        workflowId: workflow.id,
        workflowName: workflow.name,
        workflowVersion: workflow.draftVersion,
        triggerType: options.triggerType || 'manual',
        status: 'Failed',
        input: options.initialInput || {},
        output: null,
        startedAt,
        completedAt: new Date().toISOString(),
        durationMs: 0,
        error: errorMsg,
        nodeExecutions: {},
      };
    }

    const nodeExecutions: Record<string, NodeExecution> = {};
    for (const node of workflow.nodes) {
      nodeExecutions[node.id] = {
        id: generateId('node_run'),
        executionId,
        nodeId: node.id,
        nodeLabel: node.label,
        nodeType: node.type,
        status: 'Pending',
        attempt: 1,
        input: null,
        output: null,
        startedAt: null,
        completedAt: null,
        durationMs: 0,
        logs: [],
      };
    }

    const execution: Execution = {
      id: executionId,
      workflowId: workflow.id,
      workflowName: workflow.name,
      workflowVersion: workflow.draftVersion,
      triggerType: options.triggerType || 'manual',
      status: 'Running',
      input: options.initialInput || {},
      output: null,
      startedAt,
      nodeExecutions,
    };

    const nodeMap = new Map<string, WorkflowNode>(workflow.nodes.map((n) => [n.id, n]));
    const parentMap = new Map<string, string[]>();

    for (const node of workflow.nodes) {
      parentMap.set(node.id, []);
    }

    for (const edge of workflow.edges) {
      if (parentMap.has(edge.target)) {
        parentMap.get(edge.target)!.push(edge.source);
      }
    }

    const topoOrder = validation.topologicalOrder || workflow.nodes.map((n) => n.id);
    const completedNodeOutputs = new Map<string, unknown>();

    const log = (nodeId: string, level: ExecutionLogEntry['level'], message: string, details?: unknown) => {
      const entry: ExecutionLogEntry = {
        timestamp: new Date().toISOString(),
        level,
        message,
        details,
      };
      if (nodeExecutions[nodeId]) {
        nodeExecutions[nodeId].logs.push(entry);
      }
    };

    for (const nodeId of topoOrder) {
      const node = nodeMap.get(nodeId);
      const nodeExec = nodeExecutions[nodeId];
      if (!node || !nodeExec) continue;

      const parents = parentMap.get(nodeId) || [];

      let upstreamFailed = false;
      let upstreamSkipped = false;
      let failedParentLabel = '';

      for (const parentId of parents) {
        const parentExec = nodeExecutions[parentId];
        if (parentExec?.status === 'Failed') {
          upstreamFailed = true;
          failedParentLabel = parentExec.nodeLabel;
          break;
        }
        if (parentExec?.status === 'Skipped') {
          upstreamSkipped = true;
          failedParentLabel = parentExec.nodeLabel;
          break;
        }
      }

      if (upstreamFailed || upstreamSkipped) {
        const reason = upstreamFailed
          ? `Skipped because upstream dependency "${failedParentLabel}" failed.`
          : `Skipped because upstream dependency "${failedParentLabel}" was skipped.`;
        nodeExec.status = 'Skipped';
        nodeExec.error = reason;
        log(nodeId, 'warn', reason);
        if (options.onNodeComplete) options.onNodeComplete(nodeId, nodeExec);
        continue;
      }

      const upstreamOutputs: Record<string, unknown> = {};
      let lastParentOutput: unknown = null;
      for (const parentId of parents) {
        const parentOutput = completedNodeOutputs.get(parentId);
        upstreamOutputs[parentId] = parentOutput;
        lastParentOutput = parentOutput;
      }

      const nodeInput = {
        workflowInput: options.initialInput || {},
        upstream: upstreamOutputs,
        payload: lastParentOutput !== null ? lastParentOutput : (options.initialInput || {}),
      };

      nodeExec.status = 'Running';
      nodeExec.startedAt = new Date().toISOString();
      nodeExec.input = nodeInput;
      const nodeStartTime = Date.now();

      if (options.onNodeStart) options.onNodeStart(nodeId, nodeExec);
      log(nodeId, 'info', `Executing node "${node.label}" (${node.type}) on backend worker`);

      try {
        const output = await this.executeNode(node, nodeInput, log, options);
        const nodeEndTime = Date.now();
        nodeExec.durationMs = nodeEndTime - nodeStartTime;
        nodeExec.completedAt = new Date().toISOString();
        nodeExec.output = output;
        nodeExec.status = 'Succeeded';
        completedNodeOutputs.set(nodeId, output);
        log(nodeId, 'info', `Node "${node.label}" completed in ${nodeExec.durationMs}ms`);
      } catch (err: any) {
        const nodeEndTime = Date.now();
        nodeExec.durationMs = nodeEndTime - nodeStartTime;
        nodeExec.completedAt = new Date().toISOString();
        nodeExec.status = 'Failed';
        nodeExec.error = err.message || 'Execution error';
        log(nodeId, 'error', `Node "${node.label}" failed: ${nodeExec.error}`);
      }

      if (options.onNodeComplete) options.onNodeComplete(nodeId, nodeExec);
    }

    const completedAt = new Date().toISOString();
    execution.completedAt = completedAt;
    execution.durationMs = new Date(completedAt).getTime() - new Date(startedAt).getTime();

    const allNodeExecs = Object.values(nodeExecutions);
    const hasFailures = allNodeExecs.some((n) => n.status === 'Failed');
    const allSkipped = allNodeExecs.every((n) => n.status === 'Skipped');

    if (hasFailures) {
      execution.status = 'Failed';
      execution.error = 'One or more workflow nodes encountered execution failures.';
    } else if (allSkipped && allNodeExecs.length > 0) {
      execution.status = 'Skipped';
    } else {
      execution.status = 'Succeeded';
      const lastNodeId = topoOrder[topoOrder.length - 1];
      execution.output = (completedNodeOutputs.get(lastNodeId) as Record<string, unknown>) || {
        completed: true,
        summary: 'All nodes finished successfully',
      };
    }

    return execution;
  }

  private static async executeNode(
    node: WorkflowNode,
    input: { workflowInput: Record<string, unknown>; upstream: Record<string, unknown>; payload: any },
    log: (nodeId: string, level: ExecutionLogEntry['level'], message: string, details?: unknown) => void,
    options: ExecutionOptions
  ): Promise<any> {
    const config = node.config || {};

    switch (node.type) {
      case 'trigger': {
        const triggerPayload = config.defaultPayload || input.workflowInput || { triggeredAt: new Date().toISOString() };
        log(node.id, 'info', `Trigger activated [${config.triggerType || 'manual'}]`, triggerPayload);
        return {
          source: 'trigger',
          triggerType: config.triggerType || 'manual',
          timestamp: new Date().toISOString(),
          data: triggerPayload,
        };
      }

      case 'transform': {
        const op = config.operation || 'pass_through';
        const sourceData = input.payload;

        switch (op) {
          case 'pass_through':
            return sourceData;

          case 'json_extract': {
            const extractPath = config.extractPath || '';
            const extracted = getNestedValue(sourceData, extractPath);
            const targetField = config.targetField || 'extracted';
            return { ...sourceData, [targetField]: extracted !== undefined ? extracted : null };
          }

          case 'string_template': {
            const template = config.template || '';
            const rendered = interpolateTemplate(template, {
              ...input.workflowInput,
              ...(typeof sourceData === 'object' && sourceData !== null ? sourceData : {}),
            });
            const targetField = config.targetField || 'message';
            return { ...sourceData, [targetField]: rendered };
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
              filtered = items.filter((item: any) => String(item[filterKey] ?? '').toLowerCase() === String(filterValue ?? '').toLowerCase());
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

      case 'delay': {
        const configuredMs = Number(config.durationMs) || 1000;
        const actualMs = options.maxDelayMs !== undefined
          ? Math.min(configuredMs, options.maxDelayMs)
          : Math.min(configuredMs, 5000);

        log(node.id, 'info', `Pausing backend task execution for ${actualMs}ms`);
        await new Promise((resolve) => setTimeout(resolve, actualMs));
        return { delayedMs: actualMs, configuredMs, timestamp: new Date().toISOString() };
      }

      case 'httpRequest': {
        const url = (config.url || '').trim();
        const method = config.method || 'GET';
        const headers = config.headers || {};
        const mockConfig = config.mockResponse;

        if (mockConfig?.enabled) {
          log(node.id, 'info', `[MOCK RESPONSE] HTTP ${mockConfig.status}`);
          if (mockConfig.status && mockConfig.status >= 400) {
            throw new Error(`HTTP ${mockConfig.status}: Mock response error`);
          }
          return { status: mockConfig.status || 200, isMock: true, data: mockConfig.body || {} };
        }

        log(node.id, 'info', `Dispatching ${method} request to: ${url}`);
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), config.timeoutMs || 5000);

        try {
          let reqBody: string | undefined = undefined;
          if (['POST', 'PUT', 'PATCH'].includes(method)) {
            reqBody = config.body || (input.payload ? JSON.stringify(input.payload) : undefined);
          }

          const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json', ...headers },
            body: reqBody,
            signal: controller.signal,
          });

          clearTimeout(timeout);

          let data: any;
          const contentType = response.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            data = await response.json();
          } else {
            data = await response.text();
          }

          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }

          return { status: response.status, data };
        } catch (err: any) {
          clearTimeout(timeout);
          throw new Error(`HTTP request failed: ${err.message}`);
        }
      }

      case 'webhookAction': {
        const url = (config.url || '').trim();
        log(node.id, 'info', `Dispatching outbound webhook payload to: ${url}`);
        await new Promise((r) => setTimeout(r, 100));

        return {
          deliveryId: generateId('dlv'),
          endpoint: url,
          timestamp: new Date().toISOString(),
          status: 'delivered',
          statusCode: 200,
          deliveredPayload: config.customPayload || input.payload,
        };
      }

      default:
        return input.payload;
    }
  }
}
