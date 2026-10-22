import { Request, Response, NextFunction } from 'express';
import { workflowService } from '../services/workflow.service.js';

function getWorkflowIdParam(req: Request): string {
  return String(req.params.workflowId || req.params.id);
}

export class WorkflowController {
  public static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const search = req.query.search ? String(req.query.search) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const includeArchived = req.query.includeArchived === 'true';

      const { workflows, total } = await workflowService.listWorkflows({
        page,
        limit,
        search,
        status,
        includeArchived,
      });

      res.status(200).json({
        success: true,
        data: workflows,
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
      const id = getWorkflowIdParam(req);
      const includeArchived = req.query.includeArchived === 'true';
      const workflow = await workflowService.getWorkflow(id, includeArchived);
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
      const id = getWorkflowIdParam(req);
      const updated = await workflowService.updateWorkflow(id, req.body);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async duplicate(req: Request, res: Response, next: NextFunction) {
    try {
      const id = getWorkflowIdParam(req);
      const { name } = req.body || {};
      const duplicated = await workflowService.duplicateWorkflow(id, name);
      res.status(201).json({
        success: true,
        data: duplicated,
        message: `Workflow duplicated as '${duplicated.name}'`,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async publish(req: Request, res: Response, next: NextFunction) {
    try {
      const id = getWorkflowIdParam(req);
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

  public static async activate(req: Request, res: Response, next: NextFunction) {
    try {
      const id = getWorkflowIdParam(req);
      const activated = await workflowService.activateWorkflow(id);
      res.status(200).json({
        success: true,
        data: activated,
        message: `Workflow '${activated.name}' is now active and ready for triggers`,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async pause(req: Request, res: Response, next: NextFunction) {
    try {
      const id = getWorkflowIdParam(req);
      const paused = await workflowService.pauseWorkflow(id);
      res.status(200).json({
        success: true,
        data: paused,
        message: `Workflow '${paused.name}' paused`,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async delete(req: Request, res: Response, next: NextFunction) {
    try {
      const id = getWorkflowIdParam(req);
      const result = await workflowService.deleteWorkflow(id);
      res.status(200).json({
        success: true,
        data: result,
        message: result.message,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async validate(req: Request, res: Response, next: NextFunction) {
    try {
      const id = req.params.workflowId || req.params.id;
      if (id) {
        const validation = await workflowService.validateWorkflowById(String(id));
        return res.status(200).json({
          success: true,
          data: validation,
        });
      }

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
