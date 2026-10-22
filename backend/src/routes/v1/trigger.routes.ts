import { Router } from 'express';
import { TriggerController } from '../../controllers/trigger.controller.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import {
  createTriggerSchema,
  updateTriggerSchema,
  triggerIdParamSchema,
} from '../../validation/schemas.js';

const router = Router();

router.get('/', TriggerController.list);
router.post('/', validateRequest({ body: createTriggerSchema }), TriggerController.create);
router.get('/:id/deliveries', validateRequest({ params: triggerIdParamSchema }), TriggerController.getDeliveries);
router.post('/:id/enable', validateRequest({ params: triggerIdParamSchema }), TriggerController.enable);
router.post('/:id/disable', validateRequest({ params: triggerIdParamSchema }), TriggerController.disable);
router.get('/:id', validateRequest({ params: triggerIdParamSchema }), TriggerController.getById);
router.patch('/:id', validateRequest({ params: triggerIdParamSchema, body: updateTriggerSchema }), TriggerController.update);
router.delete('/:id', validateRequest({ params: triggerIdParamSchema }), TriggerController.delete);
router.all('/webhook/*', TriggerController.handleIngress);

const webhookIngressRouter = Router();
webhookIngressRouter.all('/*', TriggerController.handleIngress);

export { router as triggerRouter, webhookIngressRouter };
