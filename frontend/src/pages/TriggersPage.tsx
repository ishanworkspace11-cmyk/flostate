import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import { apiClient } from '../lib/api-client';
import { WorkflowTrigger, TriggerKind, TriggerDeliveryRecord } from '../features/triggers/trigger.types';
import { formatDate, formatRelativeTime } from '../lib/date';
import {
  Zap,
  Clock,
  Globe,
  Plus,
  ShieldCheck,
  Copy,
  Check,
  Power,
  Trash2,
  ExternalLink,
  Info,
  Loader2,
  AlertTriangle,
  History,
  CheckCircle,
  XCircle,
  RefreshCw,
  Key,
  Radio,
} from 'lucide-react';
import { copyToClipboard } from '../lib/utils';
import { useNavigate } from 'react-router-dom';

const CRON_PRESETS = [
  { label: 'Every minute', expr: '* * * * *' },
  { label: 'Every 15 min', expr: '*/15 * * * *' },
  { label: 'Every hour', expr: '0 * * * *' },
  { label: 'Daily at 9am', expr: '0 9 * * *' },
  { label: 'Weekdays at 9am', expr: '0 9 * * 1-5' },
];

const TIMEZONE_OPTIONS = [
  'UTC',
  'America/New_York',
  'America/Los_Angeles',
  'America/Chicago',
  'Europe/London',
  'Europe/Berlin',
  'Asia/Kolkata',
  'Asia/Tokyo',
  'Australia/Sydney',
];

export const TriggersPage: React.FC = () => {
  const navigate = useNavigate();
  const [triggers, setTriggers] = useState<WorkflowTrigger[]>([]);
  const [workflows, setWorkflows] = useState<Array<{ id: string; name: string }>>([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Active filter tab
  const [kindFilter, setKindFilter] = useState<'all' | 'webhook' | 'cron'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'disabled'>('all');

  // Delivery History Drawer
  const [activeDeliveryTrigger, setActiveDeliveryTrigger] = useState<WorkflowTrigger | null>(null);
  const [deliveries, setDeliveries] = useState<TriggerDeliveryRecord[]>([]);
  const [loadingDeliveries, setLoadingDeliveries] = useState(false);

  // One-time Signing Secret Modal
  const [createdSecretInfo, setCreatedSecretInfo] = useState<{
    name: string;
    secret: string;
    path: string;
  } | null>(null);

  // Create Form State
  const [formName, setFormName] = useState('');
  const [formWorkflowId, setFormWorkflowId] = useState('');
  const [formKind, setFormKind] = useState<TriggerKind>('webhook');
  const [formCronExpression, setFormCronExpression] = useState('0 * * * *');
  const [formTimezone, setFormTimezone] = useState('UTC');
  const [formWebhookPath, setFormWebhookPath] = useState('');
  const [formGenerateSecret, setFormGenerateSecret] = useState(true);
  const [formAllowedMethods, setFormAllowedMethods] = useState('POST');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [triggersRes, workflowsRes] = await Promise.all([
        apiClient.listTriggers(),
        apiClient.listWorkflows({ limit: 100 }),
      ]);

      if (triggersRes.success && Array.isArray(triggersRes.data)) {
        setTriggers(triggersRes.data);
      }
      if (workflowsRes.success && Array.isArray(workflowsRes.data)) {
        setWorkflows(workflowsRes.data.map((w: any) => ({ id: w.id, name: w.name })));
        if (workflowsRes.data.length > 0 && !formWorkflowId) {
          setFormWorkflowId(workflowsRes.data[0].id);
        }
      }
    } catch (_err) {
    } finally {
      setLoading(false);
    }
  };

  const handleToggle = async (id: string, currentEnabled: boolean) => {
    try {
      const res = currentEnabled
        ? await apiClient.disableTrigger(id)
        : await apiClient.enableTrigger(id);

      if (res.success) {
        setTriggers((prev) =>
          prev.map((t) => (t.id === id ? { ...t, enabled: !currentEnabled } : t))
        );
        setToastMessage(`Trigger ${currentEnabled ? 'disabled' : 'enabled'} successfully`);
        setTimeout(() => setToastMessage(null), 2500);
      }
    } catch (err: any) {
      alert(`Failed to update trigger: ${err.message}`);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete trigger "${name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      const res = await apiClient.deleteTrigger(id);
      if (res.success) {
        setTriggers((prev) => prev.filter((t) => t.id !== id));
        setToastMessage(`Trigger "${name}" deleted`);
        setTimeout(() => setToastMessage(null), 2500);
      }
    } catch (err: any) {
      alert(`Delete failed: ${err.message}`);
    }
  };

  const handleCopyWebhook = async (id: string, path: string) => {
    const fullUrl = apiClient.getWebhookUrl(path);
    await copyToClipboard(fullUrl);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleOpenDeliveries = async (trigger: WorkflowTrigger) => {
    setActiveDeliveryTrigger(trigger);
    setLoadingDeliveries(true);
    try {
      const res = await apiClient.getTriggerDeliveries(trigger.id);
      if (res.success && Array.isArray(res.data)) {
        setDeliveries(res.data);
      } else {
        setDeliveries([]);
      }
    } catch {
      setDeliveries([]);
    } finally {
      setLoadingDeliveries(false);
    }
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim() || !formWorkflowId) return;

    setIsSubmitting(true);
    setFormError(null);

    try {
      const payload: any = {
        name: formName.trim(),
        workflowId: formWorkflowId,
        kind: formKind,
        enabled: true,
      };

      if (formKind === 'webhook') {
        if (formWebhookPath.trim()) payload.webhookPath = formWebhookPath.trim();
        payload.generateSecret = formGenerateSecret;
        payload.allowedMethods = [formAllowedMethods.toUpperCase()];
      } else {
        payload.cronExpression = formCronExpression.trim();
        payload.timezone = formTimezone;
      }

      const res = await apiClient.createTrigger(payload);
      if (res.success && res.data) {
        const created: WorkflowTrigger = res.data;
        setIsModalOpen(false);

        // If a secret was generated, show the one-time display modal
        if (created.signingSecret) {
          setCreatedSecretInfo({
            name: created.name,
            secret: created.signingSecret,
            path: created.webhookPath || '',
          });
        }

        setFormName('');
        setFormWebhookPath('');
        setToastMessage(`Trigger "${created.name}" created successfully`);
        setTimeout(() => setToastMessage(null), 3000);
        await loadData();
      } else {
        setFormError(res.error?.message || 'Failed to create trigger');
      }
    } catch (err: any) {
      setFormError(err.message || 'An unexpected error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Filtered Triggers
  const filteredTriggers = triggers.filter((t) => {
    if (kindFilter !== 'all' && t.kind !== kindFilter) return false;
    if (statusFilter === 'active' && !t.enabled) return false;
    if (statusFilter === 'disabled' && t.enabled) return false;
    return true;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-xl text-xs font-medium flex items-center gap-2 animate-in slide-in-from-top duration-150">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <PageHeader
        title="Triggers & Ingress"
        description="Configure inbound webhook endpoints with signature validation and scheduled cron jobs driving the DAG engine."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Triggers' }]}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={loadData}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition"
            >
              <RefreshCw className="w-3.5 h-3.5 text-slate-400" />
              <span>Refresh</span>
            </button>
            <button
              onClick={() => {
                setFormError(null);
                setIsModalOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create Trigger</span>
            </button>
          </div>
        }
      />

      {/* Local Tunneling & Deployment Guidance Notice */}
      <div className="p-4 bg-indigo-50/70 border border-indigo-200/90 rounded-xl flex items-start gap-3 text-xs text-indigo-950 shadow-2xs">
        <Radio className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold flex items-center gap-2">
            <span>Local Webhook Ingress & Tunneling Notice</span>
            <span className="px-2 py-0.5 rounded-full text-[10px] font-mono uppercase bg-indigo-100 text-indigo-700 font-semibold">
              Port 4000
            </span>
          </p>
          <p className="text-indigo-900/90 leading-relaxed text-[11px]">
            Webhook endpoints are actively listening on your local backend server (<code>http://localhost:4000/api/v1/webhooks/*</code>).
            For third-party external providers (such as GitHub, Stripe, or PagerDuty) to deliver events to your local workspace,
            forward incoming requests using a secure tunnel like <code>ngrok http 4000</code> or deploy to a public cloud URL.
          </p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-2 border-b border-slate-200">
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-lg text-xs font-medium">
          <button
            onClick={() => setKindFilter('all')}
            className={`px-3 py-1 rounded-md transition ${
              kindFilter === 'all' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Triggers ({triggers.length})
          </button>
          <button
            onClick={() => setKindFilter('webhook')}
            className={`px-3 py-1 rounded-md transition flex items-center gap-1.5 ${
              kindFilter === 'webhook' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Globe className="w-3.5 h-3.5 text-blue-500" />
            <span>Webhooks</span>
          </button>
          <button
            onClick={() => setKindFilter('cron')}
            className={`px-3 py-1 rounded-md transition flex items-center gap-1.5 ${
              kindFilter === 'cron' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span>Scheduled Cron</span>
          </button>
        </div>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-400 mr-1 text-[11px] uppercase font-mono">Status:</span>
          {(['all', 'active', 'disabled'] as const).map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-2.5 py-1 rounded-lg capitalize font-medium transition ${
                statusFilter === status
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:bg-slate-100'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Triggers Grid */}
      {loading ? (
        <div className="p-12 text-center">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mx-auto mb-2" />
          <p className="text-xs text-slate-500 font-medium">Loading triggers from engine...</p>
        </div>
      ) : filteredTriggers.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-xl border border-slate-200">
          <Zap className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <h3 className="text-sm font-bold text-slate-800">No triggers match the selected filters</h3>
          <p className="text-xs text-slate-500 mt-1">Create a webhook ingress endpoint or scheduled cron job to automate workflow execution.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredTriggers.map((trigger) => {
            const isWebhook = trigger.kind === 'webhook';
            const Icon = isWebhook ? Globe : Clock;
            const fullUrl = apiClient.getWebhookUrl(trigger.webhookPath || '');
            const isUnhealthy = trigger.lastDeliveryStatus === 'failed';

            return (
              <div
                key={trigger.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs hover:border-slate-300 transition flex flex-col justify-between"
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
                        <h4 className="text-xs font-bold text-slate-900 leading-snug">{trigger.name}</h4>
                        <span className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
                          {trigger.kind} Trigger
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isUnhealthy ? (
                        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 text-rose-500" />
                          Unhealthy
                        </span>
                      ) : trigger.enabled ? (
                        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 flex items-center gap-1">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          Active
                        </span>
                      ) : (
                        <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                          Disabled
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="mt-4 space-y-3 text-xs">
                    <div>
                      <span className="text-[10px] text-slate-400 uppercase font-mono block">
                        Target Workflow
                      </span>
                      <button
                        onClick={() => navigate(`/builder/${trigger.workflowId}`)}
                        className="font-medium text-slate-800 hover:text-indigo-600 truncate block transition"
                      >
                        {trigger.workflowName}
                      </button>
                    </div>

                    {isWebhook ? (
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-slate-400 uppercase font-mono block">
                          Ingress Endpoint
                        </span>
                        <div className="flex items-center justify-between gap-1 p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-700">
                          <span className="truncate" title={fullUrl}>
                            {trigger.webhookPath}
                          </span>
                          <button
                            onClick={() => handleCopyWebhook(trigger.id, trigger.webhookPath || '')}
                            title="Copy full webhook ingress URL"
                            className="p-1 hover:text-slate-900 shrink-0 text-slate-400"
                          >
                            {copiedId === trigger.id ? (
                              <Check className="w-3.5 h-3.5 text-emerald-600" />
                            ) : (
                              <Copy className="w-3.5 h-3.5" />
                            )}
                          </button>
                        </div>
                        <div className="flex items-center justify-between text-[10px] text-slate-400 pt-0.5">
                          <span>Method: {(trigger.allowedMethods || ['POST']).join(', ')}</span>
                          {trigger.hasSecret ? (
                            <span className="text-emerald-600 font-medium flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3" />
                              HMAC SHA-256 Protected
                            </span>
                          ) : (
                            <span className="text-slate-400">Public (No Secret)</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-1.5">
                        <span className="text-[10px] text-slate-400 uppercase font-mono block">
                          Cron Expression & Timezone
                        </span>
                        <div className="p-1.5 bg-slate-50 border border-slate-200 rounded-lg font-mono text-[11px] text-slate-800 font-semibold flex items-center justify-between">
                          <span>{trigger.cronExpression}</span>
                          <span className="text-[10px] font-normal text-slate-500 uppercase">{trigger.timezone || 'UTC'}</span>
                        </div>
                        {trigger.nextRunAt && trigger.enabled && (
                          <div className="text-[10px] text-indigo-600 font-mono">
                            Next run: {formatDate(trigger.nextRunAt)}
                          </div>
                        )}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-[11px] text-slate-400 pt-2 border-t border-slate-100">
                      <span>Total Invocations: {trigger.totalTriggers}</span>
                      <span>
                        {trigger.lastTriggeredAt
                          ? `Last: ${formatRelativeTime(trigger.lastTriggeredAt)}`
                          : 'Never triggered'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <div className="mt-5 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggle(trigger.id, trigger.enabled)}
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
                      onClick={() => handleOpenDeliveries(trigger)}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium transition"
                    >
                      <History className="w-3 h-3 text-slate-400" />
                      <span>Deliveries</span>
                    </button>
                  </div>

                  <button
                    onClick={() => handleDelete(trigger.id, trigger.name)}
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
      )}

      {/* One-Time Signing Secret Modal */}
      {createdSecretInfo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center gap-3 text-emerald-600">
              <ShieldCheck className="w-6 h-6" />
              <h3 className="text-base font-bold text-slate-900">Webhook Secret Generated</h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Make sure to copy your webhook signing secret now for <strong>"{createdSecretInfo.name}"</strong>.
              For security, this secret is hashed and will <strong>never be shown again</strong>.
            </p>

            <div className="p-3 bg-slate-900 rounded-lg text-emerald-400 font-mono text-xs break-all select-all flex items-center justify-between gap-2">
              <span>{createdSecretInfo.secret}</span>
              <button
                onClick={async () => {
                  await copyToClipboard(createdSecretInfo.secret);
                  setToastMessage('Secret copied to clipboard');
                  setTimeout(() => setToastMessage(null), 2000);
                }}
                className="p-1 text-slate-400 hover:text-white shrink-0"
              >
                <Copy className="w-4 h-4" />
              </button>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-[11px] text-amber-800 space-y-1">
              <span className="font-bold block">How to verify signatures:</span>
              <p>
                Send the HMAC SHA-256 signature in the <code>X-Dormammu-Signature: sha256=&lt;hash&gt;</code> header or
                pass the secret directly via <code>X-Webhook-Secret: {createdSecretInfo.secret.substring(0, 8)}...</code>.
              </p>
            </div>

            <div className="flex justify-end pt-2">
              <button
                onClick={() => setCreatedSecretInfo(null)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition"
              >
                I have saved this secret
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delivery History Drawer / Modal */}
      {activeDeliveryTrigger && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-2xl bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between">
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Delivery Log: {activeDeliveryTrigger.name}
                </h3>
                <span className="text-[11px] text-slate-500 font-mono">
                  Target: {activeDeliveryTrigger.workflowName}
                </span>
              </div>
              <button
                onClick={() => setActiveDeliveryTrigger(null)}
                className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto space-y-3 flex-1 text-xs">
              {loadingDeliveries ? (
                <div className="p-8 text-center text-slate-400">
                  <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                  Loading delivery records...
                </div>
              ) : deliveries.length === 0 ? (
                <div className="p-8 text-center text-slate-400 bg-slate-50 rounded-lg">
                  No deliveries recorded yet. Send an HTTP request to this trigger's ingress endpoint to see live delivery traces.
                </div>
              ) : (
                deliveries.map((del) => (
                  <div
                    key={del.id}
                    className="p-3.5 rounded-lg border border-slate-200 bg-white shadow-2xs space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-mono font-bold ${
                            del.status === 'SUCCESS'
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : del.status === 'DUPLICATE'
                              ? 'bg-blue-50 text-blue-700 border border-blue-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          {del.status} ({del.httpStatus})
                        </span>
                        <span className="text-slate-400 font-mono text-[11px]">
                          {formatDate(del.deliveredAt)}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] text-slate-500">
                        {del.durationMs}ms
                      </span>
                    </div>

                    {del.error && (
                      <p className="text-rose-600 text-[11px] font-mono">{del.error}</p>
                    )}

                    {del.executionId && (
                      <div className="flex items-center justify-between pt-1 text-[11px] border-t border-slate-100">
                        <span className="text-slate-500 font-mono">
                          Run: #{del.executionId.substring(0, 10)}
                        </span>
                        <button
                          onClick={() => {
                            setActiveDeliveryTrigger(null);
                            navigate(`/runs/${del.executionId}`);
                          }}
                          className="text-indigo-600 hover:text-indigo-800 font-semibold inline-flex items-center gap-1"
                        >
                          <span>Inspect Execution</span>
                          <ExternalLink className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setActiveDeliveryTrigger(null)}
                className="px-4 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Create Trigger Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-lg bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden">
            <form onSubmit={handleCreateSubmit}>
              <div className="p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-base font-bold text-slate-900">Create Workflow Trigger</h3>
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="text-slate-400 hover:text-slate-600 text-sm font-semibold"
                  >
                    ✕
                  </button>
                </div>

                {formError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800">
                    {formError}
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase font-mono mb-1">
                    Trigger Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={formName}
                    onChange={(e) => setFormName(e.target.value)}
                    placeholder="e.g. Stripe Payment Ingestion"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 font-medium"
                    autoFocus
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase font-mono mb-1">
                    Target Workflow *
                  </label>
                  <select
                    value={formWorkflowId}
                    onChange={(e) => setFormWorkflowId(e.target.value)}
                    required
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 font-medium"
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
                    Trigger Mechanism
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setFormKind('webhook')}
                      className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                        formKind === 'webhook'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-2xs'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Globe className="w-4 h-4" />
                      <span>Webhook Ingress</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setFormKind('cron')}
                      className={`p-2.5 rounded-lg border text-xs font-semibold flex items-center justify-center gap-1.5 transition ${
                        formKind === 'cron'
                          ? 'border-indigo-600 bg-indigo-50 text-indigo-700 shadow-2xs'
                          : 'border-slate-200 text-slate-600 hover:bg-slate-50'
                      }`}
                    >
                      <Clock className="w-4 h-4" />
                      <span>Scheduled Cron</span>
                    </button>
                  </div>
                </div>

                {formKind === 'webhook' ? (
                  <div className="space-y-3 pt-1">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase font-mono mb-1">
                        Custom Webhook Slug / Path (Optional)
                      </label>
                      <input
                        type="text"
                        value={formWebhookPath}
                        onChange={(e) => setFormWebhookPath(e.target.value)}
                        placeholder="e.g. /stripe-events (auto-generates unguessable slug if blank)"
                        className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-200"
                      />
                    </div>

                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id="generateSecretCheck"
                        checked={formGenerateSecret}
                        onChange={(e) => setFormGenerateSecret(e.target.checked)}
                        className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <label htmlFor="generateSecretCheck" className="text-xs text-slate-700 font-medium cursor-pointer">
                        Generate cryptographic HMAC-SHA256 signing secret (Recommended)
                      </label>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-3 pt-1">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="block text-xs font-semibold text-slate-700 uppercase font-mono">
                          Cron Expression *
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono">5-part standard</span>
                      </div>
                      <input
                        type="text"
                        required
                        value={formCronExpression}
                        onChange={(e) => setFormCronExpression(e.target.value)}
                        className="w-full px-3 py-2 text-xs font-mono font-semibold rounded-lg border border-slate-200"
                        placeholder="0 * * * *"
                      />
                    </div>

                    {/* Presets */}
                    <div>
                      <span className="text-[10px] uppercase font-mono text-slate-400 block mb-1.5">
                        Quick Presets:
                      </span>
                      <div className="flex flex-wrap gap-1.5">
                        {CRON_PRESETS.map((p) => (
                          <button
                            key={p.expr}
                            type="button"
                            onClick={() => setFormCronExpression(p.expr)}
                            className="px-2 py-1 text-[11px] rounded border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 font-mono"
                          >
                            {p.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 uppercase font-mono mb-1">
                        Timezone
                      </label>
                      <select
                        value={formTimezone}
                        onChange={(e) => setFormTimezone(e.target.value)}
                        className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 font-mono"
                      >
                        {TIMEZONE_OPTIONS.map((tz) => (
                          <option key={tz} value={tz}>
                            {tz}
                          </option>
                        ))}
                      </select>
                    </div>
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
                  disabled={isSubmitting}
                  className="inline-flex items-center gap-1.5 px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs disabled:opacity-50"
                >
                  {isSubmitting && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Save Trigger</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
