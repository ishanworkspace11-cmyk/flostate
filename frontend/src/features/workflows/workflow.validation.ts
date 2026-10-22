import { Workflow, ValidationError, ValidationResult, WorkflowNode } from './workflow.types';

export function validateWorkflow(workflow: Workflow): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const { nodes, edges } = workflow;

  // 1. Basic node count check
  if (!nodes || nodes.length === 0) {
    errors.push({
      severity: 'error',
      message: 'Workflow contains no nodes. Add at least one Trigger node to begin.',
    });
    return { isValid: false, errors, warnings, topologicalOrder: [] };
  }

  const nodeMap = new Map<string, WorkflowNode>();
  for (const node of nodes) {
    if (nodeMap.has(node.id)) {
      errors.push({
        nodeId: node.id,
        severity: 'error',
        message: `Duplicate node ID detected: "${node.id}". Each node must have a unique identifier.`,
      });
    }
    nodeMap.set(node.id, node);
  }

  // 2. Trigger node validation
  const triggerNodes = nodes.filter((n) => n.type === 'trigger');
  if (triggerNodes.length === 0) {
    errors.push({
      severity: 'error',
      message: 'Workflow must have at least one Trigger node to define where execution starts.',
    });
  }

  // 3. Edge endpoint validation & duplicate edge check
  const edgeSet = new Set<string>();
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>(); // node -> target[]
  const reverseAdjacency = new Map<string, string[]>(); // node -> source[]

  nodes.forEach((n) => {
    inDegree.set(n.id, 0);
    outDegree.set(n.id, 0);
    adjacencyList.set(n.id, []);
    reverseAdjacency.set(n.id, []);
  });

  for (const edge of edges) {
    if (!edge.source || !edge.target) {
      errors.push({
        edgeId: edge.id,
        severity: 'error',
        message: `Edge ${edge.id} has an undefined source or target.`,
      });
      continue;
    }

    if (!nodeMap.has(edge.source)) {
      errors.push({
        edgeId: edge.id,
        severity: 'error',
        message: `Edge references a nonexistent source node "${edge.source}".`,
      });
      continue;
    }

    if (!nodeMap.has(edge.target)) {
      errors.push({
        edgeId: edge.id,
        severity: 'error',
        message: `Edge references a nonexistent target node "${edge.target}".`,
      });
      continue;
    }

    if (edge.source === edge.target) {
      errors.push({
        edgeId: edge.id,
        nodeId: edge.source,
        severity: 'error',
        message: `Self-referencing loop detected on node "${nodeMap.get(edge.source)?.label || edge.source}".`,
      });
      continue;
    }

    const edgeKey = `${edge.source}->${edge.target}`;
    if (edgeSet.has(edgeKey)) {
      warnings.push({
        edgeId: edge.id,
        severity: 'warning',
        message: `Duplicate connection between "${nodeMap.get(edge.source)?.label}" and "${nodeMap.get(edge.target)?.label}".`,
      });
      continue;
    }
    edgeSet.add(edgeKey);

    adjacencyList.get(edge.source)!.push(edge.target);
    reverseAdjacency.get(edge.target)!.push(edge.source);
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
  }

  // Trigger nodes shouldn't have incoming edges
  for (const trigger of triggerNodes) {
    if ((inDegree.get(trigger.id) || 0) > 0) {
      errors.push({
        nodeId: trigger.id,
        severity: 'error',
        message: `Trigger node "${trigger.label}" has incoming connections. Triggers must be root nodes without upstream dependencies.`,
      });
    }
  }

  // 4. Cycle Detection using DFS color marking (White=0, Gray=1, Black=2)
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

  // 5. Node-specific configuration validation
  for (const node of nodes) {
    const config = node.config || {};
    const label = node.label || 'Unnamed Node';

    switch (node.type) {
      case 'trigger': {
        const triggerType = config.triggerType;
        if (!triggerType) {
          errors.push({
            nodeId: node.id,
            severity: 'error',
            message: `Trigger node "${label}" is missing a trigger type (manual, webhook, or cron).`,
          });
        }
        if (triggerType === 'cron' && (!config.cronExpression || !config.cronExpression.trim())) {
          errors.push({
            nodeId: node.id,
            severity: 'error',
            message: `Cron Trigger "${label}" requires a valid cron expression (e.g., "0 * * * *").`,
          });
        }
        break;
      }

      case 'httpRequest': {
        const url = (config.url || '').trim();
        if (!url) {
          errors.push({
            nodeId: node.id,
            severity: 'error',
            message: `HTTP Request node "${label}" requires a target URL.`,
          });
        } else if (!/^https?:\/\//i.test(url) && !url.startsWith('/')) {
          errors.push({
            nodeId: node.id,
            severity: 'error',
            message: `HTTP Request node "${label}" URL must start with http://, https://, or a valid path.`,
          });
        }
        break;
      }

      case 'delay': {
        const duration = Number(config.durationMs);
        if (isNaN(duration) || duration < 0) {
          errors.push({
            nodeId: node.id,
            severity: 'error',
            message: `Delay node "${label}" duration must be a non-negative number of milliseconds.`,
          });
        } else if (duration > 60000) {
          warnings.push({
            nodeId: node.id,
            severity: 'warning',
            message: `Delay node "${label}" has a duration greater than 60s (${duration}ms). Test runs will take significant time.`,
          });
        }
        break;
      }

      case 'webhookAction': {
        const url = (config.url || '').trim();
        if (!url) {
          errors.push({
            nodeId: node.id,
            severity: 'error',
            message: `Webhook Action node "${label}" requires an endpoint URL.`,
          });
        }
        break;
      }

      case 'transform': {
        const op = config.operation;
        if (!op) {
          errors.push({
            nodeId: node.id,
            severity: 'error',
            message: `Transform node "${label}" requires an operation to be selected.`,
          });
        }
        break;
      }
    }
  }

  // 6. Reachability check from Trigger nodes
  const reachableFromTrigger = new Set<string>();
  const triggerQueue: string[] = [];

  for (const trigger of triggerNodes) {
    reachableFromTrigger.add(trigger.id);
    triggerQueue.push(trigger.id);
  }

  let queueIdx = 0;
  while (queueIdx < triggerQueue.length) {
    const current = triggerQueue[queueIdx++];
    const children = adjacencyList.get(current) || [];
    for (const child of children) {
      if (!reachableFromTrigger.has(child)) {
        reachableFromTrigger.add(child);
        triggerQueue.push(child);
      }
    }
  }

  for (const node of nodes) {
    if (node.type !== 'trigger' && !reachableFromTrigger.has(node.id)) {
      warnings.push({
        nodeId: node.id,
        severity: 'warning',
        message: `Node "${node.label}" is disconnected from trigger paths and will not be reached during execution.`,
      });
    }
  }

  // 7. Compute Topological Sort (Kahn's algorithm)
  const topologicalOrder: string[] = [];
  if (cycleNodes.size === 0) {
    const tempInDegree = new Map<string, number>(inDegree);
    const queue: string[] = [];

    // Start with all nodes that have in-degree 0 (triggers and any isolated roots)
    for (const [id, deg] of tempInDegree.entries()) {
      if (deg === 0) {
        queue.push(id);
      }
    }

    while (queue.length > 0) {
      const current = queue.shift()!;
      topologicalOrder.push(current);

      const neighbors = adjacencyList.get(current) || [];
      for (const neighbor of neighbors) {
        const currentDeg = tempInDegree.get(neighbor)! - 1;
        tempInDegree.set(neighbor, currentDeg);
        if (currentDeg === 0) {
          queue.push(neighbor);
        }
      }
    }

    // Check if Kahn's algorithm processed all nodes
    if (topologicalOrder.length < nodes.length && errors.length === 0) {
      errors.push({
        severity: 'error',
        message: 'Graph contains an unresolved circular dependency preventing topological execution ordering.',
      });
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    warnings,
    topologicalOrder,
  };
}
