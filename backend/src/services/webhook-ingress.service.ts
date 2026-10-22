import crypto from 'crypto';
import { durableDagOrchestrator } from '../engine/durable-dag.orchestrator.js';
import { workflowRepository } from '../repositories/workflow.repository.js';
import { triggerRepository } from '../repositories/trigger.repository.js';
import { TriggerDeliveryRecord, WorkflowTrigger } from '../models/trigger.types.js';
import { createError } from '../middleware/error.middleware.js';
import { sanitizePayload } from '../utils/sanitizer.js';
import { logger } from '../config/logger.js';

interface IdempotencyCacheEntry {
  executionId: string;
  status: string;
  timestamp: number;
}

interface RateLimitBucket {
  count: number;
  resetAt: number;
}

export class WebhookIngressService {
  private idempotencyCache: Map<string, IdempotencyCacheEntry> = new Map();
  private rateLimitMap: Map<string, RateLimitBucket> = new Map();
  private deliveryHistory: Map<string, TriggerDeliveryRecord[]> = new Map();
  private maxDeliveriesPerTrigger = 100;

  /**
   * Generates a secure, unguessable public webhook slug
   */
  public static generateWebhookSlug(prefix = 'whk'): string {
    return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
  }

  /**
   * Generates a cryptographically strong signing secret
   */
  public static generateSigningSecret(prefix = 'whsec'): string {
    return `${prefix}_${crypto.randomBytes(24).toString('hex')}`;
  }

  /**
   * Verifies an incoming webhook request signature or authorization header
   */
  public verifySignature(
    secret: string,
    payload: any,
    headers: Record<string, any>
  ): { valid: boolean; reason?: string } {
    if (!secret) {
      return { valid: true };
    }

    // 1. Check direct token in headers
    const authHeader = headers['x-webhook-secret'] || headers['x-secret-token'] || headers['authorization'];
    if (authHeader) {
      const token = String(authHeader).replace(/^Bearer\s+/i, '').trim();
      if (token === secret) {
        return { valid: true };
      }
    }

    // 2. Check HMAC signature headers
    const sigHeader =
      headers['x-dormammu-signature'] ||
      headers['x-hub-signature-256'] ||
      headers['x-webhook-signature'] ||
      headers['x-signature'];

    if (!sigHeader) {
      return {
        valid: false,
        reason: 'Missing webhook signature or authorization header',
      };
    }

    const sigString = String(sigHeader).trim();
    const hexHash = sigString.startsWith('sha256=') ? sigString.slice(7) : sigString;

    try {
      const payloadString = typeof payload === 'string' ? payload : JSON.stringify(payload);
      const computedHmac = crypto.createHmac('sha256', secret).update(payloadString).digest('hex');

      const computedBuffer = Buffer.from(computedHmac, 'utf8');
      const receivedBuffer = Buffer.from(hexHash, 'utf8');

      if (computedBuffer.length !== receivedBuffer.length) {
        return { valid: false, reason: 'Invalid signature length' };
      }

      const match = crypto.timingSafeEqual(computedBuffer, receivedBuffer);
      return { valid: match, reason: match ? undefined : 'Signature verification failed' };
    } catch (err: any) {
      return { valid: false, reason: `Error verifying signature: ${err.message}` };
    }
  }

  /**
   * In-memory sliding window rate limiter per webhook path (default 60 req/min)
   */
  public checkRateLimit(path: string, limit = 60, windowMs = 60000): { allowed: boolean; retryAfterSeconds?: number } {
    const now = Date.now();
    const bucket = this.rateLimitMap.get(path);

    if (!bucket || now > bucket.resetAt) {
      this.rateLimitMap.set(path, { count: 1, resetAt: now + windowMs });
      return { allowed: true };
    }

    if (bucket.count >= limit) {
      const retryAfterSeconds = Math.ceil((bucket.resetAt - now) / 1000);
      return { allowed: false, retryAfterSeconds };
    }

    bucket.count += 1;
    return { allowed: true };
  }

  /**
   * Processes an incoming webhook request
   */
  public async handleIngress(
    path: string,
    payload: any,
    headers: Record<string, any>,
    options: {
      ip?: string;
      method?: string;
      query?: Record<string, any>;
    } = {}
  ): Promise<{
    statusCode: number;
    body: Record<string, any>;
  }> {
    const startTimeMs = Date.now();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;

    // Rate limiting check
    const rateCheck = this.checkRateLimit(cleanPath, 60, 60000);
    if (!rateCheck.allowed) {
      return {
        statusCode: 429,
        body: {
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: `Too many requests for webhook endpoint '${cleanPath}'. Try again in ${rateCheck.retryAfterSeconds}s`,
            retryAfterSeconds: rateCheck.retryAfterSeconds,
          },
        },
      };
    }

    // Locate trigger
    const trigger = await triggerRepository.findByWebhookPath(cleanPath);
    if (!trigger) {
      return {
        statusCode: 404,
        body: {
          success: false,
          error: {
            code: 'TRIGGER_NOT_FOUND',
            message: `No active trigger registered for webhook path '${cleanPath}'`,
          },
        },
      };
    }

    // Check trigger enabled status
    if (!trigger.enabled) {
      this.recordDelivery({
        id: `del_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        status: 'REJECTED',
        httpStatus: 403,
        deliveredAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        ip: options.ip,
        headers: sanitizePayload(headers) as Record<string, string>,
        payload: sanitizePayload(payload),
        error: `Trigger '${trigger.name}' is currently disabled`,
      });

      return {
        statusCode: 403,
        body: {
          success: false,
          error: {
            code: 'TRIGGER_DISABLED',
            message: `Trigger '${trigger.name}' is currently disabled. Please enable it in the dashboard.`,
          },
        },
      };
    }

    // Method restriction check
    const allowedMethods = trigger.allowedMethods || ['POST'];
    const currentMethod = (options.method || 'POST').toUpperCase();
    if (!allowedMethods.map((m) => m.toUpperCase()).includes(currentMethod)) {
      return {
        statusCode: 405,
        body: {
          success: false,
          error: {
            code: 'METHOD_NOT_ALLOWED',
            message: `Method ${currentMethod} is not permitted for this webhook. Allowed: ${allowedMethods.join(', ')}`,
          },
        },
      };
    }

    // Signature / Secret Verification
    if (trigger.webhookSecret) {
      const sigResult = this.verifySignature(trigger.webhookSecret, payload, headers);
      if (!sigResult.valid) {
        this.recordDelivery({
          id: `del_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          triggerId: trigger.id,
          workflowId: trigger.workflowId,
          status: 'REJECTED',
          httpStatus: 401,
          deliveredAt: new Date().toISOString(),
          durationMs: Date.now() - startTimeMs,
          ip: options.ip,
          headers: sanitizePayload(headers) as Record<string, string>,
          payload: sanitizePayload(payload),
          error: sigResult.reason || 'Invalid webhook secret / signature',
        });

        return {
          statusCode: 401,
          body: {
            success: false,
            error: {
              code: 'WEBHOOK_UNAUTHORIZED',
              message: sigResult.reason || 'Invalid or missing webhook signature',
            },
          },
        };
      }
    }

    // Idempotency / Duplicate-delivery Protection
    const idempotencyKey = headers['idempotency-key'] || headers['x-idempotency-key'] || headers['x-request-id'];
    if (idempotencyKey) {
      const cacheKey = `${trigger.id}:${String(idempotencyKey).trim()}`;
      const existing = this.idempotencyCache.get(cacheKey);

      if (existing) {
        logger.info(
          { triggerId: trigger.id, idempotencyKey, executionId: existing.executionId },
          '[Webhook] Duplicate delivery detected with matching idempotency key'
        );

        this.recordDelivery({
          id: `del_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          triggerId: trigger.id,
          workflowId: trigger.workflowId,
          executionId: existing.executionId,
          status: 'DUPLICATE',
          httpStatus: 200,
          deliveredAt: new Date().toISOString(),
          durationMs: Date.now() - startTimeMs,
          ip: options.ip,
          idempotencyKey: String(idempotencyKey),
          headers: sanitizePayload(headers) as Record<string, string>,
          payload: sanitizePayload(payload),
          error: 'Duplicate delivery ignored',
        });

        return {
          statusCode: 200,
          body: {
            success: true,
            isDuplicate: true,
            executionId: existing.executionId,
            status: existing.status,
            message: 'Duplicate delivery acknowledged; existing execution reused.',
          },
        };
      }
    }

    // Validate published workflow exists
    const workflow = await workflowRepository.findById(trigger.workflowId);
    if (!workflow) {
      return {
        statusCode: 404,
        body: {
          success: false,
          error: {
            code: 'WORKFLOW_NOT_FOUND',
            message: `Associated workflow '${trigger.workflowId}' does not exist`,
          },
        },
      };
    }

    // Enqueue real workflow execution via durable DAG orchestrator
    try {
      const execution = await durableDagOrchestrator.createRun(trigger.workflowId, {
        triggerType: 'webhook',
        input: {
          payload,
          webhookPath: cleanPath,
          headers: sanitizePayload(headers) as Record<string, unknown>,
          query: options.query || {},
        },
      });

      // Update idempotency cache
      if (idempotencyKey) {
        const cacheKey = `${trigger.id}:${String(idempotencyKey).trim()}`;
        this.idempotencyCache.set(cacheKey, {
          executionId: execution.id,
          status: execution.status,
          timestamp: Date.now(),
        });
      }

      // Record trigger fire
      await triggerRepository.recordTriggerFire(trigger.id, 'success');

      // Record successful delivery
      this.recordDelivery({
        id: `del_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        executionId: execution.id,
        status: 'SUCCESS',
        httpStatus: 202,
        deliveredAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        ip: options.ip,
        idempotencyKey: idempotencyKey ? String(idempotencyKey) : null,
        headers: sanitizePayload(headers) as Record<string, string>,
        payload: sanitizePayload(payload),
      });

      return {
        statusCode: 202,
        body: {
          success: true,
          data: {
            triggerId: trigger.id,
            workflowId: trigger.workflowId,
            workflowVersion: execution.workflowVersion,
            executionId: execution.id,
            status: execution.status,
            enqueuedAt: execution.startedAt,
          },
          message: `Webhook successfully ingested; execution #${execution.id.substring(0, 8)} queued`,
        },
      };
    } catch (err: any) {
      await triggerRepository.recordTriggerFire(trigger.id, 'failed', err.message);

      this.recordDelivery({
        id: `del_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        triggerId: trigger.id,
        workflowId: trigger.workflowId,
        status: 'FAILED',
        httpStatus: 500,
        deliveredAt: new Date().toISOString(),
        durationMs: Date.now() - startTimeMs,
        ip: options.ip,
        headers: sanitizePayload(headers) as Record<string, string>,
        payload: sanitizePayload(payload),
        error: err.message || 'Execution queueing failed',
      });

      return {
        statusCode: 500,
        body: {
          success: false,
          error: {
            code: 'EXECUTION_QUEUE_FAILED',
            message: `Failed to queue execution for webhook: ${err.message}`,
          },
        },
      };
    }
  }

  /**
   * Appends a delivery record for a trigger
   */
  public recordDelivery(record: TriggerDeliveryRecord): void {
    if (!this.deliveryHistory.has(record.triggerId)) {
      this.deliveryHistory.set(record.triggerId, []);
    }
    const history = this.deliveryHistory.get(record.triggerId)!;
    history.unshift(record);
    if (history.length > this.maxDeliveriesPerTrigger) {
      history.pop();
    }
  }

  /**
   * Retrieves recent delivery records for a trigger
   */
  public getDeliveries(triggerId: string, limit = 50): TriggerDeliveryRecord[] {
    const list = this.deliveryHistory.get(triggerId) || [];
    return list.slice(0, Math.min(100, limit));
  }
}

export const webhookIngressService = new WebhookIngressService();
