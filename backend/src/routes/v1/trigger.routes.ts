import { Router } from 'express';
import { TriggerController } from '../../controllers/trigger.controller.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import { createTriggerSchema } from '../../validation/schemas.js';

const router = Router();

router.get('/', TriggerController.list);
router.post('/', validateRequest({ body: createTriggerSchema }), TriggerController.create);

const webhookIngressRouter = Router();
webhookIngressRouter.post('/*', TriggerController.handleIngress);

export { router as triggerRouter, webhookIngressRouter };
