import { describe, it, expect } from 'vitest';
import { validateWorkflow } from '../workflows/workflow.validation';
import { ExecutionEngine } from './execution.engine';
import { Workflow } from '../workflows/workflow.types';

describe('Workflow Validation', () => {
  it('validates a correct linear workflow', () => {
    const workflow: Workflow = {
      id: 'wf-linear',
      name: 'Linear Pipeline',
      description: 'A simple linear pipeline',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 'n1', type: 'trigger', label: 'Start Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
        { id: 'n2', type: 'transform', label: 'Transform Data', position: { x: 200, y: 0 }, config: { operation: 'pass_through' } },
        { id: 'n3', type: 'httpRequest', label: 'Fetch API', position: { x: 400, y: 0 }, config: { method: 'GET', url: 'https://example.com/api' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
      ],
    };

    const res = validateWorkflow(workflow);
    expect(res.isValid).toBe(true);
    expect(res.errors).toHaveLength(0);
    expect(res.topologicalOrder).toEqual(['n1', 'n2', 'n3']);
  });

  it('detects cycles and marks cyclic workflow as invalid', () => {
    const workflow: Workflow = {
      id: 'wf-cycle',
      name: 'Cyclic Workflow',
      description: 'Contains a loop',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 'n1', type: 'trigger', label: 'Start Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
        { id: 'n2', type: 'transform', label: 'Transform A', position: { x: 200, y: 0 }, config: { operation: 'pass_through' } },
        { id: 'n3', type: 'transform', label: 'Transform B', position: { x: 400, y: 0 }, config: { operation: 'pass_through' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'n2' },
        { id: 'e2', source: 'n2', target: 'n3' },
        { id: 'e3', source: 'n3', target: 'n2' }, // Cycle: n2 -> n3 -> n2
      ],
    };

    const res = validateWorkflow(workflow);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.message.includes('Cycle detected'))).toBe(true);
  });

  it('detects invalid edge endpoints', () => {
    const workflow: Workflow = {
      id: 'wf-bad-edge',
      name: 'Broken Edges',
      description: 'Edge references missing nodes',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 'n1', type: 'trigger', label: 'Start Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
      ],
      edges: [
        { id: 'e1', source: 'n1', target: 'nonexistent-node-id' },
      ],
    };

    const res = validateWorkflow(workflow);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.message.includes('nonexistent target node'))).toBe(true);
  });

  it('flags nodes with missing required configuration', () => {
    const workflow: Workflow = {
      id: 'wf-missing-cfg',
      name: 'Missing Config',
      description: 'HTTP node without URL',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 'n1', type: 'trigger', label: 'Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
        { id: 'n2', type: 'httpRequest', label: 'Bad HTTP Node', position: { x: 200, y: 0 }, config: { url: '' } }, // Empty URL
      ],
      edges: [{ id: 'e1', source: 'n1', target: 'n2' }],
    };

    const res = validateWorkflow(workflow);
    expect(res.isValid).toBe(false);
    expect(res.errors.some((e) => e.message.includes('requires a target URL'))).toBe(true);
  });
});

describe('Execution Engine', () => {
  it('executes a linear workflow with output passing', async () => {
    const workflow: Workflow = {
      id: 'wf-exec-linear',
      name: 'Exec Linear',
      description: 'Test output passing',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: 'start',
          type: 'trigger',
          label: 'Trigger Node',
          position: { x: 0, y: 0 },
          config: {
            triggerType: 'manual',
            defaultPayload: { userId: 'usr_123', email: 'test@example.com' },
          },
        },
        {
          id: 'transform-1',
          type: 'transform',
          label: 'Template Formatter',
          position: { x: 200, y: 0 },
          config: {
            operation: 'string_template',
            template: 'Account notification for {{data.email}}',
            targetField: 'notificationMessage',
          },
        },
      ],
      edges: [{ id: 'e1', source: 'start', target: 'transform-1' }],
    };

    const execution = await ExecutionEngine.execute(workflow, { maxDelayMs: 10 });
    expect(execution.status).toBe('Succeeded');
    expect(execution.nodeExecutions['start'].status).toBe('Succeeded');
    expect(execution.nodeExecutions['transform-1'].status).toBe('Succeeded');
    
    const transformOutput = execution.nodeExecutions['transform-1'].output as any;
    expect(transformOutput.notificationMessage).toBe('Account notification for test@example.com');
  });

  it('correctly handles branching workflows', async () => {
    const workflow: Workflow = {
      id: 'wf-exec-branching',
      name: 'Branching DAG',
      description: 'Trigger branches to two parallel tasks',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 'start', type: 'trigger', label: 'Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual', defaultPayload: { val: 10 } } },
        { id: 'branchA', type: 'transform', label: 'Branch A', position: { x: 200, y: -100 }, config: { operation: 'pass_through' } },
        { id: 'branchB', type: 'transform', label: 'Branch B', position: { x: 200, y: 100 }, config: { operation: 'pass_through' } },
        { id: 'join', type: 'delay', label: 'Join Delay', position: { x: 400, y: 0 }, config: { durationMs: 10 } },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'branchA' },
        { id: 'e2', source: 'start', target: 'branchB' },
        { id: 'e3', source: 'branchA', target: 'join' },
        { id: 'e4', source: 'branchB', target: 'join' },
      ],
    };

    const execution = await ExecutionEngine.execute(workflow, { maxDelayMs: 10 });
    expect(execution.status).toBe('Succeeded');
    expect(execution.nodeExecutions['branchA'].status).toBe('Succeeded');
    expect(execution.nodeExecutions['branchB'].status).toBe('Succeeded');
    expect(execution.nodeExecutions['join'].status).toBe('Succeeded');
  });

  it('propagates failure and marks downstream nodes as Skipped', async () => {
    const workflow: Workflow = {
      id: 'wf-failure-prop',
      name: 'Failure Propagation',
      description: 'A failing node should cause downstream node to be skipped',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 'start', type: 'trigger', label: 'Start Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
        {
          id: 'failing-http',
          type: 'httpRequest',
          label: 'Failing Mock HTTP',
          position: { x: 200, y: 0 },
          config: {
            method: 'GET',
            url: 'https://api.internal/fail',
            mockResponse: {
              enabled: true,
              status: 500,
              body: { error: 'Internal Server Error' },
            },
          },
        },
        {
          id: 'downstream-transform',
          type: 'transform',
          label: 'Downstream Dependent',
          position: { x: 400, y: 0 },
          config: { operation: 'pass_through' },
        },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'failing-http' },
        { id: 'e2', source: 'failing-http', target: 'downstream-transform' },
      ],
    };

    const execution = await ExecutionEngine.execute(workflow, { maxDelayMs: 10 });
    expect(execution.status).toBe('Failed');
    expect(execution.nodeExecutions['start'].status).toBe('Succeeded');
    expect(execution.nodeExecutions['failing-http'].status).toBe('Failed');
    expect(execution.nodeExecutions['downstream-transform'].status).toBe('Skipped');
    expect(execution.nodeExecutions['downstream-transform'].error).toContain('Skipped because upstream dependency');
  });
});
