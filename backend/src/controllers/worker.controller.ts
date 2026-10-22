import { Request, Response, NextFunction } from 'express';
import { workerService } from '../services/worker.service.js';

export class WorkerController {
  public static async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const workers = await workerService.getWorkers();
      res.status(200).json({
        success: true,
        data: workers,
        meta: {
          total: workers.length,
          activeCount: workers.filter((w) => w.status === 'busy').length,
          idleCount: workers.filter((w) => w.status === 'idle').length,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async queues(_req: Request, res: Response, next: NextFunction) {
    try {
      const queues = await workerService.getQueues();
      res.status(200).json({
        success: true,
        data: queues,
        meta: {
          total: queues.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async heartbeat(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      await workerService.recordHeartbeat(id, req.body);
      res.status(200).json({
        success: true,
        message: `Heartbeat acknowledged for worker '${id}'`,
      });
    } catch (err) {
      next(err);
    }
  }
}
