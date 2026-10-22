import { Router, Request, Response } from 'express';
import { store } from '../services/store.service.js';
import { BackendExecutionEngine } from '../engine/dag.engine.js';
import { WorkflowTrigger } from '../models/trigger.types.js';

export const triggerRouter = Router();

// List triggers
triggerRouter.get('/', async (req: Request, res: Response) => {
  const triggers = await store.listTriggers();
  res.json({ triggers });
});

// Create trigger
triggerRouter.post('/', async (req: Request, res: Response) => {
  const { name, workflowId, kind, cronExpression, webhookPath } = req.body;
  const workflow = await store.getWorkflow(workflowId);

  const newTrigger: WorkflowTrigger = {
    id: `trig_${Date.now()}`,
    workflowId,
    workflowName: workflow ? workflow.name : 'Unknown Workflow',
    name: name || 'Custom Trigger',
    kind: kind || 'webhook',
    enabled: true,
    cronExpression,
    webhookPath: webhookPath || `/api/v1/webhooks/${Date.now()}`,
    webhookSecret: `whsec_${Math.random().toString(36).substring(2, 10)}`,
    lastTriggeredAt: null,
    totalTriggers: 0,
    createdAt: new Date().toISOString(),
    isBackendConnected: true,
  };

  await store.saveTrigger(newTrigger);
  res.status(201).json({ trigger: newTrigger });
});

// Genuine Live Inbound Webhook Ingress Receiver!
export const webhookIngressRouter = Router();

webhookIngressRouter.post('/:path(*)', async (req: Request, res: Response) => {
  const incomingPath = Array.isArray(req.params.path) ? req.params.path.join('/') : String(req.params.path || '');
  const trigger = await store.getTriggerByPath(incomingPath);

  if (!trigger) {
    res.status(404).json({
      error: 'No active trigger found matching this webhook endpoint',
      requestedPath: incomingPath,
    });
    return;
  }

  if (!trigger.enabled) {
    res.status(403).json({ error: 'Trigger is disabled' });
    return;
  }

  const workflow = await store.getWorkflow(trigger.workflowId);
  if (!workflow) {
    res.status(400).json({ error: 'Associated workflow not found' });
    return;
  }

  // Execute workflow in background or synchronously return execution result
  try {
    const payload = req.body || {};
    const execution = await BackendExecutionEngine.execute(workflow, {
      initialInput: payload,
      triggerType: `webhook:${incomingPath}`,
    });

    await store.saveExecution(execution);

    // Update trigger metrics
    trigger.totalTriggers += 1;
    trigger.lastTriggeredAt = new Date().toISOString();
    await store.saveTrigger(trigger);

    res.json({
      success: true,
      message: `Workflow "${workflow.name}" triggered successfully`,
      executionId: execution.id,
      status: execution.status,
      durationMs: execution.durationMs,
    });
  } catch (err: any) {
    res.status(500).json({ error: `Execution failed: ${err.message}` });
  }
});
