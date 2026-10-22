import { isTransientError } from './node-executor.registry.js';
import { logger } from '../config/logger.js';

export interface RetryEvaluation {
  shouldRetry: boolean;
  attempt: number;
  maxAttempts: number;
  backoffDelayMs: number;
  isTransient: boolean;
  reason: string;
}

export class RetryRecoveryManager {
  /**
   * Evaluates if a failed node attempt is eligible for retry.
   */
  public static evaluateFailure(
    error: any,
    currentAttempt: number,
    maxAttempts = 3,
    baseBackoffMs = 1000,
    maxBackoffMs = 30000
  ): RetryEvaluation {
    const isTransient = isTransientError(error);
    const hasAttemptsRemaining = currentAttempt < maxAttempts;
    const shouldRetry = isTransient && hasAttemptsRemaining;

    // Exponential backoff with jitter
    const exponentialDelay = baseBackoffMs * Math.pow(2, Math.max(0, currentAttempt - 1));
    const jitter = Math.random() * 200;
    const backoffDelayMs = Math.min(exponentialDelay + jitter, maxBackoffMs);

    let reason = '';
    if (!hasAttemptsRemaining) {
      reason = `Exhausted maximum retry attempts (${maxAttempts}).`;
    } else if (!isTransient) {
      reason = `Non-retryable permanent error encountered: ${error?.message || 'Execution error'}`;
    } else {
      reason = `Transient error encountered. Retrying in ${Math.round(backoffDelayMs)}ms (attempt ${currentAttempt + 1} of ${maxAttempts}).`;
    }

    return {
      shouldRetry,
      attempt: currentAttempt,
      maxAttempts,
      backoffDelayMs,
      isTransient,
      reason,
    };
  }

  /**
   * Calculates backoff delay for job retry scheduling
   */
  public static getBackoffDelay(attempt: number, baseMs = 1000, maxMs = 30000): number {
    const exp = baseMs * Math.pow(2, Math.max(0, attempt - 1));
    return Math.min(exp, maxMs);
  }
}
