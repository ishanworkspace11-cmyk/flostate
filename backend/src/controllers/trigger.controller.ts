import { Request, Response, NextFunction } from 'express';
import { triggerService } from '../services/trigger.service.js';

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

  public static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const created = await triggerService.createTrigger(req.body);
      res.status(201).json({
        success: true,
        data: created,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async handleIngress(req: Request, res: Response, next: NextFunction) {
    try {
      const webhookPath = req.params[0] || (req.params as any).path || '';
      const payload = req.body || {};
      const result = await triggerService.handleWebhookIngress(webhookPath, payload, req.headers);

      res.status(200).json({
        success: true,
        data: result,
        message: `Webhook successfully ingested and workflow execution triggered`,
      });
    } catch (err) {
      next(err);
    }
  }
}
