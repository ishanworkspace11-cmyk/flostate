import { Router } from 'express';
import { healthRouter } from './health.routes.js';
import { dashboardRouter } from './dashboard.routes.js';
import { workflowRouter } from './workflow.routes.js';
import { executionRouter } from './execution.routes.js';
import { triggerRouter, webhookIngressRouter } from './trigger.routes.js';
import { workerRouter } from './worker.routes.js';
import { settingRouter } from './setting.routes.js';

const apiV1Router = Router();

// Single-Workspace MVP Auth Disclaimer Header
apiV1Router.use((_req, res, next) => {
  res.setHeader('X-Dormammu-Workspace', 'default-single-tenant');
  res.setHeader('X-Dormammu-Engine-Version', '1.0.0');
  next();
});

apiV1Router.use('/', healthRouter);
apiV1Router.use('/dashboard', dashboardRouter);
apiV1Router.use('/workflows', workflowRouter);
apiV1Router.use('/runs', executionRouter);
apiV1Router.use('/triggers', triggerRouter);
apiV1Router.use('/workers', workerRouter);
apiV1Router.use('/settings', settingRouter);
apiV1Router.use('/webhooks', webhookIngressRouter);

export { apiV1Router };
