import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../server.js';
import http from 'http';

describe('Dormammu Engine API v1 & Architecture Integration', () => {
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

  it('GET /api/v1/health returns process health, version, and uptime', async () => {
    const res = await fetch(`${baseUrl}/api/v1/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('ok');
    expect(body.data.service).toBe('dormammu-engine-backend');
    expect(body.data.version).toBe('1.0.0');
    expect(typeof body.data.uptimeSeconds).toBe('number');
  });

  it('GET /api/v1/ready returns infrastructure readiness status and dependencies', async () => {
    const res = await fetch(`${baseUrl}/api/v1/ready`);
    expect([200, 503]).toContain(res.status);

    const body = (await res.json()) as any;
    expect(body.data).toHaveProperty('dependencies');
    expect(body.data.dependencies).toHaveProperty('database');
    expect(body.data.dependencies).toHaveProperty('redis');
  });

  it('GET /api/v1/workflows returns list of workflows with metadata', async () => {
    const res = await fetch(`${baseUrl}/api/v1/workflows`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toHaveProperty('total');
  });

  it('POST /api/v1/workflows validates payload and creates workflow', async () => {
    const newWorkflow = {
      name: 'Integration Test DAG',
      description: 'Created by automated integration test',
      status: 'draft',
      nodes: [
        {
          id: 't1',
          type: 'trigger',
          label: 'Test Trigger',
          position: { x: 50, y: 50 },
          config: { triggerType: 'manual' },
        },
      ],
      edges: [],
    };

    const res = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newWorkflow),
    });

    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.name).toBe('Integration Test DAG');
    expect(body.data.draftVersion).toBe(1);

    const createdId = body.data.id;

    // Fetch by ID
    const getRes = await fetch(`${baseUrl}/api/v1/workflows/${createdId}`);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as any;
    expect(getBody.data.id).toBe(createdId);
  });

  it('POST /api/v1/workflows rejects invalid payload with 400 validation error', async () => {
    const res = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: 'Missing required name field' }),
    });

    expect(res.status).toBe(400);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('VALIDATION_ERROR');
  });

  it('POST /api/v1/runs/workflows/:id/run triggers execution and persists run', async () => {
    // 1. Get a workflow
    const wfListRes = await fetch(`${baseUrl}/api/v1/workflows`);
    const wfListBody = (await wfListRes.json()) as any;
    const targetWf = wfListBody.data[0];

    // 2. Trigger run
    const runRes = await fetch(`${baseUrl}/api/v1/runs/workflows/${targetWf.id}/run`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { testParam: 42 },
        triggerType: 'manual',
      }),
    });

    expect(runRes.status).toBe(201);
    const runBody = (await runRes.json()) as any;
    expect(runBody.success).toBe(true);
    expect(runBody.data).toHaveProperty('id');
    expect(runBody.data.workflowId).toBe(targetWf.id);
    expect(runBody.data).toHaveProperty('status');
    expect(runBody.data).toHaveProperty('nodeExecutions');

    // 3. Inspect runs list
    const runsListRes = await fetch(`${baseUrl}/api/v1/runs?workflowId=${targetWf.id}`);
    expect(runsListRes.status).toBe(200);
    const runsListBody = (await runsListRes.json()) as any;
    expect(runsListBody.success).toBe(true);
    expect(runsListBody.meta.total).toBeGreaterThanOrEqual(1);
  });

  it('GET /api/v1/triggers, /workers, and /settings return appropriate data models', async () => {
    const [triggersRes, workersRes, settingsRes] = await Promise.all([
      fetch(`${baseUrl}/api/v1/triggers`),
      fetch(`${baseUrl}/api/v1/workers`),
      fetch(`${baseUrl}/api/v1/settings`),
    ]);

    expect(triggersRes.status).toBe(200);
    const triggersBody = (await triggersRes.json()) as any;
    expect(triggersBody.success).toBe(true);
    expect(Array.isArray(triggersBody.data)).toBe(true);

    expect(workersRes.status).toBe(200);
    const workersBody = (await workersRes.json()) as any;
    expect(workersBody.success).toBe(true);
    expect(Array.isArray(workersBody.data)).toBe(true);

    expect(settingsRes.status).toBe(200);
    const settingsBody = (await settingsRes.json()) as any;
    expect(settingsBody.success).toBe(true);
    expect(Array.isArray(settingsBody.data)).toBe(true);
  });

  it('returns 404 with structured error on nonexistent route', async () => {
    const res = await fetch(`${baseUrl}/api/v1/nonexistent-route-404`);
    expect(res.status).toBe(404);
    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error.code).toBe('NOT_FOUND');
  });
});
