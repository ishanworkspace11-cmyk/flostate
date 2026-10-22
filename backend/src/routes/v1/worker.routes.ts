import { Router } from 'express';
import { WorkerController } from '../../controllers/worker.controller.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import { idParamSchema } from '../../validation/schemas.js';

const router = Router();

router.get('/', WorkerController.list);
router.get('/queues', WorkerController.queues);
router.post('/:id/heartbeat', validateRequest({ params: idParamSchema }), WorkerController.heartbeat);

export { router as workerRouter };
