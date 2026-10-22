import { Request, Response } from 'express';
import { checkDatabaseConnection } from '../database/prisma.js';
import { checkRedisConnection } from '../queue/redis.js';

export class HealthController {
  public static async health(_req: Request, res: Response) {
    res.status(200).json({
      success: true,
      data: {
        status: 'ok',
        service: 'dormammu-engine-backend',
        version: '1.0.0',
        uptimeSeconds: Math.floor(process.uptime()),
        timestamp: new Date().toISOString(),
        memoryUsage: process.memoryUsage(),
      },
    });
  }

  public static async ready(_req: Request, res: Response) {
    const [dbCheck, redisCheck] = await Promise.all([
      checkDatabaseConnection(),
      checkRedisConnection(),
    ]);

    const isHealthy = dbCheck.connected; // Redis may be degraded / fallback in early setup
    const statusCode = isHealthy ? 200 : 503;

    res.status(statusCode).json({
      success: isHealthy,
      data: {
        status: isHealthy ? (redisCheck.connected ? 'ready' : 'degraded') : 'unhealthy',
        service: 'dormammu-engine-backend',
        timestamp: new Date().toISOString(),
        dependencies: {
          database: {
            name: 'PostgreSQL 16 (Prisma)',
            status: dbCheck.connected ? 'up' : 'down',
            latencyMs: dbCheck.latencyMs,
            error: dbCheck.error,
          },
          redis: {
            name: 'Redis 7 (BullMQ)',
            status: redisCheck.connected ? 'up' : 'down',
            latencyMs: redisCheck.latencyMs,
            error: redisCheck.error,
          },
        },
      },
    });
  }
}
