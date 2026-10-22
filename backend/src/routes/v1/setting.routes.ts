import { Router } from 'express';
import { SettingController } from '../../controllers/setting.controller.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import { applicationSettingSchema } from '../../validation/schemas.js';

const router = Router();

router.get('/', SettingController.list);
router.get('/:key', SettingController.getByKey);
router.put('/:key', validateRequest({ body: applicationSettingSchema.partial() }), SettingController.set);

export { router as settingRouter };
