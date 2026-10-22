import { Request, Response, NextFunction } from 'express';
import { WORKER_CONFIG } from '../config/worker.config.js';

/**
 * Middleware to secure internal worker heartbeat and registration endpoints.
 * Prevents arbitrary or malicious clients from registering fake workers or injecting telemetry.
 */
export function verifyWorkerAuth(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers['authorization'];
  const customSecret = req.headers['x-worker-secret'] || req.headers['x-internal-secret'];

  let token = '';
  if (customSecret && typeof customSecret === 'string') {
    token = customSecret;
  } else if (authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.slice(7).trim();
  }

  // Verify token matches configured internal secret
  if (!token || token !== WORKER_CONFIG.INTERNAL_AUTH_SECRET) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized: Missing or invalid internal worker authentication token',
    });
    return;
  }

  next();
}
