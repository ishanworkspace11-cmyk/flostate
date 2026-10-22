import { checkDatabaseConnection } from './prisma.js';
import { logger } from '../config/logger.js';

let cachedDbStatus: boolean | null = null;
let lastCheckTime = 0;
const CACHE_TTL_MS = 10000; // Cache check result for 10 seconds

export async function isDatabaseAvailable(): Promise<boolean> {
  const now = Date.now();
  if (cachedDbStatus !== null && now - lastCheckTime < CACHE_TTL_MS) {
    return cachedDbStatus;
  }

  const res = await checkDatabaseConnection(1000);
  cachedDbStatus = res.connected;
  lastCheckTime = now;

  if (!res.connected && process.env.NODE_ENV !== 'test') {
    logger.warn('Database is currently not reachable; repository using fallback memory store');
  }

  return cachedDbStatus;
}

export function resetDatabaseCheck() {
  cachedDbStatus = null;
  lastCheckTime = 0;
}
