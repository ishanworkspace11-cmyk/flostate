import { Router, Request, Response } from 'express';
import { store } from '../services/store.service.js';
import { BackendExecutionEngine } from '../engine/dag.engine.js';

export const executionRouter = Router();

executionRouter.get('/', async (req: Request, res: Response) => {
  const { executions } = await store.listExecutions();
  res.json({ executions });
});

executionRouter.get('/:id', async (req: Request, res: Response) => {
  const execution = await store.getExecution(String(req.params.id));
  if (!execution) {
    res.status(404).json({ error: 'Execution not found' });
    return;
  }
  res.json({ execution });
});

executionRouter.post('/:id/retry', async (req: Request, res: Response) => {
  const original = await store.getExecution(String(req.params.id));
  if (!original) {
    res.status(404).json({ error: 'Execution not found' });
    return;
  }

  const workflow = await store.getWorkflow(original.workflowId);
  if (!workflow) {
    res.status(400).json({ error: 'Original workflow no longer exists' });
    return;
  }

  try {
    const newExecution = await BackendExecutionEngine.execute(workflow, {
      initialInput: original.input,
      triggerType: `${original.triggerType} (Backend Retry)`,
    });

    await store.saveExecution(newExecution);
    res.json({ execution: newExecution });
  } catch (err: any) {
    res.status(500).json({ error: err.message });
  }
});
