import { Workflow, ValidationError, ValidationResult, WorkflowNode, NodeType } from '../models/workflow.types.js';

export const SUPPORTED_NODE_TYPES: NodeType[] = [
  'trigger',
  'transform',
  'httpRequest',
  'delay',
  'webhookAction',
];

export const SAFE_TRANSFORM_OPERATIONS = [
  'pass_through',
  'json_extract',
  'map_fields',
  'filter_array',
  'string_template',
  'math_aggregate',
] as const;

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

const MAX_NODES = 100;
const MAX_EDGES = 200;
const MAX_DELAY_MS = 300000; // 5 minutes max

function isValidHttpUrl(urlString: string): { valid: boolean; error?: string } {
  try {
    const trimmed = urlString.trim();
    if (!trimmed) return { valid: false, error: 'URL cannot be empty' };
    const parsed = new URL(trimmed);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { valid: false, error: 'Protocol must be http:// or https://' };
    }
    return { valid: true };
  } catch (_e) {
    return { valid: false, error: 'Invalid URL format' };
  }
}

export function validateWorkflow(workflow: Workflow): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const nodes = workflow.nodes || [];
  const edges = workflow.edges || [];

  // 1. Graph Size Limits
  if (nodes.length === 0) {
    errors.push({
      code: 'GRAPH_EMPTY',
      severity: 'error',
      message: 'Workflow contains no nodes. Add at least one Trigger node to begin.',
    });
    return { isValid: false, errors, warnings, topologicalOrder: [] };
  }

  if (nodes.length > MAX_NODES) {
    errors.push({
      code: 'GRAPH_LIMIT_EXCEEDED',
      severity: 'error',
      message: `Workflow exceeds the maximum allowed nodes limit of ${MAX_NODES} (found ${nodes.length}).`,
    });
  }

  if (edges.length > MAX_EDGES) {
    errors.push({
      code: 'GRAPH_LIMIT_EXCEEDED',
      severity: 'error',
      message: `Workflow exceeds the maximum allowed edges limit of ${MAX_EDGES} (found ${edges.length}).`,
    });
  }

  // 2. Node ID Duplication and Node Types
  const nodeMap = new Map<string, WorkflowNode>();
  for (const node of nodes) {
    if (!node.id || !node.id.trim()) {
      errors.push({
        severity: 'error',
        code: 'MISSING_NODE_ID',
        message: 'A node is missing a unique ID.',
      });
      continue;
    }

    if (nodeMap.has(node.id)) {
      errors.push({
        code: 'DUPLICATE_NODE_ID',
        nodeId: node.id,
        severity: 'error',
        message: `Duplicate node ID detected: "${node.id}".`,
      });
    }
    nodeMap.set(node.id, node);

    // Validate supported node type
    if (!SUPPORTED_NODE_TYPES.includes(node.type)) {
      errors.push({
        code: 'UNSUPPORTED_NODE_TYPE',
        nodeId: node.id,
        severity: 'error',
        message: `Node "${node.label || node.id}" has unsupported type "${node.type}". Supported types: ${SUPPORTED_NODE_TYPES.join(', ')}.`,
      });
    }
  }

  // 3. Trigger Existence Check
  const triggerNodes = nodes.filter((n) => n.type === 'trigger');
  if (triggerNodes.length === 0) {
    errors.push({
      code: 'MISSING_TRIGGER',
      severity: 'error',
      message: 'Workflow must have at least one Trigger node to define where execution starts.',
    });
  }

  // 4. Edge Validation & Graph Data Structures
  const edgeIdSet = new Set<string>();
  const edgeKeySet = new Set<string>();
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>();

  nodes.forEach((n) => {
    inDegree.set(n.id, 0);
    outDegree.set(n.id, 0);
    adjacencyList.set(n.id, []);
  });

  for (const edge of edges) {
    if (!edge.id) {
      errors.push({
        code: 'MISSING_EDGE_ID',
        severity: 'error',
        message: 'An edge is missing a unique identifier.',
      });
    } else {
      if (edgeIdSet.has(edge.id)) {
        errors.push({
          code: 'DUPLICATE_EDGE_ID',
          edgeId: edge.id,
          severity: 'error',
          message: `Duplicate edge ID detected: "${edge.id}".`,
        });
      }
      edgeIdSet.add(edge.id);
    }

    if (!edge.source || !edge.target) {
      errors.push({
        code: 'INVALID_EDGE_ENDPOINT',
        edgeId: edge.id,
        severity: 'error',
        message: `Edge "${edge.id}" has an undefined source or target.`,
      });
      continue;
    }

    if (!nodeMap.has(edge.source)) {
      errors.push({
        code: 'INVALID_EDGE_ENDPOINT',
        edgeId: edge.id,
        severity: 'error',
        message: `Edge references a nonexistent source node "${edge.source}".`,
      });
      continue;
    }

    if (!nodeMap.has(edge.target)) {
      errors.push({
        code: 'INVALID_EDGE_ENDPOINT',
        edgeId: edge.id,
        severity: 'error',
        message: `Edge references a nonexistent target node "${edge.target}".`,
      });
      continue;
    }

    if (edge.source === edge.target) {
      errors.push({
        code: 'SELF_LOOP',
        edgeId: edge.id,
        severity: 'error',
        message: `Self-referencing loop detected on node "${nodeMap.get(edge.source)?.label || edge.source}".`,
      });
      continue;
    }

    const edgeKey = `${edge.source}->${edge.target}`;
    if (edgeKeySet.has(edgeKey)) {
      warnings.push({
        code: 'DUPLICATE_CONNECTION',
        edgeId: edge.id,
        severity: 'warning',
        message: `Duplicate connection between "${nodeMap.get(edge.source)?.label}" and "${nodeMap.get(edge.target)?.label}".`,
      });
      continue;
    }
    edgeKeySet.add(edgeKey);

    adjacencyList.get(edge.source)?.push(edge.target);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
  }

  // 5. Inbound Connection Prohibition on Trigger Nodes
  for (const trigger of triggerNodes) {
    if ((inDegree.get(trigger.id) || 0) > 0) {
      errors.push({
        code: 'INVALID_TRIGGER_CONNECTION',
        nodeId: trigger.id,
        severity: 'error',
        message: `Trigger node "${trigger.label}" has incoming connections. Triggers must be root nodes without upstream dependencies.`,
      });
    }
  }

  // 6. Cycle Detection using DFS 3-Coloring (0=unvisited, 1=visiting, 2=visited)
  const visitedState = new Map<string, number>();
  const cycleNodes = new Set<string>();

  function dfsFindCycle(nodeId: string, path: string[]) {
    visitedState.set(nodeId, 1);
    path.push(nodeId);

    const neighbors = adjacencyList.get(nodeId) || [];
    for (const neighbor of neighbors) {
      const state = visitedState.get(neighbor) || 0;
      if (state === 1) {
        const cycleStartIndex = path.indexOf(neighbor);
        const cyclePath = [...path.slice(cycleStartIndex), neighbor];
        const cycleLabels = cyclePath.map((id) => nodeMap.get(id)?.label || id).join(' -> ');
        cyclePath.forEach((id) => cycleNodes.add(id));
        errors.push({
          code: 'CYCLE_DETECTED',
          nodeId: neighbor,
          severity: 'error',
          message: `Cycle detected in directed graph: ${cycleLabels}. Workflows must be acyclic (DAG).`,
        });
      } else if (state === 0) {
        dfsFindCycle(neighbor, path);
      }
    }

    path.pop();
    visitedState.set(nodeId, 2);
  }

  for (const node of nodes) {
    if ((visitedState.get(node.id) || 0) === 0) {
      dfsFindCycle(node.id, []);
    }
  }

  // 7. Node Configuration Validations
  for (const node of nodes) {
    const config = node.config || {};
    const label = node.label || 'Unnamed Node';

    switch (node.type) {
      case 'trigger': {
        if (!config.triggerType) {
          errors.push({
            code: 'INVALID_TRIGGER_CONFIG',
            nodeId: node.id,
            severity: 'error',
            message: `Trigger node "${label}" is missing a triggerType ('manual', 'webhook', or 'cron').`,
          });
        } else if (!['manual', 'webhook', 'cron'].includes(config.triggerType)) {
          errors.push({
            code: 'INVALID_TRIGGER_CONFIG',
            nodeId: node.id,
            severity: 'error',
            message: `Trigger node "${label}" has invalid triggerType "${config.triggerType}". Must be manual, webhook, or cron.`,
          });
        } else if (config.triggerType === 'cron') {
          const cron = (config.cronExpression || '').trim();
          if (!cron || cron.split(/\s+/).length < 5) {
            errors.push({
              code: 'INVALID_TRIGGER_CONFIG',
              nodeId: node.id,
              severity: 'error',
              message: `Cron trigger node "${label}" requires a valid 5-part cron expression (e.g. "0 9 * * 1-5").`,
            });
          }
        }
        break;
      }

      case 'transform': {
        const op = config.operation;
        if (!op) {
          errors.push({
            code: 'INVALID_TRANSFORM_CONFIG',
            nodeId: node.id,
            severity: 'error',
            message: `Transform node "${label}" requires an operation.`,
          });
        } else if (!SAFE_TRANSFORM_OPERATIONS.includes(op)) {
          errors.push({
            code: 'INVALID_TRANSFORM_CONFIG',
            nodeId: node.id,
            severity: 'error',
            message: `Transform node "${label}" operation "${op}" is unsupported or disallowed. Arbitrary JavaScript execution is forbidden.`,
          });
        }
        break;
      }

      case 'httpRequest': {
        const url = (config.url || '').trim();
        const urlCheck = isValidHttpUrl(url);
        if (!urlCheck.valid) {
          errors.push({
            code: 'INVALID_HTTP_CONFIG',
            nodeId: node.id,
            severity: 'error',
            message: `HTTP Request node "${label}" target URL is invalid: ${urlCheck.error}. Only http:// and https:// URLs are allowed.`,
          });
        }

        const method = (config.method || 'GET').toUpperCase();
        if (!HTTP_METHODS.includes(method as any)) {
          errors.push({
            code: 'INVALID_HTTP_CONFIG',
            nodeId: node.id,
            severity: 'error',
            message: `HTTP Request node "${label}" has invalid HTTP method "${config.method}". Supported methods: ${HTTP_METHODS.join(', ')}.`,
          });
        }

        if (config.timeoutMs !== undefined) {
          const timeout = Number(config.timeoutMs);
          if (isNaN(timeout) || timeout <= 0 || timeout > 60000) {
            errors.push({
              code: 'INVALID_HTTP_CONFIG',
              nodeId: node.id,
              severity: 'error',
              message: `HTTP Request node "${label}" timeout must be between 1 and 60,000 milliseconds.`,
            });
          }
        }
        break;
      }

      case 'delay': {
        const duration = Number(config.durationMs);
        if (isNaN(duration) || duration < 0 || duration > MAX_DELAY_MS) {
          errors.push({
            code: 'INVALID_DELAY_CONFIG',
            nodeId: node.id,
            severity: 'error',
            message: `Delay node "${label}" duration must be between 0 and ${MAX_DELAY_MS} ms (5 minutes).`,
          });
        }
        break;
      }

      case 'webhookAction': {
        const url = (config.url || '').trim();
        const urlCheck = isValidHttpUrl(url);
        if (!urlCheck.valid) {
          errors.push({
            code: 'INVALID_WEBHOOK_CONFIG',
            nodeId: node.id,
            severity: 'error',
            message: `Webhook Action node "${label}" endpoint URL is invalid: ${urlCheck.error}. Only http:// and https:// URLs are allowed.`,
          });
        }
        break;
      }
    }
  }

  // 8. Reachability Analysis (Warn about disconnected nodes not reached from any trigger)
  if (triggerNodes.length > 0) {
    const reachableNodes = new Set<string>();
    const queue: string[] = triggerNodes.map((t) => t.id);
    queue.forEach((id) => reachableNodes.add(id));

    while (queue.length > 0) {
      const current = queue.shift()!;
      const neighbors = adjacencyList.get(current) || [];
      for (const next of neighbors) {
        if (!reachableNodes.has(next)) {
          reachableNodes.add(next);
          queue.push(next);
        }
      }
    }

    for (const node of nodes) {
      if (!reachableNodes.has(node.id)) {
        warnings.push({
          code: 'UNREACHABLE_NODE',
          nodeId: node.id,
          severity: 'warning',
          message: `Node "${node.label || node.id}" is unreachable from any Trigger node and will not execute.`,
        });
      }
    }
  }

  // 9. Topological Sorting using Kahn's Algorithm
  const topologicalOrder: string[] = [];
  if (cycleNodes.size === 0) {
    const tempInDegree = new Map<string, number>(inDegree);
    const queue: string[] = [];

    for (const [id, deg] of tempInDegree.entries()) {
      if (deg === 0) queue.push(id);
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      topologicalOrder.push(current);

      const neighbors = adjacencyList.get(current) || [];
      for (const neighbor of neighbors) {
        const currentDeg = tempInDegree.get(neighbor)! - 1;
        tempInDegree.set(neighbor, currentDeg);
        if (currentDeg === 0) queue.push(neighbor);
      }
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    topologicalOrder,
  };
}
