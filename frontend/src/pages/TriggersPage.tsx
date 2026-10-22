import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { TriggerService } from '../features/triggers/trigger.service';
import { WorkflowService } from '../features/workflows/workflow.service';
import { WorkflowTrigger, TriggerKind } from '../features/triggers/trigger.types';
import { formatDate, formatRelativeTime } from '../lib/date';
import {
  Zap,
  Clock,
  Globe,
  Plus,
  ShieldAlert,
  Copy,
  Check,
  Power,
  Trash2,
  ExternalLink,
  Info,
} from 'lucide-react';
import { copyToClipboard } from '../lib/utils';

export const TriggersPage: React.FC = () => {
  const [triggers, setTriggers] = useState<WorkflowTrigger[]>([]);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // Form state
  const [name, setName] = useState('');
  const [workflowId, setWorkflowId] = useState('');
  const [kind, setKind] = useState<TriggerKind>('webhook');
  const [cronExpression, setCronExpression] = useState('0 * * * *');
  const [webhookPath, setWebhookPath] = useState('/api/v1/webhooks/my-event');

  const workflows = WorkflowService.listWorkflows();

  useEffect(() => {
    loadTriggers();
  }, []);

  const loadTriggers = () => {
    setTriggers(TriggerService.listTriggers());
  };

  const handleToggle = (id: string) => {
    TriggerService.toggleTrigger(id);
    loadTriggers();
  };

  const handleDelete = (id: string) => {
    TriggerService.deleteTrigger(id);
    loadTriggers();
  };

  const handleCopyWebhook = async (id: string, path: string) => {
    const backendBase = (import.meta as any).env?.VITE_API_URL || 'http://localhost:4000';
    const fullUrl = `${backendBase}${path.startsWith('/') ? path : '/' + path}`;
    await copyToClipboard(fullUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    TriggerService.createTrigger({
      name: name.trim(),
      workflowId: workflowId || (workflows[0]?.id || ''),
      kind,
      cronExpression,
      webhookPath,
      enabled: true,
    });

    setIsModalOpen(false);
    setName('');
    loadTriggers();
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Triggers & Ingress"
        description="Configure inbound webhook endpoints and scheduled cron expressions to launch DAG workflows."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Triggers' }]}
        actions={
          <button
            onClick={() => {
              if (workflows.length > 0) setWorkflowId(workflows[0].id);
              setIsModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create Trigger</span>
          </button>
        }
      />

      {/* Honest Backend Notice Banner */}
      <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">
            Demo Mode Notice — Triggers are currently marked: "Demo / Not Connected"
          </p>
          <p className="text-amber-800 leading-relaxed">
            In this browser-only MVP, external HTTP requests cannot hit your browser client directly without a real Node.js/Express server and webhook gateway. In production, these triggers connect to Redis/BullMQ worker queues.
          </p>
        </div>
      </div>

      {/* Triggers List */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {triggers.map((trigger) => {
          const isWebhook = trigger.kind === 'webhook';
          const Icon = isWebhook ? Globe : Clock;

          return (
            <div
              key={trigger.id}
              className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-2xs hover:border-slate-300 transition flex flex-col justify-between"
            >
              <div>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`p-2 rounded-lg border ${
                        isWebhook
                          ? 'bg-blue-50 border-blue-200 text-blue-600'
                          : 'bg-amber-50 border-amber-200 text-amber-600'
                      }`}
                    >
                      <Icon className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">{trigger.name}</h4>
                      <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                        {trigger.kind} Trigger
                      </span>
                    </div>
                  </div>

                  <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
                    DEMO / NOT CONNECTED
                  </span>
                </div>

                <div className="mt-4 space-y-2.5 text-xs">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-mono block">
                      Target Workflow
                    </span>
                    <span className="font-medium text-slate-800 truncate block">
                      {trigger.workflowName}
                    </span>
                  </div>

                  {isWebhook ? (
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">
                        Webhook Ingress URL
                      </span>
                      <div className="mt-1 flex items-center justify-between gap-1 p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-600">
                        <span className="truncate">{trigger.webhookPath}</span>
                        <button
                          onClick={() => handleCopyWebhook(trigger.id, trigger.webhookPath || '')}
                          title="Copy mock webhook URL"
                          className="p-1 hover:text-slate-900 shrink-0 text-slate-400"
                        >
                          {copiedId === trigger.id ? (
                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                          ) : (
                            <Copy className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">
                        Cron Schedule
                      </span>
                      <div className="mt-1 p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-800 font-semibold">
                        {trigger.cronExpression}
                      </div>
                    </div>
                  )}

                  <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                    <span>Triggers fired: {trigger.totalTriggers}</span>
                    <span>
                      {trigger.lastTriggeredAt
                        ? `Last: ${formatRelativeTime(trigger.lastTriggeredAt)}`
                        : 'Never triggered'}
                    </span>
                  </div>
                </div>
              </div>

              {/* Action footer */}
              <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                <button
                  onClick={() => handleToggle(trigger.id)}
                  className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg border font-medium transition ${
                    trigger.enabled
                      ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                      : 'bg-slate-50 text-slate-500 border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  <Power className="w-3 h-3" />
                  <span>{trigger.enabled ? 'Enabled' : 'Disabled'}</span>
                </button>

                <button
                  onClick={() => handleDelete(trigger.id)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 transition"
                  title="Delete trigger"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Create Trigger Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden">
            <form onSubmit={handleCreateSubmit}>
              <div className="p-6 space-y-4">
                <h3 className="text-base font-bold text-slate-900">New Workflow Trigger</h3>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase font-mono mb-1">
                    Trigger Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Stripe Customer Ingestion"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 font-medium"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase font-mono mb-1">
                    Associated Workflow *
                  </label>
                  <select
                    value={workflowId}
                    onChange={(e) => setWorkflowId(e.target.value)}
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200"
                  >
                    {workflows.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase font-mono mb-1">
                    Trigger Kind
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setKind('webhook')}
                      className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 ${
                        kind === 'webhook'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Globe className="w-4 h-4" />
                      <span>Webhook</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setKind('cron')}
                      className={`p-2.5 rounded-lg border text-xs font-medium flex items-center justify-center gap-1.5 ${
                        kind === 'cron'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      <span>Cron Schedule</span>
                    </button>
                  </div>
                </div>

                {kind === 'webhook' ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase font-mono mb-1">
                      Webhook Path
                    </label>
                    <input
                      type="text"
                      value={webhookPath}
                      onChange={(e) => setWebhookPath(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase font-mono mb-1">
                      Cron Expression
                    </label>
                    <input
                      type="text"
                      value={cronExpression}
                      onChange={(e) => setCronExpression(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200"
                      placeholder="0 * * * *"
                    />
                  </div>
                )}
              </div>

              <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs"
                >
                  Save Trigger
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
