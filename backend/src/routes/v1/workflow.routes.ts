import { Router } from 'express';
import { WorkflowController } from '../../controllers/workflow.controller.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  paginationQuerySchema,
  idParamSchema,
} from '../../validation/schemas.js';

const router = Router();

router.get('/', validateRequest({ query: paginationQuerySchema }), WorkflowController.list);
router.post('/validate', WorkflowController.validate);
router.get('/:id', validateRequest({ params: idParamSchema }), WorkflowController.getById);
router.post('/', validateRequest({ body: createWorkflowSchema }), WorkflowController.create);
router.put('/:id', validateRequest({ params: idParamSchema, body: updateWorkflowSchema }), WorkflowController.update);
router.post('/:id/publish', validateRequest({ params: idParamSchema }), WorkflowController.publish);
router.delete('/:id', validateRequest({ params: idParamSchema }), WorkflowController.delete);

export { router as workflowRouter };
