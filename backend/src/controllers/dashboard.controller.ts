import { Request, Response, NextFunction } from 'express';
import { dashboardService } from '../services/dashboard.service.js';

export class DashboardController {
  public static async summary(req: Request, res: Response, next: NextFunction) {
    try {
      const period = req.query.period as string | undefined;
      const summary = await dashboardService.getSummary(period);
      res.status(200).json({
        success: true,
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async activity(req: Request, res: Response, next: NextFunction) {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const { items, total } = await dashboardService.getActivityFeed(page, limit);

      res.status(200).json({
        success: true,
        data: items,
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
}
