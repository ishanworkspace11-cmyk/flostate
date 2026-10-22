import { Router } from 'express';
import { WorkerController } from '../../controllers/worker.controller.js';
import { validateRequest } from '../../middleware/validation.middleware.js';
import { verifyWorkerAuth } from '../../middleware/worker-auth.middleware.js';
import {
  workerIdParamSchema,
  workerListQuerySchema,
  workerEventsQuerySchema,
  workerHeartbeatSchema,
} from '../../validation/schemas.js';

const router = Router();

// System execution health across all workers and queues
router.get('/health', WorkerController.health);

// Queue metrics and telemetry
router.get('/queues', WorkerController.queues);
router.get('/queue-metrics', WorkerController.queueMetrics);
router.get('/metrics', WorkerController.queueMetrics);

// Worker cluster events
router.get('/events', validateRequest({ query: workerEventsQuerySchema }), WorkerController.events);

// Authenticated internal worker heartbeat and registration
router.post('/heartbeat', verifyWorkerAuth, validateRequest({ body: workerHeartbeatSchema }), WorkerController.heartbeat);
router.post(
  '/:id/heartbeat',
  verifyWorkerAuth,
  validateRequest({ params: workerIdParamSchema, body: workerHeartbeatSchema }),
  WorkerController.heartbeat
);

// Worker list & worker details
router.get('/', validateRequest({ query: workerListQuerySchema }), WorkerController.list);
router.get('/:id', validateRequest({ params: workerIdParamSchema }), WorkerController.getById);
router.get('/:id/events', validateRequest({ params: workerIdParamSchema }), WorkerController.workerEvents);

export { router as workerRouter };
