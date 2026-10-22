import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import express from 'express';
import { apiV1Router } from '../routes/v1/index.js';
import { errorHandlerMiddleware } from '../middleware/error.middleware.js';
import { WorkerProcess, defaultWorker } from '../worker/worker-process.js';
import { workerRepository } from '../repositories/worker.repository.js';
import { workerEventService } from '../services/worker-event.service.js';
import { WORKER_CONFIG, evaluateWorkerStatus } from '../config/worker.config.js';
import { Server } from 'http';

describe('Prompt 8: Distributed Worker Monitoring and Queue Observability', () => {
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
    await defaultWorker.stop();
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
  });

  beforeEach(async () => {
    await defaultWorker.stop();
    await workerRepository.clearWorkers();
    workerEventService.clear();
  });

  it('Empty State: returns empty worker list with meta total=0 when no workers are registered', async () => {
    const res = await fetch(`${baseUrl}/api/v1/workers`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data).toEqual([]);
    expect(body.meta.total).toBe(0);
    expect(body.meta.onlineCount).toBe(0);
  });

  it('Worker Registration: WorkerProcess start() registers worker and emits REGISTERED event', async () => {
    const worker = new WorkerProcess({
      workerId: 'test-worker-alpha-01',
      concurrency: 8,
      heartbeatIntervalMs: 5000,
    });

    await worker.start();

    try {
      const res = await fetch(`${baseUrl}/api/v1/workers`);
      expect(res.status).toBe(200);

      const body = (await res.json()) as any;
      expect(body.success).toBe(true);
      expect(body.meta.total).toBe(1);

      const found = body.data.find((w: any) => w.id === 'test-worker-alpha-01');
      expect(found).toBeDefined();
      expect(found.concurrency).toBe(8);
      expect(found.status).toBe('idle');
      expect(found.isOnline).toBe(true);
      expect(found.registeredAt).toBeDefined();

      // Check worker details endpoint
      const detailRes = await fetch(`${baseUrl}/api/v1/workers/test-worker-alpha-01`);
      expect(detailRes.status).toBe(200);
      const detailBody = (await detailRes.json()) as any;
      expect(detailBody.success).toBe(true);
      expect(detailBody.data.id).toBe('test-worker-alpha-01');
      expect(detailBody.data.status).toBe('idle');

      // Check events
      const eventsRes = await fetch(`${baseUrl}/api/v1/workers/events?workerId=test-worker-alpha-01`);
      expect(eventsRes.status).toBe(200);
      const eventsBody = (await eventsRes.json()) as any;
      expect(eventsBody.success).toBe(true);
      expect(eventsBody.data.some((e: any) => e.type === 'REGISTERED')).toBe(true);
    } finally {
      await worker.stop();
    }
  });

  it('Worker Details: returns 404 for non-existent worker ID', async () => {
    const res = await fetch(`${baseUrl}/api/v1/workers/non-existent-worker-999`);
    expect(res.status).toBe(404);

    const body = (await res.json()) as any;
    expect(body.success).toBe(false);
    expect(body.error).toContain('non-existent-worker-999');
  });

  it('Heartbeat Expiry: dynamically detects stale and offline workers without assuming database records are online', () => {
    const now = Date.now();

    // 1. Fresh worker (heartbeat 2s ago)
    const fresh = evaluateWorkerStatus({
      id: 'w-fresh',
      name: 'Fresh Worker',
      hostname: 'node-01',
      status: 'idle',
      concurrency: 5,
      currentJobs: [],
      completedJobsCount: 10,
      failedJobsCount: 0,
      uptimeSeconds: 100,
      registeredAt: new Date(now - 100000).toISOString(),
      lastHeartbeat: new Date(now - 2000).toISOString(),
      isSimulated: false,
    }, now);
    expect(fresh.status).toBe('idle');
    expect(fresh.isOnline).toBe(true);

    // 2. Stale worker (heartbeat 20s ago, exceeds STALE_THRESHOLD_MS of 15s)
    const stale = evaluateWorkerStatus({
      id: 'w-stale',
      name: 'Stale Worker',
      hostname: 'node-02',
      status: 'idle',
      concurrency: 5,
      currentJobs: [],
      completedJobsCount: 10,
      failedJobsCount: 0,
      uptimeSeconds: 100,
      registeredAt: new Date(now - 100000).toISOString(),
      lastHeartbeat: new Date(now - 20000).toISOString(),
      isSimulated: false,
    }, now);
    expect(stale.status).toBe('stale');
    expect(stale.isOnline).toBe(false);

    // 3. Offline worker (heartbeat 60s ago, exceeds OFFLINE_THRESHOLD_MS of 45s)
    const offline = evaluateWorkerStatus({
      id: 'w-offline',
      name: 'Dead Worker',
      hostname: 'node-03',
      status: 'idle',
      concurrency: 5,
      currentJobs: [],
      completedJobsCount: 10,
      failedJobsCount: 0,
      uptimeSeconds: 100,
      registeredAt: new Date(now - 100000).toISOString(),
      lastHeartbeat: new Date(now - 60000).toISOString(),
      isSimulated: false,
    }, now);
    expect(offline.status).toBe('offline');
    expect(offline.isOnline).toBe(false);
  });

  it('Graceful Shutdown: stopping worker sets offline status and records shutdown info', async () => {
    const worker = new WorkerProcess({
      workerId: 'test-worker-shutdown-01',
      concurrency: 3,
    });

    await worker.start();
    await worker.stop();

    const res = await fetch(`${baseUrl}/api/v1/workers/test-worker-shutdown-01`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(body.data.status).toBe('offline');
    expect(body.data.shutdownInfo).toBeDefined();
    expect(body.data.shutdownInfo.reason).toBe('Graceful shutdown');

    const eventsRes = await fetch(`${baseUrl}/api/v1/workers/events?workerId=test-worker-shutdown-01`);
    const eventsBody = (await eventsRes.json()) as any;
    expect(eventsBody.data.some((e: any) => e.type === 'OFFLINE')).toBe(true);
  });

  it('Queue Telemetry: GET /api/v1/workers/queues and /queue-metrics return exact metrics with driver indicator', async () => {
    const res = await fetch(`${baseUrl}/api/v1/workers/queues`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);

    const q = body.data[0];
    expect(q.queueName).toBeDefined();
    expect(typeof q.waitingCount).toBe('number');
    expect(typeof q.activeCount).toBe('number');
    expect(typeof q.delayedCount).toBe('number');
    expect(q.isExact).toBe(true);
    expect(['bullmq', 'in-memory-runner']).toContain(q.driver);

    // Single queue metrics alias
    const metricRes = await fetch(`${baseUrl}/api/v1/workers/queue-metrics`);
    expect(metricRes.status).toBe(200);
    const metricBody = (await metricRes.json()) as any;
    expect(metricBody.success).toBe(true);
    expect(metricBody.data.isExact).toBe(true);
  });

  it('System Health: GET /api/v1/workers/health computes cluster health and queue depth', async () => {
    const res = await fetch(`${baseUrl}/api/v1/workers/health`);
    expect(res.status).toBe(200);

    const body = (await res.json()) as any;
    expect(body.success).toBe(true);
    expect(['healthy', 'degraded', 'critical']).toContain(body.data.status);
    expect(typeof body.data.totalWorkers).toBe('number');
    expect(typeof body.data.onlineWorkers).toBe('number');
    expect(typeof body.data.totalQueueDepth).toBe('number');
    expect(['bullmq-distributed', 'local-durable-runner']).toContain(body.data.runnerMode);
  });

  it('Internal Security: POST /api/v1/workers/heartbeat rejects unauthenticated requests and accepts authorized requests', async () => {
    // 1. Missing auth token -> 401
    const unauthRes = await fetch(`${baseUrl}/api/v1/workers/heartbeat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        workerId: 'fake-rogue-worker',
        status: 'busy',
      }),
    });
    expect(unauthRes.status).toBe(401);
    const unauthBody = (await unauthRes.json()) as any;
    expect(unauthBody.success).toBe(false);
    expect(unauthBody.error).toContain('Unauthorized');

    // 2. Invalid auth token -> 401
    const wrongAuthRes = await fetch(`${baseUrl}/api/v1/workers/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': 'wrong-secret',
      },
      body: JSON.stringify({
        workerId: 'fake-rogue-worker',
        status: 'busy',
      }),
    });
    expect(wrongAuthRes.status).toBe(401);

    // 3. Valid internal auth token -> 200
    const validRes = await fetch(`${baseUrl}/api/v1/workers/heartbeat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-worker-secret': WORKER_CONFIG.INTERNAL_AUTH_SECRET,
      },
      body: JSON.stringify({
        workerId: 'remote-worker-verified-01',
        name: 'Remote Worker Verified 1',
        hostname: 'cloud-runner-01',
        status: 'idle',
        concurrency: 10,
        completedJobsCount: 42,
        uptimeSeconds: 3600,
      }),
    });
    expect(validRes.status).toBe(200);
    const validBody = (await validRes.json()) as any;
    expect(validBody.success).toBe(true);

    // Verify worker exists in list
    const checkRes = await fetch(`${baseUrl}/api/v1/workers/remote-worker-verified-01`);
    expect(checkRes.status).toBe(200);
    const checkBody = (await checkRes.json()) as any;
    expect(checkBody.data.id).toBe('remote-worker-verified-01');
    expect(checkBody.data.completedJobsCount).toBe(42);
  });
});
