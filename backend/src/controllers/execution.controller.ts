import { Request, Response, NextFunction } from 'express';
import { executionService } from '../services/execution.service.js';
import { executionEventBus, ExecutionEventPayload } from '../engine/execution-events.js';

export class ExecutionController {
  public static async list(req: Request, res: Response, next: NextFunction) {
    try {
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 20;
      const workflowId = req.query.workflowId ? String(req.query.workflowId) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const triggerType = req.query.triggerType ? String(req.query.triggerType) : undefined;
      const startDate = req.query.startDate ? String(req.query.startDate) : undefined;
      const endDate = req.query.endDate ? String(req.query.endDate) : undefined;
      const search = req.query.search ? String(req.query.search) : undefined;
      const sortBy = (req.query.sortBy as any) || 'startedAt';
      const sortOrder = (req.query.sortOrder as any) || 'desc';

      const { executions, total } = await executionService.listExecutions({
        page,
        limit,
        workflowId,
        status,
        triggerType,
        startDate,
        endDate,
        search,
        sortBy,
        sortOrder,
      });

      res.status(200).json({
        success: true,
        data: executions,
        meta: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit) || 1,
        },
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getById(req: Request, res: Response, next: NextFunction) {
    try {
      const runId = String(req.params.runId || req.params.id);
      const execution = await executionService.getExecution(runId);
      res.status(200).json({
        success: true,
        data: execution,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getNodeExecutions(req: Request, res: Response, next: NextFunction) {
    try {
      const runId = String(req.params.runId || req.params.id);
      const nodes = await executionService.getNodeExecutions(runId);
      res.status(200).json({
        success: true,
        data: nodes,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getNodeExecutionById(req: Request, res: Response, next: NextFunction) {
    try {
      const runId = String(req.params.runId || req.params.id);
      const nodeExecutionId = String(req.params.nodeExecutionId);
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 100;
      const offset = req.query.offset ? parseInt(String(req.query.offset), 10) : 0;
      const level = req.query.level ? String(req.query.level) : undefined;

      const node = await executionService.getNodeExecution(runId, nodeExecutionId, {
        limit,
        offset,
        level,
      });

      res.status(200).json({
        success: true,
        data: node,
      });
    } catch (err) {
      next(err);
    }
  }

  public static async getRunEvents(req: Request, res: Response, next: NextFunction) {
    try {
      const runId = String(req.params.runId || req.params.id);
      const initialRun = await executionService.getExecution(runId);

      // Enforce connection limits per run
      const allowed = executionEventBus.trackConnection(runId);
      if (!allowed) {
        res.status(429).json({
          success: false,
          error: {
            code: 'TOO_MANY_CONNECTIONS',
            message: `Too many active SSE connections for run ${runId}. Please reconnect shortly.`,
          },
        });
        return;
      }

      // Configure SSE response headers
      res.setHeader('Content-Type', 'text/event-stream');
      res.setHeader('Cache-Control', 'no-cache, no-transform');
      res.setHeader('Connection', 'keep-alive');
      res.setHeader('X-Accel-Buffering', 'no');
      res.flushHeaders?.();

      const sendSse = (evt: ExecutionEventPayload) => {
        res.write(`id: ${evt.id}\n`);
        res.write(`event: ${evt.event}\n`);
        res.write(`data: ${JSON.stringify(evt.data)}\n\n`);
      };

      // Send initial run state event
      sendSse({
        id: `evt_init_${Date.now()}`,
        runId,
        event: 'run_state',
        timestamp: new Date().toISOString(),
        data: initialRun,
      });

      // Reconnection & recovery: replay missed events after Last-Event-ID if requested
      const lastEventId = (req.headers['last-event-id'] as string) || (req.query.lastEventId as string);
      if (lastEventId) {
        const missedEvents = executionEventBus.getEventsAfter(runId, lastEventId);
        for (const missed of missedEvents) {
          sendSse(missed);
        }
      }

      // If execution has already reached a terminal state, finish stream cleanly
      if (['Succeeded', 'Failed', 'Cancelled', 'Skipped'].includes(initialRun.status)) {
        sendSse({
          id: `evt_close_${Date.now()}`,
          runId,
          event: 'close',
          timestamp: new Date().toISOString(),
          data: {
            status: initialRun.status,
            durationMs: initialRun.durationMs,
            completedAt: initialRun.completedAt,
            message: `Execution ${runId} has finished with status ${initialRun.status}`,
          },
        });
        executionEventBus.releaseConnection(runId);
        res.end();
        return;
      }

      // Subscribe to real-time events on the bus
      const onEvent = (evt: ExecutionEventPayload) => {
        try {
          sendSse(evt);
          if (evt.event === 'close') {
            executionEventBus.releaseConnection(runId);
            res.end();
          }
        } catch (_writeErr) {
          executionEventBus.releaseConnection(runId);
          executionEventBus.off(`run:${runId}`, onEvent);
        }
      };

      executionEventBus.on(`run:${runId}`, onEvent);

      // Heartbeat comment every 15s to keep intermediate reverse proxies alive
      const keepAliveTimer = setInterval(() => {
        try {
          res.write(': keepalive\n\n');
        } catch {
          clearInterval(keepAliveTimer);
        }
      }, 15000);

      // Clean up when client closes connection
      req.on('close', () => {
        clearInterval(keepAliveTimer);
        executionEventBus.releaseConnection(runId);
        executionEventBus.off(`run:${runId}`, onEvent);
      });
    } catch (err) {
      next(err);
    }
  }

  public static async createRun(req: Request, res: Response, next: NextFunction) {
    try {
      const workflowId = String(req.params.workflowId || req.params.id);
      const { input, triggerType } = req.body;
      const execution = await executionService.createDurableRun(workflowId, {
        input,
        triggerType,
      });

      res.status(201).json({
        success: true,
        data: execution,
        message: 'Workflow run queued for execution',
      });
    } catch (err) {
      next(err);
    }
  }

  public static async retryRun(req: Request, res: Response, next: NextFunction) {
    try {
      const runId = String(req.params.runId || req.params.id);
      const execution = await executionService.retryExecution(runId);
      res.status(200).json({
        success: true,
        data: execution,
        message: 'Workflow run retry initiated',
      });
    } catch (err) {
      next(err);
    }
  }

  public static async trigger(req: Request, res: Response, next: NextFunction) {
    try {
      const workflowId = String(req.params.workflowId || req.params.id);
      const { input, triggerType } = req.body;
      const execution = await executionService.triggerExecution(workflowId, {
        input,
        triggerType,
      });

      res.status(201).json({
        success: true,
        data: execution,
      });
    } catch (err) {
      next(err);
    }
  }
}
