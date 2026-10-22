import { Request, Response, NextFunction } from 'express';
import { workflowService } from '../services/workflow.service.js';

export class WorkflowController {
  public static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const { search, status } = req.query as { search?: string; status?: string };
      const workflows = await workflowService.listWorkflows({ search, status });
      res.status(200).json({
        success: true,
        data: workflows,
        meta: {
          total: workflows.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const workflow = await workflowService.getWorkflow(id);
      res.status(200).json({
        success: true,
        data: workflow,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async create(req: Request, res: Response, next: NextFunction) {
    try {
      const created = await workflowService.createWorkflow(req.body);
      res.status(201).json({
        success: true,
        data: created,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async update(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const updated = await workflowService.updateWorkflow(id, req.body);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async publish(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      const published = await workflowService.publishWorkflow(id);
      res.status(200).json({
        success: true,
        data: published,
        message: `Workflow '${published.name}' published as version ${published.publishedVersion}`,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = String(req.params.id);
      await workflowService.deleteWorkflow(id);
      res.status(200).json({
        success: true,
        message: `Workflow '${id}' deleted successfully`,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async validate(req: Request, res: Response, next: NextFunction) {
    try {
      const validation = workflowService.validate(req.body);
      res.status(200).json({
        success: true,
        data: validation,
      });
    } catch (err) {
      next(err);
    }
  }
}
