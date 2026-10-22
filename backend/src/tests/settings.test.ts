import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import express from 'express';
import { apiV1Router } from '../routes/v1/index.js';
import { errorHandlerMiddleware } from '../middleware/error.middleware.js';
import { Server } from 'http';

describe('Prompt 9: Settings and Operational Configuration Backend', () => {
  let app: express.Express;
  let server: Server;
  let baseUrl: string;

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
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  it('GET /api/v1/settings returns list of categorized operational settings', async () => {
    const res = await fetch(`${baseUrl}/api/v1/settings`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(4);

    const keys = body.data.map((s: any) => s.key);
    expect(keys).toContain('concurrency_limit');
    expect(keys).toContain('retry_backoff_policy');
    expect(keys).toContain('node_timeout_limits');
    expect(keys).toContain('history_retention');

    const concurrency = body.data.find((s: any) => s.key === 'concurrency_limit');
    expect(concurrency.requiresRestart).toBe(true);
    expect(concurrency.category).toBe('execution');
    expect(concurrency.isOperationallySupported).toBe(true);

    const retries = body.data.find((s: any) => s.key === 'retry_backoff_policy');
    expect(retries.requiresRestart).toBe(false);
    expect(retries.category).toBe('resilience');
  });

  it('GET /api/v1/settings/system-info returns engine specs and single-workspace security disclaimer', async () => {
    const res = await fetch(`${baseUrl}/api/v1/settings/system-info`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.engineVersion).toContain('1.0.0');
    expect(body.data.securityMode).toBe('local-development-single-workspace');
    expect(body.data.storageStats).toBeDefined();
    expect(typeof body.data.storageStats.workflowCount).toBe('number');
    expect(typeof body.data.storageStats.executionCount).toBe('number');
  });

  it('PUT /api/v1/settings/concurrency_limit updates settings and validates bounds', async () => {
    // 1. Valid update
    const validRes = await fetch(`${baseUrl}/api/v1/settings/concurrency_limit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: {
          maxConcurrentWorkflows: 35,
          maxConcurrentTasksPerWorker: 8,
        },
      }),
    });
    expect(validRes.status).toBe(200);
    const validBody = (await validRes.json()) as any;
    expect(validBody.success).toBe(true);
    expect(validBody.data.value.maxConcurrentWorkflows).toBe(35);
    expect(validBody.data.value.maxConcurrentTasksPerWorker).toBe(8);
    expect(validBody.message).toContain('restart required');

    // 2. Out of bounds: maxConcurrentWorkflows = 0 (min is 1)
    const invalidZeroRes = await fetch(`${baseUrl}/api/v1/settings/concurrency_limit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: {
          maxConcurrentWorkflows: 0,
          maxConcurrentTasksPerWorker: 5,
        },
      }),
    });
    expect(invalidZeroRes.status).toBe(400);

    // 3. Out of bounds: maxConcurrentWorkflows = 500 (max is 100)
    const invalidHighRes = await fetch(`${baseUrl}/api/v1/settings/concurrency_limit`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: {
          maxConcurrentWorkflows: 500,
          maxConcurrentTasksPerWorker: 5,
        },
      }),
    });
    expect(invalidHighRes.status).toBe(400);
  });

  it('PUT /api/v1/settings/retry_backoff_policy validates retry bounds and backoff enums', async () => {
    // 1. Valid update
    const validRes = await fetch(`${baseUrl}/api/v1/settings/retry_backoff_policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: {
          defaultMaxAttempts: 5,
          backoffType: 'linear',
          initialDelayMs: 2000,
        },
      }),
    });
    expect(validRes.status).toBe(200);
    const validBody = (await validRes.json()) as any;
    expect(validBody.data.value.backoffType).toBe('linear');
    expect(validBody.data.value.defaultMaxAttempts).toBe(5);

    // 2. Invalid backoffType enum
    const invalidEnumRes = await fetch(`${baseUrl}/api/v1/settings/retry_backoff_policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: {
          defaultMaxAttempts: 3,
          backoffType: 'unsupported_algorithm',
          initialDelayMs: 1000,
        },
      }),
    });
    expect(invalidEnumRes.status).toBe(400);

    // 3. Invalid maxAttempts > 10
    const invalidAttemptsRes = await fetch(`${baseUrl}/api/v1/settings/retry_backoff_policy`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: {
          defaultMaxAttempts: 50,
          backoffType: 'exponential',
          initialDelayMs: 1000,
        },
      }),
    });
    expect(invalidAttemptsRes.status).toBe(400);
  });

  it('PUT /api/v1/settings/node_timeout_limits validates timeout thresholds', async () => {
    // 1. Valid update
    const validRes = await fetch(`${baseUrl}/api/v1/settings/node_timeout_limits`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: {
          defaultNodeTimeoutMs: 45000,
          httpRequestTimeoutMs: 20000,
        },
      }),
    });
    expect(validRes.status).toBe(200);
    const validBody = (await validRes.json()) as any;
    expect(validBody.data.value.defaultNodeTimeoutMs).toBe(45000);

    // 2. Timeout under minimum (less than 1000ms)
    const invalidLowRes = await fetch(`${baseUrl}/api/v1/settings/node_timeout_limits`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        value: {
          defaultNodeTimeoutMs: 100,
          httpRequestTimeoutMs: 500,
        },
      }),
    });
    expect(invalidLowRes.status).toBe(400);
  });

  it('Secret Protection: Rejects storing sensitive credentials or environment keys', async () => {
    const prohibitedKeys = [
      'database_url',
      'redis_password',
      'jwt_secret',
      'auth_token',
      'signing_secret',
    ];

    for (const key of prohibitedKeys) {
      const res = await fetch(`${baseUrl}/api/v1/settings/${key}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          value: 'super-secret-password-12345',
        }),
      });

      expect(res.status).toBe(400);
      const body = (await res.json()) as any;
      expect(body.success).toBe(false);
      const errorMsg = body.error?.message || body.error;
      expect(errorMsg).toContain('Sensitive secrets');
    }
  });

  it('Demo Reset: Requires explicit confirmation string and resets demo data safely', async () => {
    // 1. Missing confirmation -> 400
    const missingRes = await fetch(`${baseUrl}/api/v1/settings/demo/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });
    expect(missingRes.status).toBe(400);

    // 2. Wrong confirmation string -> 400
    const wrongRes = await fetch(`${baseUrl}/api/v1/settings/demo/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'RESET' }),
    });
    expect(wrongRes.status).toBe(400);

    // 3. Valid confirmation -> 200 and restores deterministic seed
    const validRes = await fetch(`${baseUrl}/api/v1/settings/demo/reset`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirmation: 'RESET_DEMO_DATA' }),
    });
    expect(validRes.status).toBe(200);

    const body = (await validRes.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.stats).toBeDefined();
    expect(body.data.stats.workflows).toBeGreaterThan(0);
    expect(body.data.stats.triggers).toBeGreaterThan(0);
  });

  it('POST /api/v1/settings/batch updates multiple settings at once', async () => {
    const res = await fetch(`${baseUrl}/api/v1/settings/batch`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        settings: {
          retry_backoff_policy: {
            defaultMaxAttempts: 4,
            backoffType: 'exponential',
            initialDelayMs: 1500,
          },
          node_timeout_limits: {
            defaultNodeTimeoutMs: 60000,
            httpRequestTimeoutMs: 30000,
          },
        },
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.meta.updatedCount).toBe(2);
  });
});
