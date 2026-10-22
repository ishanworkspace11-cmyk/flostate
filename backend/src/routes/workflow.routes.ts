import { Router, Request, Response } from 'express';
import { store } from '../services/store.service.js';
import { BackendExecutionEngine } from '../engine/dag.engine.js';
import { validateWorkflow } from '../engine/dag.validation.js';

export const workflowRouter = Router();

workflowRouter.get('/', async (req: Request, res: Response) => {
  const list = await store.listWorkflows();
  res.json({ workflows: list });
});

workflowRouter.get('/:id', async (req: Request, res: Response) => {
  const workflow = await store.getWorkflow(String(req.params.id));
  if (!workflow) {
    res.status(404).json({ error: 'Workflow not found' });
    return;
  }
  res.json({ workflow });
});

workflowRouter.post('/', async (req: Request, res: Response) => {
  const created = await store.createWorkflow(req.body);
  res.status(201).json({ workflow: created });
});

workflowRouter.put('/:id', async (req: Request, res: Response) => {
  try {
    const updated = await store.updateWorkflow(String(req.params.id), req.body);
    res.json({ workflow: updated });
  } catch (err: any) {
    res.status(404).json({ error: err.message });
  }
});

workflowRouter.delete('/:id', async (req: Request, res: Response) => {
  const deleted = await store.deleteWorkflow(String(req.params.id));
  res.json({ success: deleted });
});

workflowRouter.post('/:id/validate', async (req: Request, res: Response) => {
  const workflow = await store.getWorkflow(String(req.params.id));
  if (!workflow) {
    res.status(404).json({ error: 'Workflow not found' });
    return;
  }
  const result = validateWorkflow(workflow);
  res.json({ validation: result });
});

// Run workflow endpoint on backend engine!
workflowRouter.post('/:id/run', async (req: Request, res: Response) => {
  const workflow = await store.getWorkflow(String(req.params.id));
  if (!workflow) {
    res.status(404).json({ error: 'Workflow not found' });
    return;
  }

  const { initialInput, triggerType } = req.body;

  try {
    const execution = await BackendExecutionEngine.execute(workflow, {
      initialInput: initialInput || {},
      triggerType: triggerType || 'api_manual',
    });

    await store.saveExecution(execution);
    res.json({ execution });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
