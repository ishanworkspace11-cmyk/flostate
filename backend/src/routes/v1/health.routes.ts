import { Router } from 'express';
import { HealthController } from '../../controllers/health.controller.js';

const router = Router();

router.get('/health', HealthController.health);
router.get('/ready', HealthController.ready);

export { router as healthRouter };
