import { WorkerProcess } from './worker/worker-process.js';
import { logger } from './config/logger.js';

const worker = new WorkerProcess({
  workerId: process.env.WORKER_ID,
  concurrency: process.env.WORKER_CONCURRENCY ? parseInt(process.env.WORKER_CONCURRENCY, 10) : 5,
});

async function main() {
  logger.info('=== [Dormammu Engine] Distributed Worker Daemon Starting ===');
  await worker.start();

  const handleShutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Gracefully stopping Dormammu Worker Daemon...`);
    await worker.stop();
    process.exit(0);
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}

main().catch((err) => {
  logger.error({ err }, 'Fatal error starting Dormammu Worker Daemon');
  process.exit(1);
});
