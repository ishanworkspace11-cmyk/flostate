import { Execution } from './execution.types';
import { safeJsonParse, safeJsonStringify } from '../../lib/utils';
import { WorkflowService } from '../workflows/workflow.service';
import { ExecutionEngine, ExecutionOptions } from './execution.engine';

const EXECUTIONS_STORAGE_KEY = 'dormammu_executions_v1';

export const SEED_EXECUTIONS: Execution[] = [
  {
    id: 'run-91823',
    workflowId: 'wf-customer-onboarding',
    workflowName: 'Customer Onboarding & Enrichment',
    workflowVersion: 3,
    triggerType: 'webhook',
    status: 'Succeeded',
    input: {
      userId: 'usr_84920',
      name: 'Sarah Connor',
      email: 's.connor@cyberdyne.io',
      company: 'Cyberdyne Systems',
      plan: 'Enterprise',
    },
    output: {
      deliveryId: 'dlv_9124_ack',
      endpoint: 'https://hooks.slack.com/services/T00/B00/enterprise-leads',
      status: 'delivered',
      statusCode: 200,
      isSimulated: true,
    },
    startedAt: '2026-10-22T08:14:02.000Z',
    completedAt: '2026-10-22T08:14:04.120Z',
    durationMs: 2120,
    nodeExecutions: {
      'node-trig-signup': {
        id: 'node_run_1',
        executionId: 'run-91823',
        nodeId: 'node-trig-signup',
        nodeLabel: 'Signup Webhook',
        nodeType: 'trigger',
        status: 'Succeeded',
        attempt: 1,
        input: { userId: 'usr_84920' },
        output: { source: 'trigger', timestamp: '2026-10-22T08:14:02.010Z' },
        startedAt: '2026-10-22T08:14:02.010Z',
        completedAt: '2026-10-22T08:14:02.050Z',
        durationMs: 40,
        logs: [
          { timestamp: '2026-10-22T08:14:02.010Z', level: 'info', message: 'Trigger activated [webhook]' },
        ],
      },
      'node-enrich-company': {
        id: 'node_run_2',
        executionId: 'run-91823',
        nodeId: 'node-enrich-company',
        nodeLabel: 'Enrich via Clearbit API',
        nodeType: 'httpRequest',
        status: 'Succeeded',
        attempt: 1,
        input: { domain: 'cyberdyne.io' },
        output: { status: 200, data: { company: 'Cyberdyne Systems', employees: 2500, tier: 'Strategic Enterprise' } },
        startedAt: '2026-10-22T08:14:02.060Z',
        completedAt: '2026-10-22T08:14:02.860Z',
        durationMs: 800,
        logs: [
          { timestamp: '2026-10-22T08:14:02.060Z', level: 'info', message: 'Dispatching GET request to Clearbit API' },
          { timestamp: '2026-10-22T08:14:02.860Z', level: 'info', message: 'HTTP Response: 200 OK' },
        ],
      },
      'node-format-slack': {
        id: 'node_run_3',
        executionId: 'run-91823',
        nodeId: 'node-format-slack',
        nodeLabel: 'Format Slack Message',
        nodeType: 'transform',
        status: 'Succeeded',
        attempt: 1,
        input: { tier: 'Strategic Enterprise' },
        output: { slackMessage: '🚀 New Strategic Enterprise signup: Sarah Connor from Cyberdyne Systems!' },
        startedAt: '2026-10-22T08:14:02.870Z',
        completedAt: '2026-10-22T08:14:02.890Z',
        durationMs: 20,
        logs: [
          { timestamp: '2026-10-22T08:14:02.870Z', level: 'info', message: 'Executing transform operation: "string_template"' },
        ],
      },
      'node-delay-throttle': {
        id: 'node_run_4',
        executionId: 'run-91823',
        nodeId: 'node-delay-throttle',
        nodeLabel: 'Rate Limit Pacing',
        nodeType: 'delay',
        status: 'Succeeded',
        attempt: 1,
        input: null,
        output: { delayedMs: 800 },
        startedAt: '2026-10-22T08:14:02.900Z',
        completedAt: '2026-10-22T08:14:03.700Z',
        durationMs: 800,
        logs: [
          { timestamp: '2026-10-22T08:14:02.900Z', level: 'info', message: 'Pausing workflow execution for 800ms' },
          { timestamp: '2026-10-22T08:14:03.700Z', level: 'info', message: 'Delay elapsed.' },
        ],
      },
      'node-notify-slack': {
        id: 'node_run_5',
        executionId: 'run-91823',
        nodeId: 'node-notify-slack',
        nodeLabel: 'Post to #enterprise-leads',
        nodeType: 'webhookAction',
        status: 'Succeeded',
        attempt: 1,
        input: null,
        output: { deliveryId: 'dlv_9124_ack', status: 'delivered', statusCode: 200 },
        startedAt: '2026-10-22T08:14:03.710Z',
        completedAt: '2026-10-22T08:14:04.120Z',
        durationMs: 410,
        logs: [
          { timestamp: '2026-10-22T08:14:03.710Z', level: 'info', message: 'Dispatching outbound webhook payload' },
          { timestamp: '2026-10-22T08:14:04.120Z', level: 'info', message: 'Payload delivered successfully (200 OK)' },
        ],
      },
    },
  },
  {
    id: 'run-88201',
    workflowId: 'wf-incident-auto-triage',
    workflowName: 'Production Incident Auto-Triage',
    workflowVersion: 2,
    triggerType: 'webhook',
    status: 'Failed',
    input: { incidentId: 'INC-9901', severity: 'critical' },
    output: null,
    startedAt: '2026-10-22T07:10:00.000Z',
    completedAt: '2026-10-22T07:10:02.150Z',
    durationMs: 2150,
    error: 'One or more workflow nodes encountered execution failures.',
    nodeExecutions: {
      'inc-trigger': {
        id: 'nrun_inc_1',
        executionId: 'run-88201',
        nodeId: 'inc-trigger',
        nodeLabel: 'PagerDuty Alert',
        nodeType: 'trigger',
        status: 'Succeeded',
        attempt: 1,
        input: { incidentId: 'INC-9901' },
        output: { triggeredAt: '2026-10-22T07:10:00.000Z' },
        startedAt: '2026-10-22T07:10:00.000Z',
        completedAt: '2026-10-22T07:10:00.020Z',
        durationMs: 20,
        logs: [{ timestamp: '2026-10-22T07:10:00.000Z', level: 'info', message: 'Trigger activated [webhook]' }],
      },
      'inc-query-metrics': {
        id: 'nrun_inc_2',
        executionId: 'run-88201',
        nodeId: 'inc-query-metrics',
        nodeLabel: 'Query Prometheus Error Rate',
        nodeType: 'httpRequest',
        status: 'Failed',
        attempt: 1,
        input: null,
        output: null,
        error: 'HTTP 503: Service Unavailable on Prometheus internal gateway',
        startedAt: '2026-10-22T07:10:00.030Z',
        completedAt: '2026-10-22T07:10:02.150Z',
        durationMs: 2120,
        logs: [
          { timestamp: '2026-10-22T07:10:00.030Z', level: 'info', message: 'Dispatching GET request to Prometheus API' },
          { timestamp: '2026-10-22T07:10:02.150Z', level: 'error', message: 'Gateway timeout / 503 Service Unavailable' },
        ],
      },
      'inc-extract-pod': {
        id: 'nrun_inc_3',
        executionId: 'run-88201',
        nodeId: 'inc-extract-pod',
        nodeLabel: 'Extract Offending Pod',
        nodeType: 'transform',
        status: 'Skipped',
        attempt: 0,
        input: null,
        output: null,
        error: 'Skipped because upstream dependency "Query Prometheus Error Rate" failed.',
        startedAt: null,
        completedAt: null,
        durationMs: 0,
        logs: [
          { timestamp: '2026-10-22T07:10:02.150Z', level: 'warn', message: 'Skipped because upstream dependency failed.' },
        ],
      },
      'inc-opsgenie-escalate': {
        id: 'nrun_inc_4',
        executionId: 'run-88201',
        nodeId: 'inc-opsgenie-escalate',
        nodeLabel: 'Trigger SRE Escalation',
        nodeType: 'webhookAction',
        status: 'Skipped',
        attempt: 0,
        input: null,
        output: null,
        error: 'Skipped because upstream dependency "Extract Offending Pod" was skipped.',
        startedAt: null,
        completedAt: null,
        durationMs: 0,
        logs: [
          { timestamp: '2026-10-22T07:10:02.150Z', level: 'warn', message: 'Skipped because upstream dependency was skipped.' },
        ],
      },
    },
  },
  {
    id: 'run-77190',
    workflowId: 'wf-daily-etl-digest',
    workflowName: 'Daily Revenue & Volume Digest',
    workflowVersion: 1,
    triggerType: 'cron',
    status: 'Succeeded',
    input: { scheduledDate: '2026-10-22' },
    output: { count: 4, operation: 'sum', result: 1890 },
    startedAt: '2026-10-22T09:00:00.000Z',
    completedAt: '2026-10-22T09:00:00.820Z',
    durationMs: 820,
    nodeExecutions: {
      'cron-trig': {
        id: 'nrun_cron_1',
        executionId: 'run-77190',
        nodeId: 'cron-trig',
        nodeLabel: 'Daily 09:00 AM Cron',
        nodeType: 'trigger',
        status: 'Succeeded',
        attempt: 1,
        input: {},
        output: { scheduledDate: '2026-10-22' },
        startedAt: '2026-10-22T09:00:00.000Z',
        completedAt: '2026-10-22T09:00:00.030Z',
        durationMs: 30,
        logs: [{ timestamp: '2026-10-22T09:00:00.000Z', level: 'info', message: 'Trigger activated [cron]' }],
      },
      'etl-calc-sum': {
        id: 'nrun_cron_2',
        executionId: 'run-77190',
        nodeId: 'etl-calc-sum',
        nodeLabel: 'Calculate Total Revenue',
        nodeType: 'transform',
        status: 'Succeeded',
        attempt: 1,
        input: {},
        output: { operation: 'sum', result: 1890, count: 4 },
        startedAt: '2026-10-22T09:00:00.040Z',
        completedAt: '2026-10-22T09:00:00.080Z',
        durationMs: 40,
        logs: [{ timestamp: '2026-10-22T09:00:00.040Z', level: 'info', message: 'Aggregate calculated total: 1890' }],
      },
      'etl-slack-post': {
        id: 'nrun_cron_3',
        executionId: 'run-77190',
        nodeId: 'etl-slack-post',
        nodeLabel: 'Publish Revenue KPI',
        nodeType: 'webhookAction',
        status: 'Succeeded',
        attempt: 1,
        input: {},
        output: { deliveryId: 'dlv_kpi_88', status: 'delivered', statusCode: 200 },
        startedAt: '2026-10-22T09:00:00.090Z',
        completedAt: '2026-10-22T09:00:00.820Z',
        durationMs: 730,
        logs: [{ timestamp: '2026-10-22T09:00:00.090Z', level: 'info', message: 'KPI webhook dispatched' }],
      },
    },
  },
];

export const ExecutionService = {
  listExecutions(): Execution[] {
    const raw = localStorage.getItem(EXECUTIONS_STORAGE_KEY);
    if (!raw) {
      this.resetDemoExecutions();
      return SEED_EXECUTIONS;
    }
    const parsed = safeJsonParse<Execution[]>(raw, []);
    return parsed.length > 0 ? parsed : SEED_EXECUTIONS;
  },

  getExecution(id: string): Execution | null {
    const list = this.listExecutions();
    return list.find((e) => e.id === id) || null;
  },

  saveExecution(execution: Execution): Execution {
    const list = this.listExecutions();
    const existingIndex = list.findIndex((e) => e.id === execution.id);
    if (existingIndex !== -1) {
      list[existingIndex] = execution;
    } else {
      list.unshift(execution);
    }
    // Limit stored runs to 50
    const trimmed = list.slice(0, 50);
    localStorage.setItem(EXECUTIONS_STORAGE_KEY, safeJsonStringify(trimmed));
    return execution;
  },

  async runWorkflow(
    workflowId: string,
    options: ExecutionOptions = {}
  ): Promise<Execution> {
    const workflow = WorkflowService.getWorkflow(workflowId);
    if (!workflow) {
      throw new Error(`Workflow ${workflowId} not found`);
    }

    const execution = await ExecutionEngine.execute(workflow, options);
    this.saveExecution(execution);
    return execution;
  },

  async retryExecution(
    executionId: string,
    options: ExecutionOptions = {}
  ): Promise<Execution> {
    const original = this.getExecution(executionId);
    if (!original) {
      throw new Error(`Execution ${executionId} not found`);
    }

    const workflow = WorkflowService.getWorkflow(original.workflowId);
    if (!workflow) {
      throw new Error(`Underlying workflow ${original.workflowId} no longer exists`);
    }

    const retryOptions: ExecutionOptions = {
      ...options,
      initialInput: original.input,
      triggerType: `${original.triggerType} (Retry)`,
    };

    const newExecution = await ExecutionEngine.execute(workflow, retryOptions);
    this.saveExecution(newExecution);
    return newExecution;
  },

  resetDemoExecutions(): void {
    localStorage.setItem(EXECUTIONS_STORAGE_KEY, safeJsonStringify(SEED_EXECUTIONS));
  },
};
