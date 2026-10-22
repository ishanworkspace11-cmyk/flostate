import { PrismaClient } from '@prisma/client';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

export const prisma = new PrismaClient({
  log: env.NODE_ENV === 'test' 
    ? [] 
    : [
        { emit: 'event', level: 'query' },
        { emit: 'event', level: 'error' },
        { emit: 'event', level: 'info' },
        { emit: 'event', level: 'warn' },
      ],
});

if (env.NODE_ENV !== 'test') {
  prisma.$on('error' as never, (e: any) => {
    logger.error({ err: e }, 'Prisma error');
  });

  prisma.$on('warn' as never, (e: any) => {
    logger.warn({ warning: e }, 'Prisma warning');
  });
}

export async function checkDatabaseConnection(timeoutMs = 1200): Promise<{ connected: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) => setTimeout(() => reject(new Error('Database probe timeout')), timeoutMs)),
    ]);
    return { connected: true, latencyMs: Date.now() - start };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: err?.message || 'Database connection failed',
    };
  }
}
