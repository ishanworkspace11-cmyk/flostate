import { describe, it, expect } from 'vitest';
import { BackendExecutionEngine } from '../engine/dag.engine.js';
import { validateWorkflow } from '../engine/dag.validation.js';
import { Workflow } from '../models/workflow.types.js';

describe('Backend DAG Execution Engine', () => {
  it('validates and executes linear workflow end-to-end', async () => {
    const workflow: Workflow = {
      id: 'wf-backend-linear',
      name: 'Backend Test Pipeline',
      description: 'Tests backend topological execution',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        {
          id: 'step-1',
          type: 'trigger',
          label: 'Incoming Event',
          position: { x: 0, y: 0 },
          config: { triggerType: 'manual', defaultPayload: { orderId: 'ORD-9921', total: 150 } },
        },
        {
          id: 'step-2',
          type: 'transform',
          label: 'Format Receipt',
          position: { x: 200, y: 0 },
          config: {
            operation: 'string_template',
            template: 'Order {{data.orderId}} verified with amount ${{data.total}}',
            targetField: 'receiptText',
          },
        },
      ],
      edges: [{ id: 'e1', source: 'step-1', target: 'step-2' }],
    };

    const validation = validateWorkflow(workflow);
    expect(validation.isValid).toBe(true);
    expect(validation.topologicalOrder).toEqual(['step-1', 'step-2']);

    const execution = await BackendExecutionEngine.execute(workflow);
    expect(execution.status).toBe('Succeeded');
    expect(execution.nodeExecutions['step-1'].status).toBe('Succeeded');
    expect(execution.nodeExecutions['step-2'].status).toBe('Succeeded');

    const output = execution.nodeExecutions['step-2'].output as any;
    expect(output.receiptText).toBe('Order ORD-9921 verified with amount $150');
  });

  it('correctly skips downstream nodes when upstream dependency fails', async () => {
    const workflow: Workflow = {
      id: 'wf-backend-failure',
      name: 'Failure Branch Test',
      description: 'Tests skip propagation',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 'start', type: 'trigger', label: 'Start', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
        {
          id: 'failing-step',
          type: 'httpRequest',
          label: 'Failing Step',
          position: { x: 200, y: 0 },
          config: {
            method: 'GET',
            url: 'https://api.internal/error',
            mockResponse: { enabled: true, status: 500, body: { error: 'Internal Server Error' } },
          },
        },
        { id: 'child-step', type: 'transform', label: 'Dependent Child', position: { x: 400, y: 0 }, config: { operation: 'pass_through' } },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'failing-step' },
        { id: 'e2', source: 'failing-step', target: 'child-step' },
      ],
    };

    const execution = await BackendExecutionEngine.execute(workflow);
    expect(execution.status).toBe('Failed');
    expect(execution.nodeExecutions['failing-step'].status).toBe('Failed');
    expect(execution.nodeExecutions['child-step'].status).toBe('Skipped');
    expect(execution.nodeExecutions['child-step'].error).toContain('Skipped because upstream dependency');
  });
});
