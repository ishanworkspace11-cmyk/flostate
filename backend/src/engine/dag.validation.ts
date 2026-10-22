import { Workflow, ValidationError, ValidationResult, WorkflowNode } from '../models/workflow.types.js';

export function validateWorkflow(workflow: Workflow): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  const { nodes, edges } = workflow;

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
        message: `Duplicate node ID detected: "${node.id}".`,
      });
    }
    nodeMap.set(node.id, node);
  }

  const triggerNodes = nodes.filter((n) => n.type === 'trigger');
  if (triggerNodes.length === 0) {
    errors.push({
      severity: 'error',
      message: 'Workflow must have at least one Trigger node to define where execution starts.',
    });
  }

  const edgeSet = new Set<string>();
  const inDegree = new Map<string, number>();
  const outDegree = new Map<string, number>();
  const adjacencyList = new Map<string, string[]>();

  nodes.forEach((n) => {
    inDegree.set(n.id, 0);
    outDegree.set(n.id, 0);
    adjacencyList.set(n.id, []);
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
    inDegree.set(edge.target, (inDegree.get(edge.target) || 0) + 1);
    outDegree.set(edge.source, (outDegree.get(edge.source) || 0) + 1);
  }

  for (const trigger of triggerNodes) {
    if ((inDegree.get(trigger.id) || 0) > 0) {
      errors.push({
        nodeId: trigger.id,
        severity: 'error',
        message: `Trigger node "${trigger.label}" has incoming connections. Triggers must be root nodes without upstream dependencies.`,
      });
    }
  }

  // Cycle Detection using DFS color marking
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

  // Node configuration checks
  for (const node of nodes) {
    const config = node.config || {};
    const label = node.label || 'Unnamed Node';

    switch (node.type) {
      case 'trigger': {
        if (!config.triggerType) {
          errors.push({
            nodeId: node.id,
            severity: 'error',
            message: `Trigger node "${label}" is missing a trigger type.`,
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
        if (!config.operation) {
          errors.push({
            nodeId: node.id,
            severity: 'error',
            message: `Transform node "${label}" requires an operation.`,
          });
        }
        break;
      }
    }
  }

  // Kahn's algorithm for topological sorting
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
