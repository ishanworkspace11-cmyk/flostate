import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import crypto from 'crypto';
import { apiV1Router } from '../routes/v1/index.js';
import { webhookIngressRouter } from '../routes/v1/trigger.routes.js';
import { errorHandlerMiddleware } from '../middleware/error.middleware.js';
import { triggerService } from '../services/trigger.service.js';
import { cronScheduler, validateCronExpression, calculateNextRun } from '../scheduler/cron-scheduler.js';
import { durableDagOrchestrator } from '../engine/durable-dag.orchestrator.js';
import { WorkerProcess } from '../worker/worker-process.js';
import { Server } from 'http';

describe('Prompt 7: Trigger Management, Webhooks Ingress, & Scheduled Cron Workflows', () => {
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
      workerId: 'test-worker-triggers',
      concurrency: 5,
    });
    await worker.start();
  });

  afterAll(async () => {
    cronScheduler.clearAll();
    await worker.stop();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('Cron Expression & Timezone Validation: Validates standard 5-part cron patterns and IANA timezones', () => {
    // Valid patterns
    expect(validateCronExpression('* * * * *').isValid).toBe(true);
    expect(validateCronExpression('*/15 * * * *').isValid).toBe(true);
    expect(validateCronExpression('0 9 * * 1-5').isValid).toBe(true);
    expect(validateCronExpression('30 23 31 12 *').isValid).toBe(true);

    // Invalid patterns
    expect(validateCronExpression('60 * * * *').isValid).toBe(false);
    expect(validateCronExpression('* * * *').isValid).toBe(false); // Only 4 fields
    expect(validateCronExpression('* * * * * *').isValid).toBe(false); // 6 fields
    expect(validateCronExpression('invalid').isValid).toBe(false);

    // Next run calculation
    const nextRun = calculateNextRun('*/10 * * * *', 'UTC', new Date('2026-10-22T10:03:00Z'));
    expect(nextRun.toISOString()).toBe('2026-10-22T10:10:00.000Z');

    // Timezone specific calculation
    const fromBase = new Date('2026-10-22T12:00:00Z');
    const nextRunNY = calculateNextRun('0 9 * * *', 'America/New_York', fromBase);
    expect(nextRunNY.getTime()).toBeGreaterThan(fromBase.getTime());
    // 9:00 AM EDT is 13:00:00 UTC
    expect(nextRunNY.toISOString()).toBe('2026-10-22T13:00:00.000Z');
  });

  it('POST /api/v1/triggers: Creates webhook trigger with unguessable slug and masks signing secret on GET', async () => {
    // 1. Create a dummy workflow first
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Webhook Ingress Pipeline',
        nodes: [
          { id: 'T', type: 'trigger', label: 'Trigger', position: { x: 0, y: 0 }, config: { triggerType: 'webhook' } },
        ],
        edges: [],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    // 2. Create webhook trigger with auto-generated signing secret
    const createRes = await fetch(`${baseUrl}/api/v1/triggers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: wf.id,
        name: 'Stripe Customer Ingestion',
        kind: 'webhook',
        generateSecret: true,
      }),
    });

    expect(createRes.status).toBe(201);
    const createBody = (await createRes.json()) as any;
    expect(createBody.success).toBe(true);
    expect(createBody.data.kind).toBe('webhook');
    expect(createBody.data.webhookPath).toContain('whk_');
    // Secret must be returned ONCE in creation response
    expect(createBody.data.signingSecret).toBeDefined();
    expect(createBody.data.signingSecret.startsWith('whsec_')).toBe(true);
    const secret = createBody.data.signingSecret;

    // 3. GET /api/v1/triggers/:id must MASK the secret
    const getRes = await fetch(`${baseUrl}/api/v1/triggers/${createBody.data.id}`);
    expect(getRes.status).toBe(200);
    const getBody = (await getRes.json()) as any;
    expect(getBody.data.signingSecret).toBeUndefined();
    expect(getBody.data.webhookSecret).toBeUndefined();
    expect(getBody.data.hasSecret).toBe(true);
    expect(getBody.data.maskedSecret).toBe('whsec_••••••••');

    // 4. GET /api/v1/triggers must also mask secrets across the list
    const listRes = await fetch(`${baseUrl}/api/v1/triggers`);
    const listBody = (await listRes.json()) as any;
    const found = listBody.data.find((t: any) => t.id === createBody.data.id);
    expect(found).toBeDefined();
    expect(found.signingSecret).toBeUndefined();
    expect(found.webhookSecret).toBeUndefined();
    expect(found.hasSecret).toBe(true);
  });

  it('Webhook Ingress: Executes workflow and protects with HMAC SHA-256 signature verification', async () => {
    // 1. Setup workflow
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Secured Webhook Workflow',
        nodes: [{ id: 'T', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'webhook' } }],
        edges: [],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    // 2. Create trigger with secret
    const triggerRes = await fetch(`${baseUrl}/api/v1/triggers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: wf.id,
        name: 'Secured Ingress',
        kind: 'webhook',
        webhookPath: '/api/v1/webhooks/secured-event',
        webhookSecret: 'whsec_my_super_secret_key_12345',
      }),
    });
    const triggerBody = (await triggerRes.json()) as any;
    const secret = 'whsec_my_super_secret_key_12345';

    const testPayload = { orderId: 'ord_9901', amount: 1500, currency: 'USD' };

    // 3. Delivery without signature must be rejected with 401 Unauthorized
    const unauthRes = await fetch(`${baseUrl}/api/v1/webhooks/secured-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(testPayload),
    });
    expect(unauthRes.status).toBe(401);
    const unauthBody = (await unauthRes.json()) as any;
    expect(unauthBody.error.code).toBe('WEBHOOK_UNAUTHORIZED');

    // 4. Delivery with invalid signature must also fail
    const invalidSigRes = await fetch(`${baseUrl}/api/v1/webhooks/secured-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dormammu-Signature': 'sha256=invalid_hash_signature_0000000000000000000000000000000000000000000000000000000000000000',
      },
      body: JSON.stringify(testPayload),
    });
    expect(invalidSigRes.status).toBe(401);

    // 5. Delivery with valid HMAC SHA256 signature must SUCCEED with HTTP 202
    const payloadStr = JSON.stringify(testPayload);
    const validHmac = crypto.createHmac('sha256', secret).update(payloadStr).digest('hex');

    const validRes = await fetch(`${baseUrl}/api/v1/webhooks/secured-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Dormammu-Signature': `sha256=${validHmac}`,
      },
      body: payloadStr,
    });

    expect(validRes.status).toBe(202);
    const validBody = (await validRes.json()) as any;
    expect(validBody.success).toBe(true);
    expect(validBody.data.executionId).toBeDefined();

    // Verify run exists in database/store
    const run = await durableDagOrchestrator.waitForCompletion(validBody.data.executionId, 4000);
    expect(run.status).toBe('Succeeded');
    expect(run.triggerType).toBe('webhook');
  });

  it('Idempotency Key Safeguard: Duplicate deliveries with same key are ignored and reuse execution', async () => {
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Idempotency Workflow',
        nodes: [{ id: 'T', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'webhook' } }],
        edges: [],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    await fetch(`${baseUrl}/api/v1/triggers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: wf.id,
        name: 'Idempotent Webhook',
        kind: 'webhook',
        webhookPath: '/api/v1/webhooks/idempotent-event',
      }),
    });

    const idempotencyKey = `idem_${Date.now()}_abc`;

    // First request
    const firstRes = await fetch(`${baseUrl}/api/v1/webhooks/idempotent-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ event: 'charge.succeeded' }),
    });

    expect(firstRes.status).toBe(202);
    const firstBody = (await firstRes.json()) as any;
    const executionId = firstBody.data.executionId;
    expect(executionId).toBeDefined();

    // Second request with SAME idempotency key
    const secondRes = await fetch(`${baseUrl}/api/v1/webhooks/idempotent-event`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotency-Key': idempotencyKey,
      },
      body: JSON.stringify({ event: 'charge.succeeded' }),
    });

    expect(secondRes.status).toBe(200);
    const secondBody = (await secondRes.json()) as any;
    expect(secondBody.isDuplicate).toBe(true);
    expect(secondBody.executionId).toBe(executionId);
  });

  it('Disabled Trigger Safeguard: Disabled webhook returns 403 Forbidden', async () => {
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Toggle Pipeline',
        nodes: [{ id: 'T', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'webhook' } }],
        edges: [],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    const trigRes = await fetch(`${baseUrl}/api/v1/triggers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: wf.id,
        name: 'Toggleable Webhook',
        kind: 'webhook',
        webhookPath: '/api/v1/webhooks/toggle-event',
      }),
    });
    const { data: trig } = (await trigRes.json()) as any;

    // Disable trigger
    const disableRes = await fetch(`${baseUrl}/api/v1/triggers/${trig.id}/disable`, { method: 'POST' });
    expect(disableRes.status).toBe(200);

    // Call ingress while disabled -> 403
    const callRes = await fetch(`${baseUrl}/api/v1/webhooks/toggle-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ping: true }),
    });
    expect(callRes.status).toBe(403);
    const callBody = (await callRes.json()) as any;
    expect(callBody.error.code).toBe('TRIGGER_DISABLED');

    // Re-enable trigger
    const enableRes = await fetch(`${baseUrl}/api/v1/triggers/${trig.id}/enable`, { method: 'POST' });
    expect(enableRes.status).toBe(200);

    // Call ingress after enabling -> 202
    const callAgainRes = await fetch(`${baseUrl}/api/v1/webhooks/toggle-event`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ping: true }),
    });
    expect(callAgainRes.status).toBe(202);
  });

  it('Scheduled Cron Triggers: Validates expression/timezone and computes nextRunAt', async () => {
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Cron Target Workflow',
        nodes: [{ id: 'T', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'cron' } }],
        edges: [],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    // Invalid cron expression rejected with 400
    const invalidCronRes = await fetch(`${baseUrl}/api/v1/triggers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: wf.id,
        name: 'Bad Cron',
        kind: 'cron',
        cronExpression: 'invalid_cron',
      }),
    });
    expect(invalidCronRes.status).toBe(400);

    // Invalid timezone rejected with 400
    const invalidTzRes = await fetch(`${baseUrl}/api/v1/triggers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: wf.id,
        name: 'Bad Timezone',
        kind: 'cron',
        cronExpression: '0 9 * * *',
        timezone: 'Fantasy/Narnia',
      }),
    });
    expect(invalidTzRes.status).toBe(400);

    // Valid cron trigger created successfully
    const validCronRes = await fetch(`${baseUrl}/api/v1/triggers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: wf.id,
        name: 'Daily Morning Audit',
        kind: 'cron',
        cronExpression: '0 9 * * *',
        timezone: 'Asia/Kolkata',
      }),
    });
    expect(validCronRes.status).toBe(201);
    const validCronBody = (await validCronRes.json()) as any;
    expect(validCronBody.data.kind).toBe('cron');
    expect(validCronBody.data.nextRunAt).toBeDefined();

    // Verify scheduled in CronScheduler
    expect(cronScheduler.getActiveCount()).toBeGreaterThan(0);

    // Deleting trigger removes schedule
    const delRes = await fetch(`${baseUrl}/api/v1/triggers/${validCronBody.data.id}`, {
      method: 'DELETE',
    });
    expect(delRes.status).toBe(200);
  });

  it('GET /api/v1/triggers/:id/deliveries: Records delivery logs and exposes recent history', async () => {
    const wfRes = await fetch(`${baseUrl}/api/v1/workflows`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Delivery Audit Workflow',
        nodes: [{ id: 'T', type: 'trigger', label: 'T', position: { x: 0, y: 0 }, config: { triggerType: 'webhook' } }],
        edges: [],
      }),
    });
    const { data: wf } = (await wfRes.json()) as any;
    await fetch(`${baseUrl}/api/v1/workflows/${wf.id}/publish`, { method: 'POST' });

    const trigRes = await fetch(`${baseUrl}/api/v1/triggers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workflowId: wf.id,
        name: 'Audit Webhook',
        kind: 'webhook',
        webhookPath: '/api/v1/webhooks/audit-deliveries',
      }),
    });
    const { data: trig } = (await trigRes.json()) as any;

    // Send 2 requests to trigger
    await fetch(`${baseUrl}/api/v1/webhooks/audit-deliveries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'ping1' }),
    });
    await fetch(`${baseUrl}/api/v1/webhooks/audit-deliveries`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ event: 'ping2' }),
    });

    // Fetch delivery records
    const deliveriesRes = await fetch(`${baseUrl}/api/v1/triggers/${trig.id}/deliveries`);
    expect(deliveriesRes.status).toBe(200);
    const deliveriesBody = (await deliveriesRes.json()) as any;
    expect(deliveriesBody.success).toBe(true);
    expect(Array.isArray(deliveriesBody.data)).toBe(true);
    expect(deliveriesBody.data.length).toBeGreaterThanOrEqual(2);

    const first = deliveriesBody.data[0];
    expect(first.triggerId).toBe(trig.id);
    expect(first.status).toBe('SUCCESS');
    expect(first.httpStatus).toBe(202);
    expect(first.executionId).toBeDefined();
  });
});
