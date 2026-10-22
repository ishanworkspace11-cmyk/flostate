import { settingRepository, ApplicationSettingRecord } from '../repositories/setting.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { createError } from '../middleware/error.middleware.js';

export class SettingService {
  async getAll(): Promise<ApplicationSettingRecord[]> {
    return settingRepository.getAll();
  }

  async getByKey(key: string): Promise<ApplicationSettingRecord> {
    const setting = await settingRepository.getByKey(key);
    if (!setting) {
      throw createError(404, `Setting '${key}' not found`, 'SETTING_NOT_FOUND');
    }
    return setting;
  }

  async set(key: string, value: any, category = 'general', description?: string): Promise<ApplicationSettingRecord> {
    const updated = await settingRepository.set(key, value, category, description);
    await auditRepository.log({
      action: 'SETTING_UPDATED',
      entityType: 'SETTING',
      entityId: key,
      details: { category, value },
    });
    return updated;
  }
}

export const settingService = new SettingService();
