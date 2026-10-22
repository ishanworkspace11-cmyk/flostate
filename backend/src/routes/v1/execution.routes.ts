import { Router } from 'express';
import { ExecutionController } from '../../controllers/execution.controller.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import {
  runWorkflowSchema,
  idParamSchema,
  runsQuerySchema,
  nodeExecutionParamSchema,
  nodeExecutionLogsQuerySchema,
} from '../../validation/schemas.js';

const router = Router();

router.get('/', validateRequest({ query: runsQuerySchema }), ExecutionController.list);
router.get('/:id/events', validateRequest({ params: idParamSchema }), ExecutionController.getRunEvents);
router.get('/:id/nodes/:nodeExecutionId', validateRequest({ params: nodeExecutionParamSchema, query: nodeExecutionLogsQuerySchema }), ExecutionController.getNodeExecutionById);
router.get('/:id/nodes', validateRequest({ params: idParamSchema }), ExecutionController.getNodeExecutions);
router.get('/:id', validateRequest({ params: idParamSchema }), ExecutionController.getById);
router.post('/:id/retry', validateRequest({ params: idParamSchema }), ExecutionController.retryRun);
router.post('/workflows/:workflowId/run', validateRequest({ body: runWorkflowSchema }), ExecutionController.trigger);
router.post('/workflows/:workflowId/runs', validateRequest({ body: runWorkflowSchema }), ExecutionController.createRun);

export { router as executionRouter };
