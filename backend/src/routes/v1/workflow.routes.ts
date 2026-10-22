import { Router } from 'express';
import { WorkflowController } from '../../controllers/workflow.controller.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import {
  createWorkflowSchema,
  updateWorkflowSchema,
  duplicateWorkflowSchema,
  paginationQuerySchema,
  idParamSchema,
} from '../../validation/schemas.js';

const router = Router();

// List & Create
router.get('/', validateRequest({ query: paginationQuerySchema }), WorkflowController.list);
router.post('/', validateRequest({ body: createWorkflowSchema }), WorkflowController.create);

// Validate arbitrary graph payload (unpersisted)
router.post('/validate', WorkflowController.validate);

// Operations on specific workflow (:workflowId / :id)
router.get('/:workflowId', validateRequest({ params: idParamSchema }), WorkflowController.getById);
router.patch('/:workflowId', validateRequest({ params: idParamSchema, body: updateWorkflowSchema }), WorkflowController.update);
router.put('/:workflowId', validateRequest({ params: idParamSchema, body: updateWorkflowSchema }), WorkflowController.update);
router.delete('/:workflowId', validateRequest({ params: idParamSchema }), WorkflowController.delete);

router.post('/:workflowId/duplicate', validateRequest({ params: idParamSchema, body: duplicateWorkflowSchema }), WorkflowController.duplicate);
router.post('/:workflowId/publish', validateRequest({ params: idParamSchema }), WorkflowController.publish);
router.post('/:workflowId/activate', validateRequest({ params: idParamSchema }), WorkflowController.activate);
router.post('/:workflowId/pause', validateRequest({ params: idParamSchema }), WorkflowController.pause);
router.post('/:workflowId/validate', validateRequest({ params: idParamSchema }), WorkflowController.validate);

export { router as workflowRouter };
