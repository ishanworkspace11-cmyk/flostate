import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { apiV1Router } from '../routes/v1/index.js';
import { webhookIngressRouter } from '../routes/v1/trigger.routes.js';
import { errorHandlerMiddleware } from '../middleware/error.middleware.js';
import { WorkerProcess, defaultWorker } from '../worker/worker-process.js';
import { Server } from 'http';

describe('Prompt 10: Full End-to-End Execution Lifecycle & Resilience', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;
  let worker: WorkerProcess;

  beforeAll(async () => {
    app = express();
    app.use(express.json());
    app.use('/api/v1', apiV1Router);
    app.use('/api/v1/webhooks', webhookIngressRouter);
    app.use(errorHandlerMiddleware);

    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const port = (server.address() as any).port;
        baseUrl = `http://127.0.0.1:${port}`;
        resolve();
      });
    });

    worker = new WorkerProcess({
      workerId: 'e2e-worker-lifecycle',
      concurrency: 5,
    });
    await worker.start();
  });

  afterAll(async () => {
    await worker.stop();
    await defaultWorker.stop();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('Executes the 15-step complete lifecycle from workflow draft to execution, logs, retries, and webhook triggers', async () => {
    // ----------------------------------------------------
    // Step 1: Create a workflow
    // ----------------------------------------------------
    const createRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Order Fulfillment Pipeline E2E',
        description: 'E2E automated testing pipeline',
      }),
    });
    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as any;
    expect(createBody.success).toBe(true);
    const workflowId = createBody.data.id;
    expect(workflowId).toBeDefined();

    // ----------------------------------------------------
    // Step 2 & 3: Add trigger + 2 processing nodes, connect edges, and save draft
    // ----------------------------------------------------
    const nodes = [
      {
        id: 'node-trigger',
        type: 'trigger',
        label: 'Order Ingestion',
        position: { x: 50, y: 100 },
        config: {
          triggerType: 'manual',
          defaultPayload: { orderId: 'ord_9901', customer: 'Alice Cooper', amount: 250 },
        },
      },
      {
        id: 'node-transform',
        type: 'transform',
        label: 'Format Notification',
        position: { x: 300, y: 100 },
        config: {
          operation: 'string_template',
          template: 'Order {{data.orderId}} confirmed for {{data.customer}} (\$ {{data.amount}})',
          targetField: 'slackMsg',
        },
      },
      {
        id: 'node-http',
        type: 'httpRequest',
        label: 'Notify Fulfillment Service',
        position: { x: 600, y: 100 },
        config: {
          url: 'https://api.example.com/v1/orders',
          method: 'POST',
          mockResponse: {
            enabled: true,
            status: 200,
            body: { acknowledged: true, trackingNumber: 'TRK_882910' },
          },
        },
      },
    ];

    const edges = [
      { id: 'edge-1', source: 'node-trigger', target: 'node-transform' },
      { id: 'edge-2', source: 'node-transform', target: 'node-http' },
    ];

    const saveDraftRes = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nodes, edges }),
    });
    expect(saveDraftRes.status).toBe(200);

    // ----------------------------------------------------
    // Step 4 & 5: Reload editor and verify persistence across queries
    // ----------------------------------------------------
    const reloadRes = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}`);
    expect(reloadRes.status).toBe(200);
    const reloadBody = (await reloadRes.json()) as any;
    expect(reloadBody.data.nodes.length).toBe(3);
    expect(reloadBody.data.edges.length).toBe(2);
    expect(reloadBody.data.status).toBe('draft');

    // ----------------------------------------------------
    // Step 6: Validate and publish the workflow
    // ----------------------------------------------------
    const validateRes = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}/validate`, {
      method: 'POST',
    });
    expect(validateRes.status).toBe(200);
    const validateBody = (await validateRes.json()) as any;
    expect(validateBody.data.isValid).toBe(true);
    expect(validateBody.data.errors).toHaveLength(0);

    const publishRes = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}/publish`, {
      method: 'POST',
    });
    expect(publishRes.status).toBe(200);
    const publishBody = (await publishRes.json()) as any;
    expect(publishBody.data.status).toBe('published');
    expect(publishBody.data.publishedVersion).toBeGreaterThanOrEqual(1);

    // ----------------------------------------------------
    // Step 7, 8, 9: Start an execution, verify queue dispatch and worker execution
    // ----------------------------------------------------
    const runRes = await fetch(`${baseUrl}/api/v1/workflows/${workflowId}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        inputPayload: { orderId: 'ord_9901', customer: 'Alice Cooper', amount: 250 },
      }),
    });
    expect(runRes.status).toBe(201);
    const runBody = (await runRes.json()) as any;
    expect(runBody.success).toBe(true);
    const runId = runBody.data.id;
    expect(runId).toBeDefined();

    // Poll until run completes
    let runRecord: any;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const checkRes = await fetch(`${baseUrl}/api/v1/runs/${runId}`);
      if (checkRes.status === 200) {
        const body = (await checkRes.json()) as any;
        runRecord = body.data;
        if (runRecord.status === 'Succeeded' || runRecord.status === 'Failed') {
          break;
        }
      }
    }

    expect(runRecord).toBeDefined();
    expect(runRecord.status).toBe('Succeeded');
    expect(runRecord.nodeExecutions).toBeDefined();

    // ----------------------------------------------------
    // Step 10 & 11: Open Runs list and inspect Run Details and node logs
    // ----------------------------------------------------
    const listRunsRes = await fetch(`${baseUrl}/api/v1/runs?workflowId=${workflowId}`);
    expect(listRunsRes.status).toBe(200);
    const listRunsBody = (await listRunsRes.json()) as any;
    expect(listRunsBody.data.some((r: any) => r.id === runId)).toBe(true);

    const runDetailsRes = await fetch(`${baseUrl}/api/v1/runs/${runId}`);
    expect(runDetailsRes.status).toBe(200);
    const runDetailsBody = (await runDetailsRes.json()) as any;
    expect(runDetailsBody.data.id).toBe(runId);
    expect(runDetailsBody.data.durationMs).toBeGreaterThanOrEqual(0);

    const nodeExecsRes = await fetch(`${baseUrl}/api/v1/runs/${runId}/nodes`);
    expect(nodeExecsRes.status).toBe(200);
    const nodeExecsBody = (await nodeExecsRes.json()) as any;
    expect(nodeExecsBody.data.length).toBe(3);
    for (const ne of nodeExecsBody.data) {
      expect(ne.status).toBe('Succeeded');
      expect(ne.logs.length).toBeGreaterThan(0);
    }

    // ----------------------------------------------------
    // Step 12: Controlled failure and error propagation
    // ----------------------------------------------------
    const failingWorkflowRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Failing Workflow Test',
      }),
    });
    const failingWfId = ((await failingWorkflowRes.json()) as any).data.id;

    await fetch(`${baseUrl}/api/v1/workflows/${failingWfId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nodes: [
          {
            id: 'n-trig',
            type: 'trigger',
            label: 'Trigger',
            position: { x: 0, y: 0 },
            config: { triggerType: 'manual' },
          },
          {
            id: 'n-fail',
            type: 'httpRequest',
            label: 'Failing API',
            position: { x: 200, y: 0 },
            config: {
              url: 'https://api.example.com/fail',
              method: 'GET',
              mockResponse: {
                enabled: true,
                status: 500,
                body: { error: 'Internal Service Crash' },
              },
            },
          },
        ],
        edges: [{ id: 'e-fail', source: 'n-trig', target: 'n-fail' }],
      }),
    });

    await fetch(`${baseUrl}/api/v1/workflows/${failingWfId}/publish`, { method: 'POST' });

    const failedRunRes = await fetch(`${baseUrl}/api/v1/workflows/${failingWfId}/runs`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    const failedRunId = ((await failedRunRes.json()) as any).data.id;

    let failedRunRecord: any;
    for (let i = 0; i < 20; i++) {
      await new Promise((r) => setTimeout(r, 100));
      const res = await fetch(`${baseUrl}/api/v1/runs/${failedRunId}`);
      if (res.status === 200) {
        failedRunRecord = ((await res.json()) as any).data;
        if (failedRunRecord.status === 'Failed') break;
      }
    }
    expect(failedRunRecord.status).toBe('Failed');
    expect(failedRunRecord.error).toBeDefined();

    // ----------------------------------------------------
    // Step 13: Eligible Retry
    // ----------------------------------------------------
    const retryRes = await fetch(`${baseUrl}/api/v1/runs/${failedRunId}/retry`, {
      method: 'POST',
    });
    expect(retryRes.status).toBe(200);
    const retryBody = (await retryRes.json()) as any;
    expect(retryBody.success).toBe(true);
    expect(retryBody.data.id).toBeDefined();

    // ----------------------------------------------------
    // Step 14: Worker and queue telemetry reflects real activity
    // ----------------------------------------------------
    await worker.recordHeartbeat();
    const workersRes = await fetch(`${baseUrl}/api/v1/workers`);
    expect(workersRes.status).toBe(200);
    const workersBody = (await workersRes.json()) as any;
    const activeWorker = workersBody.data.find((w: any) => w.id === 'e2e-worker-lifecycle');
    expect(activeWorker).toBeDefined();
    expect(activeWorker.completedJobsCount).toBeGreaterThan(0);

    const queuesRes = await fetch(`${baseUrl}/api/v1/workers/queues`);
    expect(queuesRes.status).toBe(200);
    const queuesBody = (await queuesRes.json()) as any;
    expect(queuesBody.data.length).toBeGreaterThan(0);

    // ----------------------------------------------------
    // Step 15: Trigger a run through a configured webhook
    // ----------------------------------------------------
    const triggerRes = await fetch(`${baseUrl}/api/v1/triggers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId,
        name: 'Automated E2E Order Ingress',
        kind: 'webhook',
        allowedMethods: ['POST'],
      }),
    });
    expect(triggerRes.status).toBe(201);
    const triggerBody = (await triggerRes.json()) as any;
    const webhookPath = triggerBody.data.webhookPath;
    expect(webhookPath).toBeDefined();

    // Send webhook dispatch to public ingress endpoint
    const ingressRes = await fetch(`${baseUrl}${webhookPath}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': `e2e-order-${Date.now()}`,
      },
      body: JSON.stringify({
        orderId: 'ord_webhook_77',
        customer: 'Bob Dylan',
        amount: 890,
      }),
    });
    expect(ingressRes.status).toBe(202);
    const ingressBody = (await ingressRes.json()) as any;
    expect(ingressBody.success).toBe(true);
    expect(ingressBody.data.executionId).toBeDefined();
    expect(ingressBody.data.isDuplicate).toBe(false);
  });
});
