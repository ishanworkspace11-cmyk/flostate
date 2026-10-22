import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../server.js';
import http from 'http';

describe('Dashboard Backend API (/api/v1/dashboard)', () => {
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

  it('GET /api/v1/dashboard/summary returns computed orchestration metrics', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/summary`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data).toHaveProperty('totalWorkflows');
    expect(body.data).toHaveProperty('activeWorkflows');
    expect(body.data).toHaveProperty('totalExecutions');
    expect(body.data).toHaveProperty('successfulExecutions');
    expect(body.data).toHaveProperty('failedExecutions');
    expect(body.data).toHaveProperty('runningExecutions');
    expect(body.data).toHaveProperty('executionSuccessRate');
    expect(body.data).toHaveProperty('recentWorkflows');
    expect(body.data).toHaveProperty('recentExecutions');

    expect(typeof body.data.totalWorkflows).toBe('number');
    expect(typeof body.data.activeWorkflows).toBe('number');
    expect(typeof body.data.executionSuccessRate).toBe('number');
    expect(body.data.executionSuccessRate).toBeGreaterThanOrEqual(0);
    expect(body.data.executionSuccessRate).toBeLessThanOrEqual(100);

    // Verify time period metadata
    expect(body.data.period).toBe('24h');
    expect(new Date(body.data.periodStart).toISOString()).toBe(body.data.periodStart);
    expect(new Date(body.data.periodEnd).toISOString()).toBe(body.data.periodEnd);
  });

  it('GET /api/v1/dashboard/summary supports custom time periods', async () => {
    const periods = ['7d', '30d', 'all'];
    for (const p of periods) {
      const res = await fetch(`${baseUrl}/api/v1/dashboard/summary?period=${p}`);
      expect(res.status).toBe(200);
      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.data.period).toBe(p);
    }
  });

  it('sanitizes recent workflows and executions from sensitive data', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/summary`);
    const body = (await res.json()) as any;
    const summary = body.data;

    if (summary.recentWorkflows.length > 0) {
      const wf = summary.recentWorkflows[0];
      expect(wf).toHaveProperty('nodeCount');
      expect(wf).toHaveProperty('edgeCount');
      // Full sensitive nodes array and configurations should not be present in summary
      expect(wf).not.toHaveProperty('nodes');
      expect(wf).not.toHaveProperty('edges');
    }

    if (summary.recentExecutions.length > 0) {
      const exec = summary.recentExecutions[0];
      expect(exec).toHaveProperty('id');
      expect(exec).toHaveProperty('status');
      // Full node executions with raw inputs/outputs should not be dumped in summary
      expect(exec).not.toHaveProperty('nodeExecutions');
    }
  });

  it('GET /api/v1/dashboard/activity returns paginated activity feed', async () => {
    const res = await fetch(`${baseUrl}/api/v1/dashboard/activity?page=1&limit=10`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.meta).toHaveProperty('page', 1);
    expect(body.meta).toHaveProperty('limit', 10);
    expect(body.meta).toHaveProperty('total');
  });
});
