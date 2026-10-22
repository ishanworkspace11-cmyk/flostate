import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import { logger, httpLogger } from './config/logger.js';
import { apiRateLimiter } from './middleware/rate-limit.middleware.js';
import { errorHandlerMiddleware, notFoundMiddleware } from './middleware/error.middleware.js';
import { apiV1Router } from './routes/v1/index.js';
import { webhookIngressRouter } from './routes/v1/trigger.routes.js';
import { triggerService } from './services/trigger.service.js';

const app = express();

// Security Headers
app.use(
  helmet({
    contentSecurityPolicy: false, // Keep flexible for API
    crossOriginEmbedderPolicy: false,
  })
);

// CORS Configuration
const allowedOrigins = [env.FRONTEND_ORIGIN, 'http://localhost:5173', 'http://127.0.0.1:5173'];
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (like mobile apps, curl, Postman)
      if (!origin || allowedOrigins.includes(origin) || env.NODE_ENV === 'development') {
        callback(null, true);
      } else {
        callback(new Error(`Origin ${origin} not allowed by CORS`));
      }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Webhook-Secret',
      'X-Dormammu-Signature',
      'X-Hub-Signature-256',
      'X-Webhook-Signature',
      'Idempotency-Key',
      'X-Idempotency-Key',
      'X-Request-Id',
      'X-Requested-With',
      'x-worker-secret',
      'x-internal-secret',
    ],
  })
);

// Body Parsers & Logger
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

if (env.NODE_ENV !== 'test') {
  app.use(httpLogger);
}

// Global Rate Limiting for API routes
app.use('/api/', apiRateLimiter);

// Versioned API v1
app.use('/api/v1', apiV1Router);

// Webhook Ingress (supports both /api/v1/webhooks/* and /api/webhooks/*)
app.use('/api/webhooks', webhookIngressRouter);

// Backward Compatibility Aliases for Unversioned /api/*
app.use('/api', apiV1Router);

// 404 & Centralized Error Handlers
app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

export { app };

if (env.NODE_ENV !== 'test') {
  const server = app.listen(env.PORT, () => {
    logger.info(`[Dormammu Engine] Backend server running on http://localhost:${env.PORT}`);
    logger.info(`[Dormammu Engine] API v1 ready at http://localhost:${env.PORT}/api/v1`);
    logger.info(`[Dormammu Engine] Health: http://localhost:${env.PORT}/api/v1/health`);
    logger.info(`[Dormammu Engine] Readiness: http://localhost:${env.PORT}/api/v1/ready`);

    // Synchronize scheduled cron triggers
    triggerService.initScheduler().catch((err) => {
      logger.error({ err }, '[Dormammu Engine] Error initializing cron scheduler');
    });
  });

  const handleShutdown = (signal: string) => {
    logger.info(`Received ${signal}. Gracefully shutting down Dormammu Backend...`);
    server.close(() => {
      logger.info('HTTP server closed.');
      process.exit(0);
    });
  };

  process.on('SIGTERM', () => handleShutdown('SIGTERM'));
  process.on('SIGINT', () => handleShutdown('SIGINT'));
}
