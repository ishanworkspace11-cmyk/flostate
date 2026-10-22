import { Router } from 'express';
import { ExecutionController } from '../../controllers/execution.controller.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import { runWorkflowSchema, idParamSchema } from '../../validation/schemas.js';

const router = Router();

router.get('/', ExecutionController.list);
router.get('/:id', validateRequest({ params: idParamSchema }), ExecutionController.getById);
router.get('/:id/nodes', validateRequest({ params: idParamSchema }), ExecutionController.getNodeExecutions);
router.post('/:id/retry', validateRequest({ params: idParamSchema }), ExecutionController.retryRun);
router.post('/workflows/:workflowId/run', validateRequest({ body: runWorkflowSchema }), ExecutionController.trigger);
router.post('/workflows/:workflowId/runs', validateRequest({ body: runWorkflowSchema }), ExecutionController.createRun);

export { router as executionRouter };
