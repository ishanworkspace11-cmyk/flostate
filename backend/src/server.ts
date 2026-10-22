import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { healthRouter } from './routes/health.routes.js';
import { workflowRouter } from './routes/workflow.routes.js';
import { executionRouter } from './routes/execution.routes.js';
import { triggerRouter, webhookIngressRouter } from './routes/trigger.routes.js';
import { workerRouter } from './routes/worker.routes.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors({ origin: '*' }));
app.use(express.json());

// API Routes
app.use('/api/health', healthRouter);
app.use('/api/workflows', workflowRouter);
app.use('/api/runs', executionRouter);
app.use('/api/triggers', triggerRouter);
app.use('/api/workers', workerRouter);

// Webhook Ingress Receiver (e.g. POST /api/webhooks/user-signup)
app.use('/api/webhooks', webhookIngressRouter);

export { app };

if (process.env.NODE_ENV !== 'test') {
  app.listen(PORT, () => {
    console.log(`[Dormammu Engine] Backend server listening on http://localhost:${PORT}`);
    console.log(`[Dormammu Engine] Webhook ingress receiver ready at http://localhost:${PORT}/api/webhooks/*`);
  });
}
