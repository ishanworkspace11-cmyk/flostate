import { EventEmitter } from 'events';
import { logger } from '../config/logger.js';

export interface ExecutionEventPayload {
  id: string;
  runId: string;
  event: 'run_state' | 'node_state' | 'node_log' | 'close';
  timestamp: string;
  data: any;
}

export class ExecutionEventBus extends EventEmitter {
  private eventHistory: Map<string, ExecutionEventPayload[]> = new Map();
  private maxHistoryPerRun = 50;
  private activeConnections: Map<string, number> = new Map();
  private maxConnectionsPerRun = 15;

  constructor() {
    super();
    // Allow higher listener count for concurrent dashboard/SSE subscribers
    this.setMaxListeners(100);
  }

  /**
   * Publishes an event for a run and caches it in the ring buffer for reconnection recovery.
   */
  public publish(runId: string, event: ExecutionEventPayload['event'], data: any): ExecutionEventPayload {
    const eventPayload: ExecutionEventPayload = {
      id: `evt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      runId,
      event,
      timestamp: new Date().toISOString(),
      data,
    };

    // Buffer for reconnection replay
    if (!this.eventHistory.has(runId)) {
      this.eventHistory.set(runId, []);
    }
    const history = this.eventHistory.get(runId)!;
    history.push(eventPayload);
    if (history.length > this.maxHistoryPerRun) {
      history.shift();
    }

    // Emit event on channel
    this.emit(`run:${runId}`, eventPayload);
    this.emit('all_events', eventPayload);

    return eventPayload;
  }

  /**
   * Retrieves events that occurred after a given lastEventId for recovery.
   */
  public getEventsAfter(runId: string, lastEventId?: string): ExecutionEventPayload[] {
    const history = this.eventHistory.get(runId) || [];
    if (!lastEventId) {
      return history;
    }

    const idx = history.findIndex((e) => e.id === lastEventId);
    if (idx === -1) {
      // If eventId wasn't found (perhaps evicted), return all buffered events
      return history;
    }
    return history.slice(idx + 1);
  }

  /**
   * Tracks an active SSE connection for a run, enforcing concurrency limits.
   */
  public trackConnection(runId: string): boolean {
    const current = this.activeConnections.get(runId) || 0;
    if (current >= this.maxConnectionsPerRun) {
      return false;
    }
    this.activeConnections.set(runId, current + 1);
    return true;
  }

  /**
   * Releases an active SSE connection count.
   */
  public releaseConnection(runId: string): void {
    const current = this.activeConnections.get(runId) || 0;
    if (current <= 1) {
      this.activeConnections.delete(runId);
    } else {
      this.activeConnections.set(runId, current - 1);
    }
  }

  /**
   * Cleans up buffered events for a run after a delay
   */
  public cleanupRun(runId: string, delayMs = 60000): void {
    setTimeout(() => {
      this.eventHistory.delete(runId);
      this.activeConnections.delete(runId);
      this.removeAllListeners(`run:${runId}`);
    }, delayMs);
  }
}

export const executionEventBus = new ExecutionEventBus();
