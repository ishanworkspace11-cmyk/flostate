import { Request, Response, NextFunction } from 'express';
import { settingService } from '../services/setting.service.js';

export class SettingController {
  public static async list(_req: Request, res: Response, next: NextFunction) {
    try {
      const settings = await settingService.getAll();
      res.status(200).json({
        success: true,
        data: settings,
        meta: {
          total: settings.length,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getByKey(req: Request, res: Response, next: NextFunction) {
    try {
      const key = String(req.params.key);
      const setting = await settingService.getByKey(key);
      res.status(200).json({
        success: true,
        data: setting,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async set(req: Request, res: Response, next: NextFunction) {
    try {
      const { key, value, category, description } = req.body;
      const updated = await settingService.set(key, value, category, description);
      res.status(200).json({
        success: true,
        data: updated,
      });
    } catch (err) {
      next(err);
    }
  }
}
