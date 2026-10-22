import { WorkerEvent, WorkerEventType } from '../models/worker.types.js';

let eventCounter = 0;
const MAX_EVENTS = 300;

export class WorkerEventService {
  private events: WorkerEvent[] = [];

  public recordEvent(workerId: string, type: WorkerEventType, details?: Record<string, any>): WorkerEvent {
    eventCounter++;
    const safeDetails = this.sanitizeDetails(details);
    const event: WorkerEvent = {
      id: `wevt_${Date.now()}_${eventCounter}`,
      workerId,
      type,
      timestamp: new Date().toISOString(),
      details: safeDetails,
    };

    this.events.unshift(event);
    if (this.events.length > MAX_EVENTS) {
      this.events = this.events.slice(0, MAX_EVENTS);
    }

    return event;
  }

  public getEvents(options: { workerId?: string; type?: WorkerEventType; limit?: number } = {}): WorkerEvent[] {
    let result = this.events;
    if (options.workerId) {
      result = result.filter((e) => e.workerId === options.workerId);
    }
    if (options.type) {
      result = result.filter((e) => e.type === options.type);
    }
    const limit = Math.min(200, Math.max(1, options.limit || 50));
    return result.slice(0, limit);
  }

  public clear(): void {
    this.events = [];
  }

  private sanitizeDetails(details?: Record<string, any>): Record<string, any> | undefined {
    if (!details) return undefined;
    const sanitized: Record<string, any> = {};

    for (const [key, value] of Object.entries(details)) {
      const lower = key.toLowerCase();
      // Redact sensitive keys
      if (
        lower.includes('secret') ||
        lower.includes('token') ||
        lower.includes('password') ||
        lower.includes('auth') ||
        lower.includes('key') ||
        lower.includes('cookie')
      ) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeDetails(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }
}

export const workerEventService = new WorkerEventService();
