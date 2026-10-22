import { settingRepository } from '../repositories/setting.repository.js';
import { auditRepository } from '../repositories/audit.repository.js';
import { createError } from '../middleware/error.middleware.js';
import {
  concurrencyLimitSettingSchema,
  retryBackoffSettingSchema,
  nodeTimeoutSettingSchema,
  historyRetentionSettingSchema,
  uiPreferenceSettingSchema,
} from '../validation/schemas.js';
import {
  ApplicationSettingDefinition,
  SettingCategory,
  SystemInfo,
  DemoResetResult,
} from '../models/setting.types.js';

export class SettingService {
  async getAll(): Promise<ApplicationSettingDefinition[]> {
    return settingRepository.getAll();
  }

  async getByKey(key: string): Promise<ApplicationSettingDefinition> {
    const setting = await settingRepository.getByKey(key);
    if (!setting) {
      throw createError(404, `Setting '${key}' not found`, 'SETTING_NOT_FOUND');
    }
    return setting;
  }

  async set(
    key: string,
    value: any,
    category?: SettingCategory,
    description?: string
  ): Promise<ApplicationSettingDefinition> {
    // 1. Enforce secret protection
    if (settingRepository.isProhibitedSecretKey(key)) {
      throw createError(
        400,
        `Sensitive secrets, credentials, or authentication tokens cannot be managed through application settings. Configure them via environment variables (.env) or a secret manager.`,
        'PROHIBITED_SECRET_SETTING'
      );
    }

    // 2. Validate typed operational settings against specific boundary schemas
    let validatedValue = value;
    if (key === 'concurrency_limit') {
      const parsed = concurrencyLimitSettingSchema.safeParse(value);
      if (!parsed.success) {
        throw createError(
          400,
          `Invalid concurrency limits: ${parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          'INVALID_SETTING_VALUE'
        );
      }
      validatedValue = parsed.data;
    } else if (key === 'retry_backoff_policy') {
      const parsed = retryBackoffSettingSchema.safeParse(value);
      if (!parsed.success) {
        throw createError(
          400,
          `Invalid retry & backoff policy: ${parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          'INVALID_SETTING_VALUE'
        );
      }
      validatedValue = parsed.data;
    } else if (key === 'node_timeout_limits') {
      const parsed = nodeTimeoutSettingSchema.safeParse(value);
      if (!parsed.success) {
        throw createError(
          400,
          `Invalid node timeout limits: ${parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          'INVALID_SETTING_VALUE'
        );
      }
      validatedValue = parsed.data;
    } else if (key === 'history_retention') {
      const parsed = historyRetentionSettingSchema.safeParse(value);
      if (!parsed.success) {
        throw createError(
          400,
          `Invalid history retention settings: ${parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          'INVALID_SETTING_VALUE'
        );
      }
      validatedValue = parsed.data;
    } else if (key === 'ui_preferences') {
      const parsed = uiPreferenceSettingSchema.safeParse(value);
      if (!parsed.success) {
        throw createError(
          400,
          `Invalid UI preferences: ${parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ')}`,
          'INVALID_SETTING_VALUE'
        );
      }
      validatedValue = parsed.data;
    }

    const updated = await settingRepository.set(key, validatedValue, category, description);

    await auditRepository.log({
      action: 'SETTING_UPDATED',
      entityType: 'SETTING',
      entityId: key,
      details: { category: updated.category, value: validatedValue, requiresRestart: updated.requiresRestart },
    });

    return updated;
  }

  async batchUpdate(settings: Record<string, any>): Promise<ApplicationSettingDefinition[]> {
    const results: ApplicationSettingDefinition[] = [];
    for (const [key, value] of Object.entries(settings)) {
      const updated = await this.set(key, value);
      results.push(updated);
    }
    return results;
  }

  async getSystemInfo(): Promise<SystemInfo> {
    return settingRepository.getSystemInfo();
  }

  async resetDemoData(confirmation: string): Promise<DemoResetResult> {
    // 1. Safeguard: explicit confirmation string
    if (confirmation !== 'RESET_DEMO_DATA') {
      throw createError(
        400,
        `Explicit confirmation string 'RESET_DEMO_DATA' is required to reset demo records.`,
        'CONFIRMATION_REQUIRED'
      );
    }

    // 2. Safeguard: environment restriction
    if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_RESET !== 'true') {
      throw createError(
        403,
        `Demo data reset operations are strictly disabled in production environments.`,
        'DEMO_RESET_FORBIDDEN'
      );
    }

    const result = await settingRepository.resetDemoData();

    await auditRepository.log({
      action: 'DEMO_DATA_RESET',
      entityType: 'SYSTEM',
      entityId: 'factory_defaults',
      details: { stats: result.stats },
    });

    return result;
  }
}

export const settingService = new SettingService();
