import { Request, Response, NextFunction } from 'express';
import { executionService } from '../services/execution.service.js';

export class ExecutionController {
  public static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const workflowId = req.query.workflowId ? String(req.query.workflowId) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;

      const { executions, total } = await executionService.listExecutions({
        page,
        limit,
        workflowId,
        status,
      });

      res.status(200).json({
        success: true,
        data: executions,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const execution = await executionService.getExecution(id);
      res.status(200).json({
        success: true,
        data: execution,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getNodeExecutions(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const nodes = await executionService.getNodeExecutions(id);
      res.status(200).json({
        success: true,
        data: nodes,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async createRun(req: Request, res: Response, next: NextFunction) {
    try {
      const workflowId = String(req.params.workflowId || req.params.id);
      const { input, triggerType } = req.body;
      const execution = await executionService.createDurableRun(workflowId, {
        input,
        triggerType,
      });

      res.status(201).json({
        success: true,
        data: execution,
        message: 'Workflow run queued for execution',
      });
    } catch (err) {
      next(err);
    }
  }

  public static async retryRun(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const execution = await executionService.retryExecution(id);
      res.status(200).json({
        success: true,
        data: execution,
        message: 'Workflow run retry initiated',
      });
    } catch (err) {
      next(err);
    }
  }

  public static async trigger(req: Request, res: Response, next: NextFunction) {
    try {
      const workflowId = String(req.params.workflowId || req.params.id);
      const { input, triggerType } = req.body;
      const execution = await executionService.triggerExecution(workflowId, {
        input,
        triggerType,
      });

      res.status(201).json({
        success: true,
        data: execution,
      });
    } catch (err) {
      next(err);
    }
  }
}
