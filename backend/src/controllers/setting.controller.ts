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
          supportedCount: settings.filter((s) => s.isOperationallySupported).length,
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
      const key = String(req.params.key);
      const { value, category, description } = req.body;
      const updated = await settingService.set(key, value, category, description);
      res.status(200).json({
        success: true,
        data: updated,
        message: updated.requiresRestart
          ? `Setting '${key}' saved successfully. ${updated.restartNotice || 'Worker restart required.'}`
          : `Setting '${key}' saved and applied immediately.`,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async batch(req: Request, res: Response, next: NextFunction) {
    try {
      const { settings } = req.body;
      const updated = await settingService.batchUpdate(settings);
      const restartCount = updated.filter((s) => s.requiresRestart).length;

      res.status(200).json({
        success: true,
        data: updated,
        meta: {
          updatedCount: updated.length,
          restartRequiredCount: restartCount,
        },
        message: restartCount > 0
          ? `${updated.length} settings updated. Note: ${restartCount} setting(s) require worker restart to take effect.`
          : `${updated.length} settings updated successfully.`,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async systemInfo(_req: Request, res: Response, next: NextFunction) {
    try {
      const info = await settingService.getSystemInfo();
      res.status(200).json({
        success: true,
        data: info,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async resetDemo(req: Request, res: Response, next: NextFunction) {
    try {
      const confirmation = req.body?.confirmation;
      const result = await settingService.resetDemoData(confirmation);
      res.status(200).json({
        success: true,
        data: result,
      });
    } catch (err) {
      next(err);
    }
  }
}
