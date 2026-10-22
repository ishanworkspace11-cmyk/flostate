import { WorkerInstance, WorkerStatus } from '../models/worker.types.js';

export const WORKER_CONFIG = {
  HEARTBEAT_INTERVAL_MS: Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS) || 5000,
  STALE_THRESHOLD_MS: Number(process.env.WORKER_STALE_THRESHOLD_MS) || 15000,
  OFFLINE_THRESHOLD_MS: Number(process.env.WORKER_OFFLINE_THRESHOLD_MS) || 45000,
  INTERNAL_AUTH_SECRET: process.env.INTERNAL_WORKER_SECRET || 'dormammu-internal-secret-worker-auth',
};

/**
 * Dynamically evaluates worker status based on elapsed time since its last reported heartbeat.
 * Prevents treating dormant or crashed workers as online just because a database record exists.
 */
export function evaluateWorkerStatus(worker: WorkerInstance, now = Date.now()): WorkerInstance {
  // If explicitly offline, keep offline
  if (worker.status === 'offline') {
    return {
      ...worker,
      isOnline: false,
    };
  }

  const lastHeartbeatMs = worker.lastHeartbeat ? new Date(worker.lastHeartbeat).getTime() : 0;
  if (!lastHeartbeatMs || isNaN(lastHeartbeatMs)) {
    return {
      ...worker,
      status: 'unknown',
      isOnline: false,
    };
  }

  const elapsedMs = Math.max(0, now - lastHeartbeatMs);

  // If elapsed exceeds offline threshold, worker has gone cold
  if (elapsedMs > WORKER_CONFIG.OFFLINE_THRESHOLD_MS) {
    return {
      ...worker,
      status: 'offline',
      isOnline: false,
    };
  }

  // If elapsed exceeds stale threshold, telemetry is stale/unresponsive
  if (elapsedMs > WORKER_CONFIG.STALE_THRESHOLD_MS) {
    return {
      ...worker,
      status: 'stale',
      isOnline: false,
    };
  }

  // Fresh heartbeat received within threshold
  if (worker.status === 'draining') {
    return {
      ...worker,
      isOnline: true,
    };
  }

  const hasActiveJobs = Array.isArray(worker.currentJobs) && worker.currentJobs.length > 0;
  const determinedStatus: WorkerStatus = hasActiveJobs ? 'busy' : 'idle';

  return {
    ...worker,
    status: determinedStatus,
    isOnline: true,
  };
}
