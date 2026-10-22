import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { apiV1Router } from '../routes/v1/index.js';
import { errorHandlerMiddleware } from '../middleware/error.middleware.js';
import { store } from '../services/store.service.js';
import { durableDagOrchestrator } from '../engine/durable-dag.orchestrator.js';
import { WorkerProcess } from '../worker/worker-process.js';
import { executionEventBus } from '../engine/execution-events.js';
import { sanitizePayload, sanitizeString, sanitizeLogs } from '../utils/sanitizer.js';
import { Server } from 'http';

describe('Prompt 6: Execution Details, Logs, Node History, SSE, and Retry API', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;
  let worker: WorkerProcess;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/v1', apiV1Router);
    app.use(errorHandlerMiddleware);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    worker = new WorkerProcess({
      workerId: 'test-worker-prompt6',
      concurrency: 5,
    });
    await worker.start();
  });

  afterAll(async () => {
    await worker.stop();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('Secret Redaction: Correctly masks sensitive keys, bearer tokens, passwords, and API keys', () => {
    const rawPayload = {
      username: 'agent_dormammu',
      password: 'super_secret_password_123',
      api_key: 'sk-live-99238491823912831293',
      authorization: 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
      webhook_secret: 'whsec_9999999999',
      nested: {
        token: 'secret-token-xyz',
        dbUrl: 'https://admin:pass1234@postgres.internal.net/dormammu',
        safeData: 'visible data',
      },
    };

    const sanitized = sanitizePayload(rawPayload) as any;
    expect(sanitized.username).toBe('agent_dormammu');
    expect(sanitized.password).toBe('[REDACTED]');
    expect(sanitized.api_key).toBe('[REDACTED]');
    expect(sanitized.authorization).toBe('[REDACTED]');
    expect(sanitized.webhook_secret).toBe('[REDACTED]');
    expect(sanitized.nested.token).toBe('[REDACTED]');
    expect(sanitized.nested.dbUrl).toContain('admin:[REDACTED]@postgres.internal.net');
    expect(sanitized.nested.safeData).toBe('visible data');

    // Test log sanitization
    const logs = sanitizeLogs([
      { level: 'info', message: 'Calling API with Bearer my_secret_token_123' },
      { level: 'warn', message: 'Auth failed for Basic dXNlcjpwYXNz' },
    ]);
    expect(logs[0].message).toBe('Calling API with Bearer [REDACTED]');
    expect(logs[1].message).toBe('Auth failed for Basic [REDACTED]');
  });

  it('GET /api/v1/runs/:runId: Returns run details with node-level summary, redacted secrets, and 404 for missing', async () => {
    // 404 test for non-existent run
    const notFoundRes = await fetch(`${baseUrl}/api/v1/runs/non_existent_run_999`);
    expect(notFoundRes.status).toBe(404);
    const notFoundBody = (await notFoundRes.json()) as any;
    expect(notFoundBody.error.code).toBe('EXECUTION_NOT_FOUND');

    // Create a workflow with sensitive inputs and execute it
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Details Test Workflow',
        nodes: [
          {
            id: 'T',
            type: 'trigger',
            label: 'Trigger',
            position: { x: 0, y: 0 },
            config: { triggerType: 'manual' },
          },
          {
            id: 'Trans',
            type: 'transform',
            label: 'Transform Step',
            position: { x: 150, y: 0 },
            config: { operation: 'pass_through' },
          },
        ],
        edges: [{ id: 'e1', source: 'T', target: 'Trans' }],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    // Trigger run with sensitive inputs
    const runRes = await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: {
          clientId: 'dormammu-client-01',
          apiKey: 'sk-dormammu-secret-key-1234567890',
          password: 'plain_password',
        },
      }),
    });
    expect(runRes.status).toBe(201);
    const { data: run } = (await runRes.json()) as any;

    // Await run completion
    const completed = await durableDagOrchestrator.waitForCompletion(run.id, 4000);
    expect(completed.status).toBe('Succeeded');

    // Fetch details via GET /api/v1/runs/:runId
    const getRes = await fetch(`${baseUrl}/api/v1/runs/${run.id}`);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as any;
    expect(getBody.success).toBe(true);
    expect(getBody.data.id).toBe(run.id);
    expect(getBody.data.workflowId).toBe(wf.id);
    expect(getBody.data.status).toBe('Succeeded');
    expect(getBody.data.startedAt).toBeDefined();
    expect(getBody.data.completedAt).toBeDefined();
    expect(getBody.data.durationMs).toBeGreaterThanOrEqual(0);

    // Verify secrets are redacted in returned payload
    expect(getBody.data.input.clientId).toBe('dormammu-client-01');
    expect(getBody.data.input.apiKey).toBe('[REDACTED]');
    expect(getBody.data.input.password).toBe('[REDACTED]');

    // Verify nodeExecutions map is present
    expect(getBody.data.nodeExecutions).toBeDefined();
    expect(getBody.data.nodeExecutions.T.status).toBe('Succeeded');
    expect(getBody.data.nodeExecutions.Trans.status).toBe('Succeeded');
  });

  it('GET /api/v1/runs/:runId/nodes: Returns accurate node execution list and orders', async () => {
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Node List Workflow',
        nodes: [
          { id: 'T', type: 'trigger', label: 'Trigger Node', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
          { id: 'StepA', type: 'transform', label: 'Step Alpha', position: { x: 100, y: 0 }, config: { operation: 'pass_through' } },
        ],
        edges: [{ id: 'e1', source: 'T', target: 'StepA' }],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    const run = await durableDagOrchestrator.createRun(wf.id, { sync: true });

    const nodesRes = await fetch(`${baseUrl}/api/v1/runs/${run.id}/nodes`);
    expect(nodesRes.status).toBe(200);
    const nodesBody = (await nodesRes.json()) as any;
    expect(nodesBody.success).toBe(true);
    expect(Array.isArray(nodesBody.data)).toBe(true);
    expect(nodesBody.data.length).toBe(2);

    const nodeIds = nodesBody.data.map((n: any) => n.nodeId);
    expect(nodeIds).toContain('T');
    expect(nodeIds).toContain('StepA');
    for (const node of nodesBody.data) {
      expect(node.executionId).toBe(run.id);
      expect(node.status).toBe('Succeeded');
    }
  });

  it('GET /api/v1/runs/:runId/nodes/:nodeExecutionId: Returns node details with log pagination and validates run ownership', async () => {
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Node Details Workflow',
        nodes: [
          { id: 'T', type: 'trigger', label: 'Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
        ],
        edges: [],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    const run = await durableDagOrchestrator.createRun(wf.id, { sync: true });
    const triggerNode = run.nodeExecutions.T;

    // 1. Fetch node by nodeId or node ID
    const nodeRes = await fetch(`${baseUrl}/api/v1/runs/${run.id}/nodes/${triggerNode.nodeId}`);
    expect(nodeRes.status).toBe(200);
    const nodeBody = (await nodeRes.json()) as any;
    expect(nodeBody.success).toBe(true);
    expect(nodeBody.data.nodeId).toBe('T');
    expect(nodeBody.data.status).toBe('Succeeded');
    expect(nodeBody.data.logs).toBeDefined();
    expect(nodeBody.data.totalLogs).toBeGreaterThan(0);

    // 2. Log pagination
    const paginatedRes = await fetch(`${baseUrl}/api/v1/runs/${run.id}/nodes/${triggerNode.nodeId}?limit=1&offset=0`);
    expect(paginatedRes.status).toBe(200);
    const paginatedBody = (await paginatedRes.json()) as any;
    expect(paginatedBody.data.logs.length).toBeLessThanOrEqual(1);

    // 3. Ownership validation: query non-existent node execution
    const invalidNodeRes = await fetch(`${baseUrl}/api/v1/runs/${run.id}/nodes/node_that_does_not_exist`);
    expect(invalidNodeRes.status).toBe(404);
    const invalidBody = (await invalidNodeRes.json()) as any;
    expect(invalidBody.error.code).toBe('NODE_EXECUTION_NOT_FOUND');
  });

  it('Retry Eligibility: Enforces safeguards preventing retries on running or succeeded runs', async () => {
    // 1. Create a successful workflow
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Eligibility Workflow',
        nodes: [{ id: 'T', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } }],
        edges: [],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    const run = await durableDagOrchestrator.createRun(wf.id, { sync: true });
    expect(run.status).toBe('Succeeded');

    // Attempting to retry a Succeeded run must return 400 Bad Request
    const retrySucceededRes = await fetch(`${baseUrl}/api/v1/runs/${run.id}/retry`, {
      method: 'POST',
    });
    expect(retrySucceededRes.status).toBe(400);
    const retrySucceededBody = (await retrySucceededRes.json()) as any;
    expect(retrySucceededBody.error.code).toBe('RUN_ALREADY_SUCCEEDED');

    // Attempting to retry a currently active run must return 409 Conflict
    const activeRun = {
      ...run,
      id: 'active_run_test_conflict',
      status: 'Running' as const,
    };
    await store.saveExecution(activeRun);

    const retryActiveRes = await fetch(`${baseUrl}/api/v1/runs/${activeRun.id}/retry`, {
      method: 'POST',
    });
    expect(retryActiveRes.status).toBe(409);
    const retryActiveBody = (await retryActiveRes.json()) as any;
    expect(retryActiveBody.error.code).toBe('CONFLICT_RUN_ACTIVE');
  });

  it('Retry Persistence & Immutability: Retrying creates a NEW execution without mutating original history', async () => {
    // 1. Create failing workflow
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Immutable Retry Pipeline',
        nodes: [
          { id: 'T', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
          { id: 'StepSuccess', type: 'transform', label: 'Success Step', position: { x: 100, y: 0 }, config: { operation: 'pass_through' } },
          {
            id: 'StepFail',
            type: 'httpRequest',
            label: 'Fail Step',
            position: { x: 200, y: 0 },
            config: {
              url: 'https://example.com/api',
              mockResponse: { enabled: true, status: 500, body: { error: 'Initial server failure' } },
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'T', target: 'StepSuccess' },
          { id: 'e2', source: 'StepSuccess', target: 'StepFail' },
        ],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    // Execute run -> fails
    const initialRun = await durableDagOrchestrator.createRun(wf.id);
    const completedInitial = await durableDagOrchestrator.waitForCompletion(initialRun.id, 4000);
    expect(completedInitial.status).toBe('Failed');
    expect(completedInitial.nodeExecutions.StepSuccess.status).toBe('Succeeded');
    expect(completedInitial.nodeExecutions.StepFail.status).toBe('Failed');

    // 2. Fix the workflow configuration in published snapshot
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: [
          { id: 'T', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
          { id: 'StepSuccess', type: 'transform', label: 'Success Step', position: { x: 100, y: 0 }, config: { operation: 'pass_through' } },
          {
            id: 'StepFail',
            type: 'httpRequest',
            label: 'Fail Step',
            position: { x: 200, y: 0 },
            config: {
              url: 'https://example.com/api',
              mockResponse: { enabled: true, status: 200, body: { ok: true } },
            },
          },
        ],
        edges: [
          { id: 'e1', source: 'T', target: 'StepSuccess' },
          { id: 'e2', source: 'StepSuccess', target: 'StepFail' },
        ],
      }),
    });
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    // 3. Initiate retry
    const retryRes = await fetch(`${baseUrl}/api/v1/runs/${completedInitial.id}/retry`, {
      method: 'POST',
    });
    expect(retryRes.status).toBe(200);
    const retryBody = (await retryRes.json()) as any;
    expect(retryBody.success).toBe(true);

    const newRetryRun = retryBody.data;
    // CRITICAL REQUIREMENT: Must create a new execution record, not overwrite original ID
    expect(newRetryRun.id).not.toBe(completedInitial.id);
    expect(newRetryRun.retryOfRunId).toBe(completedInitial.id);
    expect(newRetryRun.retryAttempt).toBe(2);

    // Wait for retried run to complete
    const completedRetry = await durableDagOrchestrator.waitForCompletion(newRetryRun.id, 4000);
    expect(completedRetry.status).toBe('Succeeded');
    expect(completedRetry.nodeExecutions.StepFail.status).toBe('Succeeded');

    // CRITICAL REQUIREMENT: Original run's status and history must remain untouched
    const originalCheck = await store.getExecution(completedInitial.id);
    expect(originalCheck?.status).toBe('Failed');
    expect(originalCheck?.nodeExecutions.StepFail.status).toBe('Failed');
  });

  it('GET /api/v1/runs/:runId/events (SSE): Streams initial state, terminal close, and headers', async () => {
    // 1. Create a completed run
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'SSE Test Workflow',
        nodes: [{ id: 'T', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } }],
        edges: [],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    const run = await durableDagOrchestrator.createRun(wf.id, { sync: true });

    // Connect to SSE endpoint
    const sseRes = await fetch(`${baseUrl}/api/v1/runs/${run.id}/events`);
    expect(sseRes.status).toBe(200);
    expect(sseRes.headers.get('content-type')).toContain('text/event-stream');

    const sseBody = await sseRes.text();
    // Must contain run_state event and close event
    expect(sseBody).toContain('event: run_state');
    expect(sseBody).toContain('event: close');
    expect(sseBody).toContain(run.id);
  });
});
