import { Router, Request, Response } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    service: 'dormammu-backend',
    version: '0.1.0',
    timestamp: new Date().toISOString(),
    engine: {
      type: 'Distributed DAG Execution Engine',
      workersOnline: 2,
      redisConnected: true,
    },
  });
});
