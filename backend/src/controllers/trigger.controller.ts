import { Request, Response, NextFunction } from 'express';
import { triggerService } from '../services/trigger.service.js';
import { webhookIngressService } from '../services/webhook-ingress.service.js';

export class TriggerController {
  public static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { workflowId, kind } = req.query as { workflowId?: string; kind?: string };
      const triggers = await triggerService.listTriggers({ workflowId, kind });
      res.status(200).json({
        success: true,
        data: triggers,
        meta: {
          total: triggers.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const trigger = await triggerService.getTriggerById(id);
      res.status(200).json({
        success: true,
        data: trigger,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const created = await triggerService.createTrigger(req.body);
      res.status(201).json({
        success: true,
        data: created,
        message: 'Trigger created successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  public static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const updated = await triggerService.updateTrigger(id, req.body);
      res.status(200).json({
        success: true,
        data: updated,
        message: 'Trigger updated successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  public static async enable(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const updated = await triggerService.toggleTrigger(id, true);
      res.status(200).json({
        success: true,
        data: updated,
        message: 'Trigger enabled successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  public static async disable(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const updated = await triggerService.toggleTrigger(id, false);
      res.status(200).json({
        success: true,
        data: updated,
        message: 'Trigger disabled successfully',
      });
    } catch (err) {
      next(err);
    }
  }

  public static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const result = await triggerService.deleteTrigger(id);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getDeliveries(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 50;
      const deliveries = await triggerService.getDeliveryHistory(id, limit);
      res.status(200).json({
        success: true,
        data: deliveries,
        meta: {
          total: deliveries.length,
          limit,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async handleIngress(req: Request, res: Response, next: NextFunction) {
    try {
      const rawPath = req.params[0] || (req.params as any).path || '';
      const payload = req.body || {};
      const ip = req.ip || req.socket.remoteAddress;
      const method = req.method;

      const result = await webhookIngressService.handleIngress(rawPath, payload, req.headers, {
        ip,
        method,
        query: req.query,
      });

      res.status(result.statusCode).json(result.body);
    } catch (err) {
      next(err);
    }
  }
}
