import { logger } from '../config/logger.js';
import { WorkflowTrigger } from '../models/trigger.types.js';

/**
 * Validates IANA timezone identifier
 */
export function isValidTimezone(tz: string): boolean {
  if (!tz || typeof tz !== 'string') return false;
  try {
    Intl.DateTimeFormat(undefined, { timeZone: tz });
    return true;
  } catch {
    return false;
  }
}

/**
 * Matches a single cron field pattern against a numeric value
 */
function matchCronField(pattern: string, value: number, min: number, max: number): boolean {
  if (pattern === '*') return true;

  // Step expressions: */5 or 10-30/5
  if (pattern.includes('/')) {
    const [rangePart, stepStr] = pattern.split('/');
    const step = parseInt(stepStr, 10);
    if (isNaN(step) || step <= 0) return false;

    if (rangePart === '*' || rangePart === '') {
      return (value - min) % step === 0;
    }

    if (rangePart.includes('-')) {
      const [startStr, endStr] = rangePart.split('-');
      const start = parseInt(startStr, 10);
      const end = parseInt(endStr, 10);
      if (isNaN(start) || isNaN(end) || value < start || value > end) return false;
      return (value - start) % step === 0;
    }
  }

  // Comma lists: 1,5,10
  if (pattern.includes(',')) {
    const parts = pattern.split(',');
    return parts.some((p) => matchCronField(p.trim(), value, min, max));
  }

  // Ranges: 1-5
  if (pattern.includes('-')) {
    const [startStr, endStr] = pattern.split('-');
    const start = parseInt(startStr, 10);
    const end = parseInt(endStr, 10);
    if (isNaN(start) || isNaN(end)) return false;
    return value >= start && value <= end;
  }

  const num = parseInt(pattern, 10);
  return !isNaN(num) && num === value;
}

/**
 * Validates a 5-part cron expression: "minute hour day-of-month month day-of-week"
 */
export function validateCronExpression(expression: string): { isValid: boolean; error?: string } {
  if (!expression || typeof expression !== 'string') {
    return { isValid: false, error: 'Cron expression must be a non-empty string' };
  }

  const parts = expression.trim().split(/\s+/);
  if (parts.length !== 5) {
    return {
      isValid: false,
      error: `Cron expression must have exactly 5 fields (minute hour day-of-month month day-of-week), received ${parts.length}`,
    };
  }

  const [min, hour, dom, month, dow] = parts;

  // Helper to validate single field bounds
  const checkField = (field: string, minVal: number, maxVal: number, name: string): string | null => {
    if (field === '*') return null;
    const items = field.split(',');
    for (const item of items) {
      if (item.includes('/')) {
        const [r, step] = item.split('/');
        const s = parseInt(step, 10);
        if (isNaN(s) || s <= 0) return `Invalid step in ${name}: ${item}`;
        if (r !== '*' && r !== '') {
          const subErr = checkField(r, minVal, maxVal, name);
          if (subErr) return subErr;
        }
      } else if (item.includes('-')) {
        const [a, b] = item.split('-').map((v) => parseInt(v, 10));
        if (isNaN(a) || isNaN(b) || a < minVal || b > maxVal || a > b) {
          return `Invalid range in ${name}: ${item} (must be between ${minVal} and ${maxVal})`;
        }
      } else {
        const n = parseInt(item, 10);
        if (isNaN(n) || n < minVal || n > maxVal) {
          return `Invalid value in ${name}: ${item} (must be between ${minVal} and ${maxVal})`;
        }
      }
    }
    return null;
  };

  const minErr = checkField(min, 0, 59, 'minute');
  if (minErr) return { isValid: false, error: minErr };

  const hourErr = checkField(hour, 0, 23, 'hour');
  if (hourErr) return { isValid: false, error: hourErr };

  const domErr = checkField(dom, 1, 31, 'day-of-month');
  if (domErr) return { isValid: false, error: domErr };

  const monthErr = checkField(month, 1, 12, 'month');
  if (monthErr) return { isValid: false, error: monthErr };

  const dowErr = checkField(dow, 0, 7, 'day-of-week');
  if (dowErr) return { isValid: false, error: dowErr };

  return { isValid: true };
}

/**
 * Computes next run timestamp for a cron expression in the specified timezone
 */
export function calculateNextRun(
  cronExpression: string,
  timezone = 'UTC',
  fromDate: Date = new Date()
): Date {
  const validation = validateCronExpression(cronExpression);
  if (!validation.isValid) {
    throw new Error(`Invalid cron expression: ${validation.error}`);
  }

  const parts = cronExpression.trim().split(/\s+/);
  const [minPattern, hourPattern, domPattern, monthPattern, dowPattern] = parts;

  // Single Intl.DateTimeFormat instance created once
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hourCycle: 'h23',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    weekday: 'short',
  });

  const weekdayMap: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };

  // Start checking from the next whole minute
  const candidate = new Date(fromDate.getTime());
  candidate.setSeconds(0, 0);
  candidate.setTime(candidate.getTime() + 60 * 1000);

  // Maximum search iterations (safely bounded)
  const maxIterations = 50000;
  let iterations = 0;

  while (iterations < maxIterations) {
    iterations++;

    const formattedParts = formatter.formatToParts(candidate);
    let cMin = 0;
    let cHour = 0;
    let cDom = 1;
    let cMonth = 1;
    let cDow = 0;

    for (const pt of formattedParts) {
      if (pt.type === 'minute') cMin = parseInt(pt.value, 10);
      else if (pt.type === 'hour') cHour = parseInt(pt.value, 10);
      else if (pt.type === 'day') cDom = parseInt(pt.value, 10);
      else if (pt.type === 'month') cMonth = parseInt(pt.value, 10);
      else if (pt.type === 'weekday') cDow = weekdayMap[pt.value] ?? 0;
    }

    // 1. Month check
    if (!matchCronField(monthPattern, cMonth, 1, 12)) {
      // Advance by 1 day
      candidate.setTime(candidate.getTime() + 24 * 3600 * 1000);
      continue;
    }

    // 2. Day check (DOM and DOW)
    const matchesDom = matchCronField(domPattern, cDom, 1, 31);
    const matchesDow =
      matchCronField(dowPattern, cDow, 0, 7) ||
      (cDow === 0 && matchCronField(dowPattern, 7, 0, 7));

    let matchesDay = false;
    if (domPattern === '*' && dowPattern === '*') {
      matchesDay = true;
    } else if (domPattern !== '*' && dowPattern === '*') {
      matchesDay = matchesDom;
    } else if (domPattern === '*' && dowPattern !== '*') {
      matchesDay = matchesDow;
    } else {
      matchesDay = matchesDom || matchesDow;
    }

    if (!matchesDay) {
      // Advance to next day boundary in target timezone
      const hoursLeft = 23 - cHour;
      const minsLeft = 60 - cMin;
      candidate.setTime(candidate.getTime() + (hoursLeft * 3600 + minsLeft * 60) * 1000);
      continue;
    }

    // 3. Hour check
    if (!matchCronField(hourPattern, cHour, 0, 23)) {
      // Advance to next hour boundary in target timezone
      const minsLeft = 60 - cMin;
      candidate.setTime(candidate.getTime() + minsLeft * 60 * 1000);
      continue;
    }

    // 4. Minute check
    if (!matchCronField(minPattern, cMin, 0, 59)) {
      candidate.setTime(candidate.getTime() + 60 * 1000);
      continue;
    }

    // Match found!
    return candidate;
  }

  throw new Error(`Could not find next run within 1 year for cron expression "${cronExpression}"`);
}

export type CronTriggerFireHandler = (trigger: WorkflowTrigger) => Promise<void>;

/**
 * Robust in-process schedule coordinator
 * Ensures single-registration per trigger ID and seamless updates on enable/disable/delete
 */
export class CronScheduler {
  private activeTimers: Map<string, NodeJS.Timeout> = new Map();
  private onFireHandler: CronTriggerFireHandler | null = null;

  public setHandler(handler: CronTriggerFireHandler) {
    this.onFireHandler = handler;
  }

  /**
   * Registers or updates a scheduled cron trigger.
   */
  public schedule(trigger: WorkflowTrigger): string | null {
    this.cancel(trigger.id);

    if (!trigger.enabled || trigger.kind !== 'cron' || !trigger.cronExpression) {
      return null;
    }

    const timezone = trigger.timezone && isValidTimezone(trigger.timezone) ? trigger.timezone : 'UTC';

    try {
      const nextRunDate = calculateNextRun(trigger.cronExpression, timezone);
      const nextRunIso = nextRunDate.toISOString();
      const delayMs = Math.max(50, nextRunDate.getTime() - Date.now());

      logger.info(
        { triggerId: trigger.id, name: trigger.name, cron: trigger.cronExpression, nextRunIso, delayMs },
        '[CronScheduler] Registered schedule for trigger'
      );

      const timer = setTimeout(async () => {
        try {
          if (this.onFireHandler) {
            await this.onFireHandler(trigger);
          }
        } catch (err) {
          logger.error({ err, triggerId: trigger.id }, '[CronScheduler] Error executing scheduled trigger callback');
        } finally {
          // Reschedule for next occurrence
          this.schedule(trigger);
        }
      }, delayMs);

      // Unref timer so it does not hold the Node.js event loop open during graceful test teardowns
      if (typeof timer.unref === 'function') {
        timer.unref();
      }

      this.activeTimers.set(trigger.id, timer);
      return nextRunIso;
    } catch (err: any) {
      logger.error({ err: err.message, triggerId: trigger.id }, '[CronScheduler] Failed to calculate next run');
      return null;
    }
  }

  /**
   * Cancels a scheduled trigger
   */
  public cancel(triggerId: string): void {
    if (this.activeTimers.has(triggerId)) {
      clearTimeout(this.activeTimers.get(triggerId)!);
      this.activeTimers.delete(triggerId);
      logger.info({ triggerId }, '[CronScheduler] Cancelled schedule for trigger');
    }
  }

  /**
   * Clears all active schedules
   */
  public clearAll(): void {
    for (const [id, timer] of this.activeTimers.entries()) {
      clearTimeout(timer);
    }
    this.activeTimers.clear();
  }

  public getActiveCount(): number {
    return this.activeTimers.size;
  }
}

export const cronScheduler = new CronScheduler();
