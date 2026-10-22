import { Request, Response, NextFunction } from 'express';
import { workerService } from '../services/worker.service.js';

export class WorkerController {
  public static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const status = req.query.status as string | undefined;
      const includeSimulated = req.query.includeSimulated === 'true' || req.query.includeSimulated === '1';

      const result = await workerService.getWorkers({ status, includeSimulated });
      res.status(200).json({
        success: true,
        data: result.workers,
        meta: result.meta,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id || req.params.workerId);
      const worker = await workerService.getWorkerById(id);

      if (!worker) {
        res.status(404).json({
          success: false,
          error: `Worker node '${id}' not found`,
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: worker,
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

  public static async queueMetrics(_req: Request, res: Response, next: NextFunction) {
    try {
      const metrics = await workerService.getQueueMetrics();
      res.status(200).json({
        success: true,
        data: metrics,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async events(req: Request, res: Response, next: NextFunction) {
    try {
      const workerId = req.query.workerId as string | undefined;
      const type = req.query.type as any;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;

      const events = await workerService.getEvents({ workerId, type, limit });
      res.status(200).json({
        success: true,
        data: events,
        meta: {
          total: events.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async workerEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id || req.params.workerId);
      const type = req.query.type as any;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;

      const events = await workerService.getEvents({ workerId: id, type, limit });
      res.status(200).json({
        success: true,
        data: events,
        meta: {
          total: events.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async health(_req: Request, res: Response, next: NextFunction) {
    try {
      const health = await workerService.getSystemHealth();
      res.status(200).json({
        success: true,
        data: health,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async heartbeat(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id || req.body.workerId || req.body.id);
      if (!id) {
        res.status(400).json({
          success: false,
          error: 'Worker ID is required for heartbeat registration',
        });
        return;
      }

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
