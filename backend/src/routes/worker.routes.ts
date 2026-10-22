import { Router, Request, Response } from 'express';
import { store } from '../services/store.service.js';

export const workerRouter = Router();

workerRouter.get('/', async (req: Request, res: Response) => {
  const workers = await store.getWorkers();
  res.json({ workers });
});

workerRouter.get('/queues', async (req: Request, res: Response) => {
  const queues = await store.getQueues();
  res.json({ queues });
});
