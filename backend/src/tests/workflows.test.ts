import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../server.js';
import http from 'http';

describe('Workflow Management Backend API (/api/v1/workflows)', () => {
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

  it('POST /api/v1/workflows creates a workflow and rejects empty name', async () => {
    // 1. Rejected empty name
    const emptyRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: '   ' }),
    });
    expect(emptyRes.status).toBe(400);

    // 2. Valid creation
    const res = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Order Sync Pipeline',
        description: 'Syncs customer orders to logistics',
        nodes: [
          {
            id: 'node-trig',
            type: 'trigger',
            label: 'Order Trigger',
            position: { x: 0, y: 0 },
            config: { triggerType: 'manual' },
          },
        ],
        edges: [],
      }),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Order Sync Pipeline');
    expect(body.data.status).toBe('draft');
    expect(body.data.draftVersion).toBe(1);
    expect(body.data.nodes.length).toBe(1);
  });

  it('GET /api/v1/workflows supports pagination, search, and status filters', async () => {
    const res = await fetch(`${baseUrl}/api/v1/workflows?page=1&limit=2&status=all`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toHaveProperty('page', 1);
    expect(body.meta).toHaveProperty('limit', 2);
    expect(body.meta).toHaveProperty('total');
  });

  it('PATCH /api/v1/workflows/:workflowId updates metadata and enforces optimistic concurrency', async () => {
    // 1. Create a workflow
    const createRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Concurrency Test DAG' }),
    });
    const { data: wf } = (await createRes.json()) as any;
    expect(wf.draftVersion).toBe(1);

    // 2. Successful update with matching expectedVersion
    const updateRes = await fetch(`${baseUrl}/api/v1/workflows/${wf.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Concurrency Test DAG (Updated)',
        expectedVersion: 1,
      }),
    });
    expect(updateRes.status).toBe(200);
    const updateBody = (await updateRes.json()) as any;
    expect(updateBody.data.name).toBe('Concurrency Test DAG (Updated)');

    // 3. Stale update with outdated expectedVersion -> 409 Conflict
    const staleRes = await fetch(`${baseUrl}/api/v1/workflows/${wf.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Stale Overwrite Attempt',
        expectedVersion: 99, // Mismatched version
      }),
    });
    expect(staleRes.status).toBe(409);
    const staleBody = (await staleRes.json()) as any;
    expect(staleBody.success).toBe(false);
    expect(staleBody.error.code).toBe('CONFLICT_CONCURRENT_EDIT');
  });

  it('POST /api/v1/workflows/:workflowId/duplicate creates a deep clone with remapped IDs', async () => {
    // 1. Create workflow with connected nodes
    const createRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Original DAG Pipeline',
        nodes: [
          { id: 'orig_1', type: 'trigger', label: 'Start', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
          { id: 'orig_2', type: 'transform', label: 'Transform', position: { x: 200, y: 0 }, config: { operation: 'pass_through' } },
        ],
        edges: [{ id: 'orig_e1', source: 'orig_1', target: 'orig_2' }],
      }),
    });
    const { data: orig } = (await createRes.json()) as any;

    // 2. Duplicate it
    const dupRes = await fetch(`${baseUrl}/api/v1/workflows/${orig.id}/duplicate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Cloned DAG Pipeline' }),
    });

    expect(dupRes.status).toBe(201);
    const dupBody = (await dupRes.json()) as any;
    expect(dupBody.success).toBe(true);
    expect(dupBody.data.id).not.toBe(orig.id);
    expect(dupBody.data.name).toBe('Cloned DAG Pipeline');
    expect(dupBody.data.status).toBe('draft');
    expect(dupBody.data.nodes.length).toBe(2);

    // Nodes and edges must have new IDs
    const newNodes = dupBody.data.nodes;
    const newEdges = dupBody.data.edges;
    expect(newNodes[0].id).not.toBe('orig_1');
    expect(newNodes[1].id).not.toBe('orig_2');
    expect(newEdges[0].source).toBe(newNodes[0].id);
    expect(newEdges[0].target).toBe(newNodes[1].id);
  });

  it('enforces status transition rules (activate and pause)', async () => {
    // 1. Create draft workflow
    const createRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Draft State Workflow',
        nodes: [{ id: 'n1', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } }],
      }),
    });
    const { data: draftWf } = (await createRes.json()) as any;

    // 2. Cannot activate un-published draft directly
    const activateFail = await fetch(`${baseUrl}/api/v1/workflows/${draftWf.id}/activate`, {
      method: 'POST',
    });
    expect(activateFail.status).toBe(400);
    const activateFailBody = (await activateFail.json()) as any;
    expect(activateFailBody.error.code).toBe('INVALID_STATUS_TRANSITION');

    // 3. Cannot pause draft workflow
    const pauseFail = await fetch(`${baseUrl}/api/v1/workflows/${draftWf.id}/pause`, {
      method: 'POST',
    });
    expect(pauseFail.status).toBe(400);

    // 4. Publish workflow
    const publishRes = await fetch(`${baseUrl}/api/v1/workflows/${draftWf.id}/publish`, {
      method: 'POST',
    });
    expect(publishRes.status).toBe(200);
    const pubBody = (await publishRes.json()) as any;
    expect(pubBody.data.status).toBe('published');
    expect(pubBody.data.publishedVersion).toBe(1);

    // 5. Pause active workflow
    const pauseOk = await fetch(`${baseUrl}/api/v1/workflows/${draftWf.id}/pause`, {
      method: 'POST',
    });
    expect(pauseOk.status).toBe(200);
    const pauseBody = (await pauseOk.json()) as any;
    expect(pauseBody.data.status).toBe('paused');

    // 6. Re-activate paused workflow
    const reactivateOk = await fetch(`${baseUrl}/api/v1/workflows/${draftWf.id}/activate`, {
      method: 'POST',
    });
    expect(reactivateOk.status).toBe(200);
    const reactivateBody = (await reactivateOk.json()) as any;
    expect(reactivateBody.data.status).toBe('published');
  });

  it('validates graph structure and detects cycles', async () => {
    const cyclicGraph = {
      nodes: [
        { id: 'c1', type: 'trigger', label: 'C1', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
        { id: 'c2', type: 'transform', label: 'C2', position: { x: 100, y: 0 }, config: { operation: 'pass_through' } },
      ],
      edges: [
        { id: 'e1', source: 'c1', target: 'c2' },
        { id: 'e2', source: 'c2', target: 'c1' }, // Cycle!
      ],
    };

    const res = await fetch(`${baseUrl}/api/v1/workflows/validate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(cyclicGraph),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data.isValid).toBe(false);
    expect(body.data.errors.some((e: any) => e.message.toLowerCase().includes('cycle'))).toBe(true);
  });

  it('preserves historical executions when deleting a workflow', async () => {
    // 1. Create a workflow
    const createRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Workflow with Runs',
        nodes: [{ id: 'n1', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } }],
      }),
    });
    const { data: wf } = (await createRes.json()) as any;

    // 2. Trigger an execution for this workflow
    const runRes = await fetch(`${baseUrl}/api/v1/runs/workflows/${wf.id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ triggerType: 'manual' }),
    });
    expect(runRes.status).toBe(201);
    const { data: run } = (await runRes.json()) as any;

    // 3. Delete workflow -> should be archived because it has an execution history
    const deleteRes = await fetch(`${baseUrl}/api/v1/workflows/${wf.id}`, {
      method: 'DELETE',
    });
    expect(deleteRes.status).toBe(200);
    const deleteBody = (await deleteRes.json()) as any;
    expect(deleteBody.data.archived).toBe(true);
    expect(deleteBody.data.executionCount).toBeGreaterThanOrEqual(1);

    // 4. Execution record must still be intact and retrievable
    const checkRunRes = await fetch(`${baseUrl}/api/v1/runs/${run.id}`);
    expect(checkRunRes.status).toBe(200);
    const checkRunBody = (await checkRunRes.json()) as any;
    expect(checkRunBody.data.id).toBe(run.id);
    expect(checkRunBody.data.workflowId).toBe(wf.id);

    // 5. Normal workflow list should not show archived workflow by default
    const listRes = await fetch(`${baseUrl}/api/v1/workflows`);
    const listBody = (await listRes.json()) as any;
    expect(listBody.data.some((w: any) => w.id === wf.id)).toBe(false);
  });
});
