import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../server.js';
import { validateWorkflow } from '../engine/dag.validation.js';
import { Workflow } from '../models/workflow.types.js';
import http from 'http';

describe('Workflow Builder API & Graph Validation Engine', () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 4000;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('validates linear DAGs and produces correct topological order', () => {
    const wf: Workflow = {
      id: 'wf-linear',
      name: 'Linear Pipeline',
      description: 'Trigger -> HTTP -> Transform',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 'trig', type: 'trigger', label: 'Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
        { id: 'http', type: 'httpRequest', label: 'Fetch', position: { x: 200, y: 0 }, config: { method: 'GET', url: 'https://api.github.com' } },
        { id: 'trans', type: 'transform', label: 'Extract', position: { x: 400, y: 0 }, config: { operation: 'pass_through' } },
      ],
      edges: [
        { id: 'e1', source: 'trig', target: 'http' },
        { id: 'e2', source: 'http', target: 'trans' },
      ],
    };

    const result = validateWorkflow(wf);
    expect(result.isValid).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.topologicalOrder).toEqual(['trig', 'http', 'trans']);
  });

  it('validates branching and merging graphs successfully', () => {
    const wf: Workflow = {
      id: 'wf-diamond',
      name: 'Diamond Branch-Merge DAG',
      description: 'Trigger branches to A & B, then merges to C',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 'start', type: 'trigger', label: 'Start', position: { x: 0, y: 100 }, config: { triggerType: 'manual' } },
        { id: 'branchA', type: 'transform', label: 'Branch A', position: { x: 200, y: 50 }, config: { operation: 'pass_through' } },
        { id: 'branchB', type: 'transform', label: 'Branch B', position: { x: 200, y: 150 }, config: { operation: 'pass_through' } },
        { id: 'merge', type: 'webhookAction', label: 'Merge', position: { x: 400, y: 100 }, config: { url: 'https://hooks.example.com/merge' } },
      ],
      edges: [
        { id: 'e1', source: 'start', target: 'branchA' },
        { id: 'e2', source: 'start', target: 'branchB' },
        { id: 'e3', source: 'branchA', target: 'merge' },
        { id: 'e4', source: 'branchB', target: 'merge' },
      ],
    };

    const result = validateWorkflow(wf);
    expect(result.isValid).toBe(true);
    expect(result.topologicalOrder?.[0]).toBe('start');
    expect(result.topologicalOrder?.[3]).toBe('merge');
  });

  it('detects cycles and returns structured error with code CYCLE_DETECTED', () => {
    const wf: Workflow = {
      id: 'wf-cycle',
      name: 'Cyclic Graph',
      description: 'Has loop',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 't1', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
        { id: 'step1', type: 'transform', label: 'Step 1', position: { x: 100, y: 0 }, config: { operation: 'pass_through' } },
        { id: 'step2', type: 'transform', label: 'Step 2', position: { x: 200, y: 0 }, config: { operation: 'pass_through' } },
      ],
      edges: [
        { id: 'e1', source: 't1', target: 'step1' },
        { id: 'e2', source: 'step1', target: 'step2' },
        { id: 'e3', source: 'step2', target: 'step1' }, // Cycle step1 <-> step2
      ],
    };

    const result = validateWorkflow(wf);
    expect(result.isValid).toBe(false);
    const cycleErr = result.errors.find((e) => e.code === 'CYCLE_DETECTED');
    expect(cycleErr).toBeDefined();
    expect(cycleErr?.message.toLowerCase()).toContain('cycle');
  });

  it('detects invalid edge endpoints and self-loops', () => {
    const wf: Workflow = {
      id: 'wf-bad-edges',
      name: 'Bad Edges Graph',
      description: 'Edges to non-existent nodes',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 't1', type: 'trigger', label: 'Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
        { id: 'n1', type: 'delay', label: 'Delay', position: { x: 100, y: 0 }, config: { durationMs: 100 } },
      ],
      edges: [
        { id: 'e1', source: 't1', target: 'nonexistent-target' },
        { id: 'e2', source: 'n1', target: 'n1' }, // Self loop
      ],
    };

    const result = validateWorkflow(wf);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_EDGE_ENDPOINT')).toBe(true);
    expect(result.errors.some((e) => e.code === 'SELF_LOOP')).toBe(true);
  });

  it('rejects unsupported node types and arbitrary JS code in Transform nodes', () => {
    const wf: Workflow = {
      id: 'wf-unsafe',
      name: 'Unsafe Node Test',
      description: 'Attempts to run arbitrary scripts',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 't1', type: 'trigger', label: 'Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
        { id: 'bad-type', type: 'shellScript' as any, label: 'Bash Node', position: { x: 100, y: 0 }, config: {} },
        { id: 'bad-transform', type: 'transform', label: 'Eval Node', position: { x: 200, y: 0 }, config: { operation: 'eval_javascript' as any } },
      ],
      edges: [],
    };

    const result = validateWorkflow(wf);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === 'UNSUPPORTED_NODE_TYPE')).toBe(true);
    expect(result.errors.some((e) => e.code === 'INVALID_TRANSFORM_CONFIG')).toBe(true);
  });

  it('rejects unsafe HTTP URLs and protocols (SSRF protection)', () => {
    const wf: Workflow = {
      id: 'wf-unsafe-http',
      name: 'Unsafe HTTP Test',
      description: 'Tests URL validation',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 't1', type: 'trigger', label: 'Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
        {
          id: 'http1',
          type: 'httpRequest',
          label: 'JS Protocol URL',
          position: { x: 100, y: 0 },
          config: { method: 'GET', url: 'javascript:alert(1)' },
        },
      ],
      edges: [],
    };

    const result = validateWorkflow(wf);
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.code === 'INVALID_HTTP_CONFIG')).toBe(true);
  });

  it('warns about unreachable disconnected nodes', () => {
    const wf: Workflow = {
      id: 'wf-unreachable',
      name: 'Unreachable Node Test',
      description: 'Node disconnected from trigger',
      status: 'draft',
      draftVersion: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      nodes: [
        { id: 't1', type: 'trigger', label: 'Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
        { id: 'orphan', type: 'transform', label: 'Orphan Step', position: { x: 200, y: 200 }, config: { operation: 'pass_through' } },
      ],
      edges: [],
    };

    const result = validateWorkflow(wf);
    expect(result.warnings.some((w) => w.code === 'UNREACHABLE_NODE')).toBe(true);
  });

  it('API: POST /api/v1/workflows/:id/validate returns server-side validation', async () => {
    // 1. Create a workflow
    const createRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Server Validation Test DAG',
        nodes: [{ id: 't1', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } }],
      }),
    });
    const { data: wf } = (await createRes.json()) as any;

    // 2. Validate via API
    const valRes = await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/validate`, {
      method: 'POST',
    });
    expect(valRes.status).toBe(200);
    const valBody = (await valRes.json()) as any;
    expect(valBody.success).toBe(true);
    expect(valBody.data.isValid).toBe(true);
    expect(valBody.data.topologicalOrder).toEqual(['t1']);
  });

  it('API: Rejects publication of an invalid graph with 400 and validation errors', async () => {
    // 1. Create workflow with invalid configuration (missing URL on HTTP Request)
    const createRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Invalid Pipeline',
        nodes: [
          { id: 't1', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
          { id: 'h1', type: 'httpRequest', label: 'H', position: { x: 100, y: 0 }, config: { method: 'GET', url: '' } }, // Empty URL!
        ],
        edges: [{ id: 'e1', source: 't1', target: 'h1' }],
      }),
    });
    const { data: wf } = (await createRes.json()) as any;

    // 2. Attempt publish
    const pubRes = await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, {
      method: 'POST',
    });

    expect(pubRes.status).toBe(400);
    const pubBody = (await pubRes.json()) as any;
    expect(pubBody.success).toBe(false);
    expect(pubBody.error.code).toBe('WORKFLOW_VALIDATION_FAILED');
    expect(Array.isArray(pubBody.error.details)).toBe(true);
  });

  it('API: Preserves exact node positions and configs across save and reload', async () => {
    // 1. Create initial workflow
    const createRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Exact Geometry DAG' }),
    });
    const { data: wf } = (await createRes.json()) as any;

    // 2. Save graph with distinct positions and configurations
    const customNodes = [
      {
        id: 'node-trig-custom',
        type: 'trigger',
        label: 'Webhook Inbound',
        position: { x: 142.5, y: 388.25 },
        config: { triggerType: 'webhook', webhookPath: '/webhooks/v1/test-order' },
      },
      {
        id: 'node-delay-custom',
        type: 'delay',
        label: '5s Pacing Delay',
        position: { x: 480.75, y: 388.25 },
        config: { durationMs: 5000, description: 'Hold for downstream ready' },
      },
    ];
    const customEdges = [
      { id: 'edge-custom-1', source: 'node-trig-custom', target: 'node-delay-custom' },
    ];

    const patchRes = await fetch(`${baseUrl}/api/v1/workflows/${wf.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: customNodes,
        edges: customEdges,
        expectedVersion: 1,
      }),
    });
    expect(patchRes.status).toBe(200);

    // 3. Re-fetch workflow (simulating browser refresh / reopen)
    const fetchRes = await fetch(`${baseUrl}/api/v1/workflows/${wf.id}`);
    expect(fetchRes.status).toBe(200);
    const fetchBody = (await fetchRes.json()) as any;

    const retrievedNodes = fetchBody.data.nodes;
    const retrievedEdges = fetchBody.data.edges;

    expect(retrievedNodes.length).toBe(2);
    expect(retrievedNodes[0].position).toEqual({ x: 142.5, y: 388.25 });
    expect(retrievedNodes[0].config.webhookPath).toBe('/webhooks/v1/test-order');
    expect(retrievedNodes[1].position).toEqual({ x: 480.75, y: 388.25 });
    expect(retrievedNodes[1].config.durationMs).toBe(5000);

    expect(retrievedEdges.length).toBe(1);
    expect(retrievedEdges[0].id).toBe('edge-custom-1');
  });

  it('API: Execution engine executes immutable published snapshot rather than subsequent draft edits', async () => {
    // 1. Create and publish version 1
    const createRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Snapshot Execution Test',
        nodes: [
          { id: 't1', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
          { id: 'step1', type: 'transform', label: 'V1 Step', position: { x: 100, y: 0 }, config: { operation: 'pass_through' } },
        ],
        edges: [{ id: 'e1', source: 't1', target: 'step1' }],
      }),
    });
    const { data: wf } = (await createRes.json()) as any;

    const pubRes = await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });
    expect(pubRes.status).toBe(200);

    // 2. Modify draft without publishing (add an extra node to draft)
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: [
          { id: 't1', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
          { id: 'step1', type: 'transform', label: 'V1 Step', position: { x: 100, y: 0 }, config: { operation: 'pass_through' } },
          { id: 'step2_draft', type: 'delay', label: 'Unpublished Step', position: { x: 200, y: 0 }, config: { durationMs: 100 } },
        ],
        edges: [
          { id: 'e1', source: 't1', target: 'step1' },
          { id: 'e2', source: 'step1', target: 'step2_draft' },
        ],
      }),
    });

    // 3. Trigger run -> should run the published snapshot (which does NOT have step2_draft!)
    const runRes = await fetch(`${baseUrl}/api/v1/runs/workflows/${wf.id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggerType: 'manual' }),
    });
    expect(runRes.status).toBe(201);
    const runBody = (await runRes.json()) as any;

    expect(runBody.data.workflowVersion).toBe(1); // Executed published version 1
    expect(runBody.data.nodeExecutions).toHaveProperty('step1');
    expect(runBody.data.nodeExecutions).not.toHaveProperty('step2_draft'); // Draft change was not executed!
  });
});
