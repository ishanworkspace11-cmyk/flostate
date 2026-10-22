import { Redis, RedisOptions } from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

const redisOptions: RedisOptions = {
  maxRetriesPerRequest: null,
  enableReadyCheck: false,
  lazyConnect: true,
  retryStrategy(times) {
    if (times > 3) {
      // Don't flood logs if Redis is not running yet
      return null;
    }
    return Math.min(times * 200, 2000);
  },
};

let redisClient: Redis | null = null;

export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(env.REDIS_URL, redisOptions);
    redisClient.on('error', (err) => {
      // Log as debug/warn so it doesn't crash app if redis container isn't up yet
      logger.warn({ err: err.message }, 'Redis connection issue (dormammu queue)');
    });
    redisClient.on('connect', () => {
      logger.info('Connected to Redis');
    });
  }
  return redisClient;
}

export async function checkRedisConnection(): Promise<{ connected: boolean; latencyMs?: number; error?: string }> {
  const start = Date.now();
  const client = getRedisClient();
  try {
    if (client.status !== 'ready' && client.status !== 'connecting' && client.status !== 'connect') {
      await client.connect();
    }
    const pong = await Promise.race([
      client.ping(),
      new Promise<string>((_, reject) => setTimeout(() => reject(new Error('Redis ping timeout')), 1500)),
    ]);
    if (pong === 'PONG') {
      return { connected: true, latencyMs: Date.now() - start };
    }
    return { connected: false, error: 'Unexpected response from Redis' };
  } catch (err: any) {
    return {
      connected: false,
      latencyMs: Date.now() - start,
      error: err?.message || 'Redis connection failed',
    };
  }
}
