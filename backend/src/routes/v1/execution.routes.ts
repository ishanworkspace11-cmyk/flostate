import { Router } from 'express';
import { ExecutionController } from '../../controllers/execution.controller.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import { runWorkflowSchema, idParamSchema } from '../../validation/schemas.js';

const router = Router();

router.get('/', ExecutionController.list);
router.get('/:id', validateRequest({ params: idParamSchema }), ExecutionController.getById);
router.post('/workflows/:workflowId/run', validateRequest({ body: runWorkflowSchema }), ExecutionController.trigger);

export { router as executionRouter };
