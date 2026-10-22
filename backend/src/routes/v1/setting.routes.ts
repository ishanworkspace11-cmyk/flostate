import { Router } from 'express';
import { SettingController } from '../../controllers/setting.controller.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import {
  updateSettingBodySchema,
  batchUpdateSettingsBodySchema,
  demoResetSchema,
} from '../../validation/schemas.js';

const router = Router();

// System specs, single-workspace status, and storage statistics
router.get('/system-info', SettingController.systemInfo);

// Batch updates
router.post('/batch', validateRequest({ body: batchUpdateSettingsBodySchema }), SettingController.batch);

// Demo data reset with explicit safety confirmation & environment checks
router.post('/demo/reset', validateRequest({ body: demoResetSchema }), SettingController.resetDemo);
router.post('/reset-demo-data', validateRequest({ body: demoResetSchema }), SettingController.resetDemo);

// General list & key-based endpoints
router.get('/', SettingController.list);
router.get('/:key', SettingController.getByKey);
router.put('/:key', validateRequest({ body: updateSettingBodySchema }), SettingController.set);
router.patch('/:key', validateRequest({ body: updateSettingBodySchema }), SettingController.set);

export { router as settingRouter };
