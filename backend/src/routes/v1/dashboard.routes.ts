import { Router } from 'express';
import { DashboardController } from '../../controllers/dashboard.controller.js';

const router = Router();

router.get('/summary', DashboardController.summary);
router.get('/activity', DashboardController.activity);

export { router as dashboardRouter };
