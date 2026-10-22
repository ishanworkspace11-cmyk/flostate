import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../server.js';
import { durableDagOrchestrator } from '../engine/durable-dag.orchestrator.js';
import { NodeExecutorRegistry } from '../engine/node-executor.registry.js';
import { localQueueRunner } from '../queue/local-queue-runner.js';
import { WorkerProcess } from '../worker/worker-process.js';
import { executionRepository } from '../repositories/execution.repository.js';
import { workerRepository } from '../repositories/worker.repository.js';
import { Server } from 'http';

describe('Durable DAG Execution Engine & Distributed Worker Backend', () => {
  let server: Server;
  let baseUrl: string;
  let testWorker: WorkerProcess;

  beforeAll(async () => {
    // Start HTTP server on dynamic port
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 4001;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // Start a test worker process
    testWorker = new WorkerProcess({ workerId: 'test-worker-durable-01', concurrency: 10 });
    await testWorker.start();
  });

  afterAll(async () => {
    await testWorker.stop();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('POST /api/v1/workflows/:id/runs creates a run and acknowledges it has been queued without premature success', async () => {
    // 1. Create and publish a workflow
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Durable Queue Ack Test',
        nodes: [
          { id: 't1', type: 'trigger', label: 'Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
          { id: 'd1', type: 'delay', label: 'Async Delay Step', position: { x: 100, y: 0 }, config: { durationMs: 400 } },
        ],
        edges: [{ id: 'e1', source: 't1', target: 'd1' }],
      }),
    });
    expect(wfRes.status).toBe(201);
    const { data: wf } = (await wfRes.json()) as any;

    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    // 2. Call POST /api/v1/workflows/:id/runs
    const runRes = await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: { testKey: 'val_123' },
        triggerType: 'manual',
      }),
    });

    expect(runRes.status).toBe(201);
    const runBody = (await runRes.json()) as any;
    expect(runBody.success).toBe(true);
    expect(runBody.data).toHaveProperty('id');
    expect(runBody.data.workflowId).toBe(wf.id);

    // Initial acknowledgment must NOT claim execution has completed or succeeded already
    expect(['Running', 'Pending', 'Ready']).toContain(runBody.data.status);
    expect(runBody.message).toContain('queued');

    // 3. Await worker completion
    const finalRun = await durableDagOrchestrator.waitForCompletion(runBody.data.id, 5000);
    expect(finalRun.status).toBe('Succeeded');
    expect(finalRun.nodeExecutions.t1.status).toBe('Succeeded');
    expect(finalRun.nodeExecutions.d1.status).toBe('Succeeded');
  });

  it('GET /api/v1/runs/:runId and GET /api/v1/runs/:runId/nodes return execution details and per-node records', async () => {
    // 1. Create and publish workflow
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Node Details Inspection Test',
        nodes: [
          { id: 'trig', type: 'trigger', label: 'Start Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
          { id: 'trans', type: 'transform', label: 'Transform Step', position: { x: 100, y: 0 }, config: { operation: 'pass_through' } },
        ],
        edges: [{ id: 'e1', source: 'trig', target: 'trans' }],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    // 2. Queue run
    const runRes = await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: { orderId: 9942 } }),
    });
    const { data: queuedRun } = (await runRes.json()) as any;

    await durableDagOrchestrator.waitForCompletion(queuedRun.id, 4000);

    // 3. Test GET /api/v1/runs/:runId
    const getRunRes = await fetch(`${baseUrl}/api/v1/runs/${queuedRun.id}`);
    expect(getRunRes.status).toBe(200);
    const getRunBody = (await getRunRes.json()) as any;
    expect(getRunBody.success).toBe(true);
    expect(getRunBody.data.id).toBe(queuedRun.id);
    expect(getRunBody.data.status).toBe('Succeeded');
    expect(getRunBody.data.input.orderId).toBe(9942);

    // 4. Test GET /api/v1/runs/:runId/nodes
    const getNodesRes = await fetch(`${baseUrl}/api/v1/runs/${queuedRun.id}/nodes`);
    expect(getNodesRes.status).toBe(200);
    const getNodesBody = (await getNodesRes.json()) as any;
    expect(getNodesBody.success).toBe(true);
    expect(Array.isArray(getNodesBody.data)).toBe(true);
    expect(getNodesBody.data.length).toBe(2);

    const transNode = getNodesBody.data.find((n: any) => n.nodeId === 'trans');
    expect(transNode).toBeDefined();
    expect(transNode.status).toBe('Succeeded');
    expect(transNode.logs.length).toBeGreaterThan(0);
  });

  it('Branching and Merging: Merging node waits until all upstream branches have succeeded', async () => {
    // Workflow shape:
    //         --> BranchA (delay 200ms) --\
    // Trigger                               --> Merge (transform)
    //         --> BranchB (delay 100ms) --/
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Diamond Branch-Merge DAG',
        nodes: [
          { id: 'T', type: 'trigger', label: 'Trigger', position: { x: 0, y: 100 }, config: { triggerType: 'manual' } },
          { id: 'A', type: 'delay', label: 'Branch A', position: { x: 150, y: 50 }, config: { durationMs: 200 } },
          { id: 'B', type: 'delay', label: 'Branch B', position: { x: 150, y: 150 }, config: { durationMs: 100 } },
          { id: 'M', type: 'transform', label: 'Merge Step', position: { x: 300, y: 100 }, config: { operation: 'pass_through' } },
        ],
        edges: [
          { id: 'e1', source: 'T', target: 'A' },
          { id: 'e2', source: 'T', target: 'B' },
          { id: 'e3', source: 'A', target: 'M' },
          { id: 'e4', source: 'B', target: 'M' },
        ],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    const run = await durableDagOrchestrator.createRun(wf.id, {
      input: { initialParam: 'diamond-test' },
    });

    const completed = await durableDagOrchestrator.waitForCompletion(run.id, 6000);
    expect(completed.status).toBe('Succeeded');

    // Both branches and merge step succeeded
    expect(completed.nodeExecutions.T.status).toBe('Succeeded');
    expect(completed.nodeExecutions.A.status).toBe('Succeeded');
    expect(completed.nodeExecutions.B.status).toBe('Succeeded');
    expect(completed.nodeExecutions.M.status).toBe('Succeeded');

    // Merge node received inputs from both parent branches
    const mInput = completed.nodeExecutions.M.input as any;
    expect(mInput.upstream).toHaveProperty('A');
    expect(mInput.upstream).toHaveProperty('B');
  });

  it('Input/Output Data Propagation: Values flow correctly through transform nodes', async () => {
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Data Propagation Pipeline',
        nodes: [
          {
            id: 'T',
            type: 'trigger',
            label: 'Trigger',
            position: { x: 0, y: 0 },
            config: { triggerType: 'manual', defaultPayload: { user: { firstName: 'Bruce', lastName: 'Wayne' } } },
          },
          {
            id: 'Extract',
            type: 'transform',
            label: 'Extract User',
            position: { x: 150, y: 0 },
            config: { operation: 'json_extract', extractPath: 'data.user', targetField: 'extractedUser' },
          },
          {
            id: 'Format',
            type: 'transform',
            label: 'Format Greeting',
            position: { x: 300, y: 0 },
            config: { operation: 'string_template', template: 'Hello {{extractedUser.firstName}} {{extractedUser.lastName}}!', targetField: 'greeting' },
          },
        ],
        edges: [
          { id: 'e1', source: 'T', target: 'Extract' },
          { id: 'e2', source: 'Extract', target: 'Format' },
        ],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    const run = await durableDagOrchestrator.createRun(wf.id);
    const completed = await durableDagOrchestrator.waitForCompletion(run.id, 4000);

    expect(completed.status).toBe('Succeeded');
    const formatOutput = completed.nodeExecutions.Format.output as any;
    expect(formatOutput.greeting).toBe('Hello Bruce Wayne!');
  });

  it('Failure Propagation: Permanent failure stops downstream nodes and marks them as Skipped', async () => {
    // Pipeline: Trigger -> Step1 (OK) -> StepFail (permanent error) -> StepBlocked (skipped)
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Failure Propagation DAG',
        nodes: [
          { id: 'T', type: 'trigger', label: 'Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
          { id: 'Step1', type: 'transform', label: 'Step 1', position: { x: 100, y: 0 }, config: { operation: 'pass_through' } },
          {
            id: 'StepFail',
            type: 'httpRequest',
            label: 'Failing Step',
            position: { x: 200, y: 0 },
            config: {
              url: 'https://example.com/api/orders',
              mockResponse: { enabled: true, status: 400, body: { error: 'Bad request permanent failure' } },
            },
          },
          { id: 'StepBlocked', type: 'transform', label: 'Downstream Blocked', position: { x: 300, y: 0 }, config: { operation: 'pass_through' } },
        ],
        edges: [
          { id: 'e1', source: 'T', target: 'Step1' },
          { id: 'e2', source: 'Step1', target: 'StepFail' },
          { id: 'e3', source: 'StepFail', target: 'StepBlocked' },
        ],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    const run = await durableDagOrchestrator.createRun(wf.id);
    const completed = await durableDagOrchestrator.waitForCompletion(run.id, 4000);

    expect(completed.status).toBe('Failed');
    expect(completed.nodeExecutions.Step1.status).toBe('Succeeded');
    expect(completed.nodeExecutions.StepFail.status).toBe('Failed');

    // Downstream node must be Skipped, NOT Pending or Failed
    expect(completed.nodeExecutions.StepBlocked.status).toBe('Skipped');
    expect(completed.nodeExecutions.StepBlocked.error).toContain('failed');
  });

  it('Validated Retry Endpoint: Resumes a failed run via POST /api/v1/runs/:id/retry', async () => {
    // 1. Create a workflow with a failing node configured with mock failure
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Retryable Run Workflow',
        nodes: [
          { id: 'T', type: 'trigger', label: 'Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
          {
            id: 'Step1',
            type: 'httpRequest',
            label: 'Http Step',
            position: { x: 150, y: 0 },
            config: {
              url: 'https://example.com/api/test',
              mockResponse: { enabled: true, status: 400, body: { error: 'Initial permanent failure' } },
            },
          },
        ],
        edges: [{ id: 'e1', source: 'T', target: 'Step1' }],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    // Execute run -> will fail
    const run = await durableDagOrchestrator.createRun(wf.id);
    const failedRun = await durableDagOrchestrator.waitForCompletion(run.id, 4000);
    expect(failedRun.status).toBe('Failed');

    // 2. Fix the workflow node config in published version
    const patchedWf = await fetch(`${baseUrl}/api/v1/workflows/${wf.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: [
          { id: 'T', type: 'trigger', label: 'Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'manual' } },
          {
            id: 'Step1',
            type: 'httpRequest',
            label: 'Http Step',
            position: { x: 150, y: 0 },
            config: {
              url: 'https://example.com/api/test',
              mockResponse: { enabled: true, status: 200, body: { recovered: true } },
            },
          },
        ],
        edges: [{ id: 'e1', source: 'T', target: 'Step1' }],
      }),
    });
    expect(patchedWf.status).toBe(200);
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    // 3. Call retry endpoint
    const retryRes = await fetch(`${baseUrl}/api/v1/runs/${failedRun.id}/retry`, {
      method: 'POST',
    });
    expect(retryRes.status).toBe(200);
    const retryBody = (await retryRes.json()) as any;
    expect(retryBody.success).toBe(true);

    // Wait for retried run to finish (new child execution record)
    const retriedRunId = retryBody.data.id;
    const retriedRun = await durableDagOrchestrator.waitForCompletion(retriedRunId, 4000);
    expect(retriedRun.status).toBe('Succeeded');
    expect(retriedRun.nodeExecutions.Step1.status).toBe('Succeeded');

    // Confirm original run history was NOT mutated (Prompt 6 requirement)
    const originalRun = await executionRepository.findById(failedRun.id);
    expect(originalRun?.status).toBe('Failed');
  });

  it('Worker Heartbeats: Worker records heartbeat, identity, and queues metrics', async () => {
    const workers = await workerRepository.listWorkers();
    expect(Array.isArray(workers)).toBe(true);
    expect(workers.length).toBeGreaterThan(0);

    const currentWorker = workers.find((w) => w.id === testWorker.workerId);
    expect(currentWorker).toBeDefined();
    expect(currentWorker?.hostname).toBe(testWorker.hostname);
    expect(['idle', 'busy']).toContain(currentWorker?.status);

    const queueSummaries = await workerRepository.getQueueSummaries();
    expect(Array.isArray(queueSummaries)).toBe(true);
    expect(queueSummaries.length).toBeGreaterThan(0);
    expect(queueSummaries[0]).toHaveProperty('queueName');
  });
});
