import { PrismaClient, WorkflowStatus, ExecutionStatus, TriggerKind, WorkerStatus } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Starting Dormammu Engine database seed...');

  // 1. Seed Workflows & WorkflowVersions
  const wfCustomer = await prisma.workflow.upsert({
    where: { id: 'wf-customer-onboarding' },
    update: {
      name: 'Customer Onboarding & Enrichment',
      description: 'Enriches new signups via API, extracts company profile, and notifies customer success team.',
      status: WorkflowStatus.PUBLISHED,
      draftVersion: 3,
      publishedVersion: 3,
    },
    create: {
      id: 'wf-customer-onboarding',
      name: 'Customer Onboarding & Enrichment',
      description: 'Enriches new signups via API, extracts company profile, and notifies customer success team.',
      status: WorkflowStatus.PUBLISHED,
      draftVersion: 3,
      publishedVersion: 3,
    },
  });

  const onboardingNodes = [
    {
      id: 'node-trig-signup',
      type: 'trigger',
      label: 'Signup Webhook',
      position: { x: 80, y: 150 },
      config: {
        triggerType: 'webhook',
        webhookPath: '/webhooks/v1/user-signup',
        defaultPayload: {
          userId: 'usr_84920',
          name: 'Sarah Connor',
          email: 's.connor@cyberdyne.io',
          company: 'Cyberdyne Systems',
          plan: 'Enterprise',
        },
      },
    },
    {
      id: 'node-enrich-company',
      type: 'httpRequest',
      label: 'Enrich via Clearbit API',
      position: { x: 380, y: 150 },
      config: {
        method: 'GET',
        url: 'https://api.clearbit.com/v2/companies/find?domain=cyberdyne.io',
        mockResponse: {
          enabled: true,
          status: 200,
          body: {
            company: 'Cyberdyne Systems',
            employees: 2500,
            industry: 'Robotics & AI',
            tier: 'Strategic Enterprise',
          },
        },
      },
    },
    {
      id: 'node-format-slack',
      type: 'transform',
      label: 'Format Slack Message',
      position: { x: 680, y: 150 },
      config: {
        operation: 'string_template',
        template: '🚀 New {{tier}} signup: {{name}} ({{email}}) from {{company}}!',
        targetField: 'slackMessage',
      },
    },
    {
      id: 'node-notify-slack',
      type: 'webhookAction',
      label: 'Post to #enterprise-leads',
      position: { x: 980, y: 150 },
      config: {
        url: 'https://hooks.slack.com/services/T00/B00/enterprise-leads',
      },
    },
  ];

  const onboardingEdges = [
    { id: 'e-1', source: 'node-trig-signup', target: 'node-enrich-company' },
    { id: 'e-2', source: 'node-enrich-company', target: 'node-format-slack' },
    { id: 'e-3', source: 'node-format-slack', target: 'node-notify-slack' },
  ];

  const wfVersion = await prisma.workflowVersion.upsert({
    where: {
      workflowId_version: {
        workflowId: wfCustomer.id,
        version: 3,
      },
    },
    update: {
      nodes: onboardingNodes,
      edges: onboardingEdges,
      isPublished: true,
      changeSummary: 'Production release v3 with enriched customer profile notification',
    },
    create: {
      workflowId: wfCustomer.id,
      version: 3,
      nodes: onboardingNodes,
      edges: onboardingEdges,
      isPublished: true,
      changeSummary: 'Production release v3 with enriched customer profile notification',
    },
  });

  // 2. Seed Second Workflow: Order Fraud Pipeline
  const wfFraud = await prisma.workflow.upsert({
    where: { id: 'wf-fraud-detection' },
    update: {
      name: 'Order Fraud & Velocity Check',
      description: 'Evaluates transaction risk score, pauses on high value, and approves or flags orders.',
      status: WorkflowStatus.PUBLISHED,
      draftVersion: 1,
      publishedVersion: 1,
    },
    create: {
      id: 'wf-fraud-detection',
      name: 'Order Fraud & Velocity Check',
      description: 'Evaluates transaction risk score, pauses on high value, and approves or flags orders.',
      status: WorkflowStatus.PUBLISHED,
      draftVersion: 1,
      publishedVersion: 1,
    },
  });

  const fraudNodes = [
    {
      id: 'node-trig-order',
      type: 'trigger',
      label: 'Order Placed Webhook',
      position: { x: 80, y: 150 },
      config: {
        triggerType: 'webhook',
        webhookPath: '/webhooks/v1/order-placed',
        defaultPayload: { orderId: 'ord_9901', amount: 4500, currency: 'USD', ip: '198.51.100.42' },
      },
    },
    {
      id: 'node-fraud-score',
      type: 'httpRequest',
      label: 'Check Sift Science Score',
      position: { x: 380, y: 150 },
      config: {
        method: 'POST',
        url: 'https://api.sift.com/v205/score',
        mockResponse: {
          enabled: true,
          status: 200,
          body: { riskScore: 0.12, decision: 'ACCEPT', reasons: ['IP clean', 'Card match'] },
        },
      },
    },
    {
      id: 'node-delay-fulfillment',
      type: 'delay',
      label: 'Verification Delay (2s)',
      position: { x: 680, y: 150 },
      config: { durationMs: 2000, description: 'Hold 2 seconds for payment settlement' },
    },
    {
      id: 'node-fulfill-order',
      type: 'webhookAction',
      label: 'Trigger Warehouse Fulfillment',
      position: { x: 980, y: 150 },
      config: { url: 'https://warehouse.dormammu.internal/orders/fulfill' },
    },
  ];

  const fraudEdges = [
    { id: 'fe-1', source: 'node-trig-order', target: 'node-fraud-score' },
    { id: 'fe-2', source: 'node-fraud-score', target: 'node-delay-fulfillment' },
    { id: 'fe-3', source: 'node-delay-fulfillment', target: 'node-fulfill-order' },
  ];

  await prisma.workflowVersion.upsert({
    where: {
      workflowId_version: {
        workflowId: wfFraud.id,
        version: 1,
      },
    },
    update: {
      nodes: fraudNodes,
      edges: fraudEdges,
      isPublished: true,
      changeSummary: 'Initial fraud velocity check DAG',
    },
    create: {
      workflowId: wfFraud.id,
      version: 1,
      nodes: fraudNodes,
      edges: fraudEdges,
      isPublished: true,
      changeSummary: 'Initial fraud velocity check DAG',
    },
  });

  // 3. Seed Triggers
  await prisma.trigger.upsert({
    where: { webhookPath: '/api/v1/webhooks/user-signup' },
    update: {
      name: 'Customer Signup Ingestion',
      workflowId: wfCustomer.id,
      kind: TriggerKind.WEBHOOK,
      enabled: true,
      webhookSecret: 'whsec_99a81b7e4f0d2c51',
      totalTriggers: 142,
    },
    create: {
      id: 'trig-customer-signup',
      name: 'Customer Signup Ingestion',
      workflowId: wfCustomer.id,
      kind: TriggerKind.WEBHOOK,
      enabled: true,
      webhookPath: '/api/v1/webhooks/user-signup',
      webhookSecret: 'whsec_99a81b7e4f0d2c51',
      totalTriggers: 142,
    },
  });

  await prisma.trigger.upsert({
    where: { webhookPath: '/api/v1/webhooks/order-placed' },
    update: {
      name: 'E-commerce Checkout Ingress',
      workflowId: wfFraud.id,
      kind: TriggerKind.WEBHOOK,
      enabled: true,
      webhookSecret: 'whsec_order_live_99',
      totalTriggers: 64,
    },
    create: {
      id: 'trig-order-placed',
      name: 'E-commerce Checkout Ingress',
      workflowId: wfFraud.id,
      kind: TriggerKind.WEBHOOK,
      enabled: true,
      webhookPath: '/api/v1/webhooks/order-placed',
      webhookSecret: 'whsec_order_live_99',
      totalTriggers: 64,
    },
  });

  // 4. Seed Worker Instances
  await prisma.workerInstance.upsert({
    where: { id: 'backend-worker-01' },
    update: {
      name: 'Node Worker Alpha (BullMQ)',
      hostname: 'worker-01.us-east.dormammu.internal',
      status: WorkerStatus.BUSY,
      concurrency: 5,
      completedJobsCount: 1240,
      failedJobsCount: 14,
      uptimeSeconds: 864200,
      lastHeartbeat: new Date(),
      isSimulated: false,
    },
    create: {
      id: 'backend-worker-01',
      name: 'Node Worker Alpha (BullMQ)',
      hostname: 'worker-01.us-east.dormammu.internal',
      status: WorkerStatus.BUSY,
      concurrency: 5,
      currentJobs: [
        {
          jobId: 'job_seed_1',
          executionId: 'run-seed-sample',
          nodeId: 'node-enrich-company',
          nodeLabel: 'Enrich Company',
          startedAt: new Date().toISOString(),
        },
      ],
      completedJobsCount: 1240,
      failedJobsCount: 14,
      uptimeSeconds: 864200,
      lastHeartbeat: new Date(),
      isSimulated: false,
    },
  });

  await prisma.workerInstance.upsert({
    where: { id: 'backend-worker-02' },
    update: {
      name: 'Node Worker Beta (BullMQ)',
      hostname: 'worker-02.us-east.dormammu.internal',
      status: WorkerStatus.IDLE,
      concurrency: 5,
      completedJobsCount: 1195,
      failedJobsCount: 8,
      uptimeSeconds: 864150,
      lastHeartbeat: new Date(),
      isSimulated: false,
    },
    create: {
      id: 'backend-worker-02',
      name: 'Node Worker Beta (BullMQ)',
      hostname: 'worker-02.us-east.dormammu.internal',
      status: WorkerStatus.IDLE,
      concurrency: 5,
      completedJobsCount: 1195,
      failedJobsCount: 8,
      uptimeSeconds: 864150,
      lastHeartbeat: new Date(),
      isSimulated: false,
    },
  });

  // 5. Seed Application Settings
  const defaultSettings = [
    {
      key: 'concurrency_limit',
      value: { maxConcurrentWorkflows: 20, maxConcurrentTasksPerWorker: 5 },
      category: 'execution',
      description: 'Maximum concurrency thresholds for distributed execution engine.',
    },
    {
      key: 'retry_backoff_policy',
      value: { defaultMaxAttempts: 3, backoffType: 'exponential', initialDelayMs: 1000 },
      category: 'resilience',
      description: 'Default retry and backoff policy applied to failed task nodes.',
    },
    {
      key: 'webhook_timeout_ms',
      value: 10000,
      category: 'network',
      description: 'Default HTTP request and outgoing webhook timeout in milliseconds.',
    },
  ];

  for (const s of defaultSettings) {
    await prisma.applicationSetting.upsert({
      where: { key: s.key },
      update: { value: s.value, category: s.category, description: s.description },
      create: s,
    });
  }

  // 6. Seed Sample Execution
  const sampleExecution = await prisma.execution.upsert({
    where: { id: 'run-customer-onboarding-demo' },
    update: {
      status: ExecutionStatus.SUCCEEDED,
    },
    create: {
      id: 'run-customer-onboarding-demo',
      workflowId: wfCustomer.id,
      workflowVersionId: wfVersion.id,
      workflowName: wfCustomer.name,
      workflowVersion: 3,
      triggerType: 'webhook',
      status: ExecutionStatus.SUCCEEDED,
      input: {
        userId: 'usr_84920',
        name: 'Sarah Connor',
        email: 's.connor@cyberdyne.io',
      },
      output: {
        company: 'Cyberdyne Systems',
        tier: 'Strategic Enterprise',
        slackDelivered: true,
      },
      durationMs: 1420,
      startedAt: new Date(Date.now() - 3600000),
      completedAt: new Date(Date.now() - 3600000 + 1420),
    },
  });

  await prisma.nodeExecution.upsert({
    where: { id: 'node-exec-1' },
    update: {},
    create: {
      id: 'node-exec-1',
      executionId: sampleExecution.id,
      nodeId: 'node-trig-signup',
      nodeLabel: 'Signup Webhook',
      nodeType: 'trigger',
      status: ExecutionStatus.SUCCEEDED,
      attempt: 1,
      maxAttempts: 3,
      startedAt: new Date(Date.now() - 3600000),
      completedAt: new Date(Date.now() - 3600000 + 50),
      durationMs: 50,
      input: { userId: 'usr_84920' },
      output: { userId: 'usr_84920', name: 'Sarah Connor' },
      logs: [
        { timestamp: new Date(Date.now() - 3600000).toISOString(), level: 'info', message: 'Webhook event received successfully' },
      ],
    },
  });

  console.log('✅ Dormammu database seeded successfully.');
}

main()
  .catch((e) => {
    console.error('❌ Database seed error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
