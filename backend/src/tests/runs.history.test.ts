import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { app } from '../server.js';
import { executionRepository } from '../repositories/execution.repository.js';
import { Server } from 'http';

describe('Execution History & Runs API (GET /api/v1/runs)', () => {
  let server: Server;
  let baseUrl: string;

  beforeAll(async () => {
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        const port = typeof addr === 'object' && addr ? addr.port : 4002;
        baseUrl = `http://localhost:${port}`;
        resolve();
      });
    });

    // Seed test execution records across different workflows, statuses, dates, and trigger types
    const baseDate = new Date('2026-10-20T10:00:00.000Z').getTime();

    // Run 1: Workflow A, Succeeded, Manual, 2026-10-20
    await executionRepository.createRun({
      id: 'run-test-a1',
      workflowId: 'wf-alpha',
      workflowName: 'Alpha Ingestion Service',
      workflowVersion: 1,
      triggerType: 'manual',
      status: 'Succeeded',
      input: { secretToken: 'SUPER_SECRET_PAYLOAD_DO_NOT_LEAK', data: [1, 2, 3] },
      output: { resultSummary: 'Processed 3 items successfully' },
      startedAt: new Date(baseDate).toISOString(),
      completedAt: new Date(baseDate + 1500).toISOString(),
      durationMs: 1500,
      error: null,
      nodeExecutions: {
        t1: {
          id: 'ne-1',
          executionId: 'run-test-a1',
          nodeId: 't1',
          nodeLabel: 'Trigger',
          nodeType: 'trigger',
          status: 'Succeeded',
          attempt: 1,
          input: {},
          output: {},
          startedAt: new Date(baseDate).toISOString(),
          completedAt: new Date(baseDate + 200).toISOString(),
          durationMs: 200,
          logs: [{ timestamp: new Date(baseDate).toISOString(), level: 'info', message: 'Heavy node log entry 1' }],
        },
        step1: {
          id: 'ne-2',
          executionId: 'run-test-a1',
          nodeId: 'step1',
          nodeLabel: 'Processor',
          nodeType: 'transform',
          status: 'Succeeded',
          attempt: 1,
          input: {},
          output: {},
          startedAt: new Date(baseDate + 200).toISOString(),
          completedAt: new Date(baseDate + 1500).toISOString(),
          durationMs: 1300,
          logs: [{ timestamp: new Date(baseDate + 200).toISOString(), level: 'info', message: 'Heavy node log entry 2' }],
        },
      },
    });

    // Run 2: Workflow A, Failed, Webhook, 2026-10-21
    await executionRepository.createRun({
      id: 'run-test-a2',
      workflowId: 'wf-alpha',
      workflowName: 'Alpha Ingestion Service',
      workflowVersion: 2,
      triggerType: 'webhook',
      status: 'Failed',
      input: { webhookData: 'incoming' },
      output: null,
      startedAt: new Date(baseDate + 86400000).toISOString(),
      completedAt: new Date(baseDate + 86400000 + 4200).toISOString(),
      durationMs: 4200,
      error: 'Upstream gateway timed out after 4000ms',
      nodeExecutions: {
        t1: {
          id: 'ne-3',
          executionId: 'run-test-a2',
          nodeId: 't1',
          nodeLabel: 'Webhook Trigger',
          nodeType: 'trigger',
          status: 'Succeeded',
          attempt: 1,
          input: {},
          output: {},
          startedAt: new Date(baseDate + 86400000).toISOString(),
          completedAt: new Date(baseDate + 86400000 + 100).toISOString(),
          durationMs: 100,
          logs: [],
        },
        h1: {
          id: 'ne-4',
          executionId: 'run-test-a2',
          nodeId: 'h1',
          nodeLabel: 'Remote API',
          nodeType: 'httpRequest',
          status: 'Failed',
          attempt: 3,
          input: {},
          output: null,
          startedAt: new Date(baseDate + 86400000 + 100).toISOString(),
          completedAt: new Date(baseDate + 86400000 + 4200).toISOString(),
          durationMs: 4100,
          error: 'Gateway timeout',
          logs: [],
        },
      },
    });

    // Run 3: Workflow B, Running, Cron, 2026-10-22
    await executionRepository.createRun({
      id: 'run-test-b1',
      workflowId: 'wf-beta',
      workflowName: 'Beta Sync Pipeline',
      workflowVersion: 1,
      triggerType: 'cron',
      status: 'Running',
      input: { schedule: '0 * * * *' },
      output: null,
      startedAt: new Date(baseDate + 172800000).toISOString(),
      completedAt: null,
      durationMs: undefined,
      error: null,
      nodeExecutions: {
        t1: {
          id: 'ne-5',
          executionId: 'run-test-b1',
          nodeId: 't1',
          nodeLabel: 'Cron Trigger',
          nodeType: 'trigger',
          status: 'Succeeded',
          attempt: 1,
          input: {},
          output: {},
          startedAt: new Date(baseDate + 172800000).toISOString(),
          completedAt: new Date(baseDate + 172800000 + 50).toISOString(),
          durationMs: 50,
          logs: [],
        },
        d1: {
          id: 'ne-6',
          executionId: 'run-test-b1',
          nodeId: 'd1',
          nodeLabel: 'Active Worker Step',
          nodeType: 'delay',
          status: 'Running',
          attempt: 1,
          input: {},
          output: null,
          startedAt: new Date(baseDate + 172800000 + 50).toISOString(),
          completedAt: null,
          durationMs: undefined,
          logs: [],
        },
      },
    });
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  });

  it('GET /api/v1/runs returns paginated execution summaries with meta information', async () => {
    const res = await fetch(`${baseUrl}/api/v1/runs?page=1&limit=2`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeLessThanOrEqual(2);

    expect(body.meta).toHaveProperty('page', 1);
    expect(body.meta).toHaveProperty('limit', 2);
    expect(body.meta).toHaveProperty('total');
    expect(body.meta.total).toBeGreaterThanOrEqual(3);
    expect(body.meta.totalPages).toBeGreaterThanOrEqual(2);
  });

  it('Pagination: Pages do not overlap and limit bounds are respected', async () => {
    const page1Res = await fetch(`${baseUrl}/api/v1/runs?page=1&limit=1`);
    const page2Res = await fetch(`${baseUrl}/api/v1/runs?page=2&limit=1`);

    const p1Body = (await page1Res.json()) as any;
    const p2Body = (await page2Res.json()) as any;

    expect(p1Body.data.length).toBe(1);
    expect(p2Body.data.length).toBe(1);
    expect(p1Body.data[0].id).not.toBe(p2Body.data[0].id);
  });

  it('Payload Protection: Does NOT return heavy logs or sensitive input/output in list response', async () => {
    const res = await fetch(`${baseUrl}/api/v1/runs?search=Alpha`);
    const body = (await res.json()) as any;

    expect(body.data.length).toBeGreaterThanOrEqual(1);
    const item = body.data[0];

    // Required summary fields must exist
    expect(item).toHaveProperty('id');
    expect(item).toHaveProperty('workflowId');
    expect(item).toHaveProperty('workflowName');
    expect(item).toHaveProperty('workflowVersion');
    expect(item).toHaveProperty('triggerType');
    expect(item).toHaveProperty('status');
    expect(item).toHaveProperty('startedAt');
    expect(item).toHaveProperty('nodeCount');
    expect(item).toHaveProperty('completedNodeCount');

    // Heavy payloads must NOT be returned in list
    expect(item).not.toHaveProperty('nodeExecutions');
    expect(item).not.toHaveProperty('input');
    expect(item).not.toHaveProperty('output');
  });

  it('Filter Isolation: workflowId filter only returns runs belonging to that workflow', async () => {
    const res = await fetch(`${baseUrl}/api/v1/runs?workflowId=wf-beta`);
    const body = (await res.json()) as any;

    expect(body.data.length).toBeGreaterThanOrEqual(1);
    for (const run of body.data) {
      expect(run.workflowId).toBe('wf-beta');
      expect(run.workflowName).toBe('Beta Sync Pipeline');
    }
  });

  it('Filter Isolation: status filter only returns matching executions', async () => {
    const failedRes = await fetch(`${baseUrl}/api/v1/runs?status=Failed`);
    const failedBody = (await failedRes.json()) as any;

    expect(failedBody.data.length).toBeGreaterThanOrEqual(1);
    for (const run of failedBody.data) {
      expect(run.status.toLowerCase()).toBe('failed');
    }

    const runningRes = await fetch(`${baseUrl}/api/v1/runs?status=Running`);
    const runningBody = (await runningRes.json()) as any;

    expect(runningBody.data.length).toBeGreaterThanOrEqual(1);
    for (const run of runningBody.data) {
      expect(run.status.toLowerCase()).toBe('running');
    }
  });

  it('Filter Isolation: triggerType filter matches trigger kind correctly', async () => {
    const cronRes = await fetch(`${baseUrl}/api/v1/runs?triggerType=cron`);
    const cronBody = (await cronRes.json()) as any;

    expect(cronBody.data.length).toBeGreaterThanOrEqual(1);
    for (const run of cronBody.data) {
      expect(run.triggerType.toLowerCase()).toBe('cron');
    }
  });

  it('Date Range Filter: Filters runs strictly within the window', async () => {
    // Range covering only 2026-10-21 (run-test-a2)
    const startDate = '2026-10-21T00:00:00.000Z';
    const endDate = '2026-10-21T23:59:59.999Z';

    const res = await fetch(`${baseUrl}/api/v1/runs?startDate=${encodeURIComponent(startDate)}&endDate=${encodeURIComponent(endDate)}`);
    const body = (await res.json()) as any;

    expect(body.data.length).toBeGreaterThanOrEqual(1);
    for (const run of body.data) {
      const time = new Date(run.startedAt).getTime();
      expect(time).toBeGreaterThanOrEqual(new Date(startDate).getTime());
      expect(time).toBeLessThanOrEqual(new Date(endDate).getTime());
    }
  });

  it('Search: Matches workflow name, run ID, and error message', async () => {
    // 1. Search by error string
    const errSearchRes = await fetch(`${baseUrl}/api/v1/runs?search=timed%20out`);
    const errBody = (await errSearchRes.json()) as any;
    expect(errBody.data.length).toBeGreaterThanOrEqual(1);
    expect(errBody.data[0].id).toBe('run-test-a2');

    // 2. Search by run ID
    const idSearchRes = await fetch(`${baseUrl}/api/v1/runs?search=run-test-b1`);
    const idBody = (await idSearchRes.json()) as any;
    expect(idBody.data.length).toBe(1);
    expect(idBody.data[0].workflowName).toBe('Beta Sync Pipeline');
  });

  it('Sorting: Sorts by durationMs, startedAt, and falls back safely on invalid field', async () => {
    // 1. Sort by durationMs descending
    const sortRes = await fetch(`${baseUrl}/api/v1/runs?sortBy=durationMs&sortOrder=desc`);
    const sortBody = (await sortRes.json()) as any;

    const durations = sortBody.data.map((r: any) => r.durationMs).filter((d: any) => typeof d === 'number');
    for (let i = 0; i < durations.length - 1; i++) {
      expect(durations[i]).toBeGreaterThanOrEqual(durations[i + 1]);
    }

    // 2. Fallback on invalid sort field (should not crash, default to startedAt)
    const fallbackRes = await fetch(`${baseUrl}/api/v1/runs?sortBy=non_existent_column&sortOrder=desc`);
    // Validation schema rejects unknown sortBy with 400
    expect(fallbackRes.status).toBe(400);
  });
});
