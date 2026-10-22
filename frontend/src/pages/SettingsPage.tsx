import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { apiClient } from '../lib/api-client';
import {
  RotateCcw,
  Database,
  Server,
  Layers,
  Info,
  CheckCircle,
  Save,
  AlertTriangle,
  Clock,
  RefreshCw,
  Sliders,
  Shield,
  Sparkles,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState<string | null>(null);
  const [isResetting, setIsResetting] = useState(false);

  // Storage and system stats
  const [storageStats, setStorageStats] = useState({
    workflowCount: 0,
    executionCount: 0,
    triggerCount: 0,
    workerCount: 0,
    estimatedKb: 0,
  });

  const [systemInfo, setSystemInfo] = useState<any>(null);

  // Operational Settings state
  const [concurrency, setConcurrency] = useState({
    maxConcurrentWorkflows: 20,
    maxConcurrentTasksPerWorker: 5,
  });

  const [resilience, setResilience] = useState({
    defaultMaxAttempts: 3,
    backoffType: 'exponential' as 'exponential' | 'linear' | 'fixed',
    initialDelayMs: 1000,
  });

  const [timeouts, setTimeouts] = useState({
    defaultNodeTimeoutMs: 30000,
    httpRequestTimeoutMs: 15000,
  });

  const [retention, setRetention] = useState({
    retentionDays: 30,
    maxExecutionsToRetain: 5000,
    autoCleanupEnabled: true,
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const [settingsRes, sysRes] = await Promise.all([
        apiClient.getSettings(),
        apiClient.getSystemInfo(),
      ]);

      if (settingsRes.success && Array.isArray(settingsRes.data)) {
        for (const s of settingsRes.data) {
          if (s.key === 'concurrency_limit' && s.value) {
            setConcurrency({
              maxConcurrentWorkflows: s.value.maxConcurrentWorkflows ?? 20,
              maxConcurrentTasksPerWorker: s.value.maxConcurrentTasksPerWorker ?? 5,
            });
          } else if (s.key === 'retry_backoff_policy' && s.value) {
            setResilience({
              defaultMaxAttempts: s.value.defaultMaxAttempts ?? 3,
              backoffType: s.value.backoffType ?? 'exponential',
              initialDelayMs: s.value.initialDelayMs ?? 1000,
            });
          } else if (s.key === 'node_timeout_limits' && s.value) {
            setTimeouts({
              defaultNodeTimeoutMs: s.value.defaultNodeTimeoutMs ?? 30000,
              httpRequestTimeoutMs: s.value.httpRequestTimeoutMs ?? 15000,
            });
          } else if (s.key === 'history_retention' && s.value) {
            setRetention({
              retentionDays: s.value.retentionDays ?? 30,
              maxExecutionsToRetain: s.value.maxExecutionsToRetain ?? 5000,
              autoCleanupEnabled: s.value.autoCleanupEnabled ?? true,
            });
          }
        }
      }

      if (sysRes.success && sysRes.data) {
        setSystemInfo(sysRes.data);
        if (sysRes.data.storageStats) {
          setStorageStats({
            workflowCount: sysRes.data.storageStats.workflowCount || 0,
            executionCount: sysRes.data.storageStats.executionCount || 0,
            triggerCount: sysRes.data.storageStats.triggerCount || 0,
            workerCount: sysRes.data.storageStats.workerCount || 0,
            estimatedKb: sysRes.data.storageStats.estimatedDatabaseKb || 0,
          });
        }
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to load application settings');
    } finally {
      setIsLoading(false);
    }
  };

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  const handleSaveSetting = async (key: string, value: any, category: string) => {
    setIsSaving(key);
    setErrorMessage(null);

    try {
      const res = await apiClient.updateSetting(key, value, category);
      if (res.success) {
        showToast(res.message || `Saved '${key}' successfully.`);
      } else {
        setErrorMessage(res.error?.message || `Failed to update ${key}`);
      }
    } catch (err: any) {
      setErrorMessage(err?.message || `Failed to save setting '${key}'`);
    } finally {
      setIsSaving(null);
    }
  };

  const handleResetDemoData = async () => {
    setIsResetting(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.resetDemoData('RESET_DEMO_DATA');
      if (res.success) {
        setIsResetConfirmOpen(false);
        showToast('Demo workflows, executions, and triggers have been deterministically reset to factory state.');
        await loadSettings();
      } else {
        setErrorMessage(res.error?.message || 'Failed to reset demo data');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Failed to execute demo data reset');
    } finally {
      setIsResetting(false);
      setIsResetConfirmOpen(false);
    }
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-xl text-xs font-medium flex items-center gap-2 animate-in slide-in-from-top duration-150">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Error Alert */}
      {errorMessage && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button onClick={() => setErrorMessage(null)} className="font-semibold underline ml-2">
            Dismiss
          </button>
        </div>
      )}

      <PageHeader
        title="Settings & Operational Configuration"
        description="Configure DAG execution limits, retry algorithms, timeout safeguards, and persistence parameters."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Settings' }]}
        actions={
          <button
            onClick={loadSettings}
            disabled={isLoading}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin text-indigo-600' : ''}`} />
            <span>Refresh</span>
          </button>
        }
      />

      {/* Security Disclaimer Banner */}
      <div className="p-4 bg-indigo-50/70 border border-indigo-200/90 rounded-xl flex items-start gap-3 text-xs text-indigo-950">
        <Shield className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold flex items-center gap-2">
            <span>Single-Workspace Operational Mode</span>
            <span className="text-[10px] px-1.5 py-0.2 bg-indigo-100 text-indigo-800 rounded font-mono">
              LOCAL DEVELOPMENT
            </span>
          </p>
          <p className="text-indigo-800 leading-relaxed text-[11px]">
            This instance operates in single-workspace mode. Database credentials, Redis URLs, signing secrets, and tokens are safely isolated via environment variables and are never stored or exposed through application settings.
          </p>
        </div>
      </div>

      {/* Section 1: Execution Concurrency Limits */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
              <Sliders className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Execution Concurrency Limits</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Maximum parallel workflows and worker task thread dispatch capacity.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-50 text-amber-800 border border-amber-200 font-semibold flex items-center gap-1">
            <Clock className="w-3 h-3" />
            <span>Restart Required</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Max Concurrent Workflows (1 - 100)
            </label>
            <input
              type="number"
              min={1}
              max={100}
              value={concurrency.maxConcurrentWorkflows}
              onChange={(e) =>
                setConcurrency({ ...concurrency, maxConcurrentWorkflows: parseInt(e.target.value, 10) || 1 })
              }
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">Active runs evaluated concurrently by DAG engine.</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Max Tasks Per Worker (1 - 50)
            </label>
            <input
              type="number"
              min={1}
              max={50}
              value={concurrency.maxConcurrentTasksPerWorker}
              onChange={(e) =>
                setConcurrency({ ...concurrency, maxConcurrentTasksPerWorker: parseInt(e.target.value, 10) || 1 })
              }
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">BullMQ task concurrency allocated per worker daemon.</span>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500">
            Worker restarts apply updated BullMQ consumer concurrency.
          </span>
          <button
            onClick={() => handleSaveSetting('concurrency_limit', concurrency, 'execution')}
            disabled={isSaving === 'concurrency_limit'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving === 'concurrency_limit' ? 'Saving...' : 'Save Concurrency'}</span>
          </button>
        </div>
      </div>

      {/* Section 2: Retry & Backoff Resilience Policy */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Retry & Backoff Resilience Policy</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Default recovery behavior for failed DAG nodes and temporary HTTP network errors.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            <span>Takes Effect Immediately</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Default Max Attempts (1 - 10)
            </label>
            <input
              type="number"
              min={1}
              max={10}
              value={resilience.defaultMaxAttempts}
              onChange={(e) =>
                setResilience({ ...resilience, defaultMaxAttempts: parseInt(e.target.value, 10) || 1 })
              }
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Backoff Algorithm
            </label>
            <select
              value={resilience.backoffType}
              onChange={(e) =>
                setResilience({ ...resilience, backoffType: e.target.value as any })
              }
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 bg-white"
            >
              <option value="exponential">Exponential (2ⁿ × delay)</option>
              <option value="linear">Linear (n × delay)</option>
              <option value="fixed">Fixed Delay</option>
            </select>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Initial Delay (ms)
            </label>
            <input
              type="number"
              min={100}
              max={60000}
              step={100}
              value={resilience.initialDelayMs}
              onChange={(e) =>
                setResilience({ ...resilience, initialDelayMs: parseInt(e.target.value, 10) || 100 })
              }
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500">
            Node-level configurations in the Builder override these default values.
          </span>
          <button
            onClick={() => handleSaveSetting('retry_backoff_policy', resilience, 'resilience')}
            disabled={isSaving === 'retry_backoff_policy'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving === 'retry_backoff_policy' ? 'Saving...' : 'Save Policy'}</span>
          </button>
        </div>
      </div>

      {/* Section 3: Node Timeout Safeguards */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700">
              <Clock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Execution Timeout Safeguards</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Maximum duration thresholds to prevent runaway jobs or frozen upstream APIs.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            <span>Takes Effect Immediately</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Default Node Timeout (ms)
            </label>
            <input
              type="number"
              min={1000}
              max={600000}
              step={1000}
              value={timeouts.defaultNodeTimeoutMs}
              onChange={(e) =>
                setTimeouts({ ...timeouts, defaultNodeTimeoutMs: parseInt(e.target.value, 10) || 1000 })
              }
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">Max execution window (default 30,000ms / 30s).</span>
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              HTTP Request Node Timeout (ms)
            </label>
            <input
              type="number"
              min={1000}
              max={120000}
              step={1000}
              value={timeouts.httpRequestTimeoutMs}
              onChange={(e) =>
                setTimeouts({ ...timeouts, httpRequestTimeoutMs: parseInt(e.target.value, 10) || 1000 })
              }
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
            <span className="text-[10px] text-slate-400 mt-1 block">Socket connection and response timeout limit.</span>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500">
            Enforced by `TaskProcessor` for all dispatched DAG step nodes.
          </span>
          <button
            onClick={() => handleSaveSetting('node_timeout_limits', timeouts, 'timeouts')}
            disabled={isSaving === 'node_timeout_limits'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving === 'node_timeout_limits' ? 'Saving...' : 'Save Timeouts'}</span>
          </button>
        </div>
      </div>

      {/* Section 4: History Retention & Cleanup */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-2xs space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-lg bg-slate-100 border border-slate-200 text-slate-700">
              <Layers className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Execution History Retention</h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Controls log retention periods and database storage limits.
              </p>
            </div>
          </div>
          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-semibold flex items-center gap-1">
            <CheckCircle className="w-3 h-3" />
            <span>Takes Effect Immediately</span>
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-2">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Retention Days (1 - 365)
            </label>
            <input
              type="number"
              min={1}
              max={365}
              value={retention.retentionDays}
              onChange={(e) =>
                setRetention({ ...retention, retentionDays: parseInt(e.target.value, 10) || 1 })
              }
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">
              Max Runs to Retain
            </label>
            <input
              type="number"
              min={100}
              max={100000}
              step={500}
              value={retention.maxExecutionsToRetain}
              onChange={(e) =>
                setRetention({ ...retention, maxExecutionsToRetain: parseInt(e.target.value, 10) || 100 })
              }
              className="w-full px-3 py-2 text-xs font-mono rounded-lg border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex flex-col justify-center">
            <label className="block text-xs font-semibold text-slate-700 mb-2">
              Automated Cleanup
            </label>
            <label className="inline-flex items-center gap-2 cursor-pointer text-xs text-slate-700">
              <input
                type="checkbox"
                checked={retention.autoCleanupEnabled}
                onChange={(e) => setRetention({ ...retention, autoCleanupEnabled: e.target.checked })}
                className="w-4 h-4 text-indigo-600 rounded border-slate-300 focus:ring-indigo-500"
              />
              <span>Enable background retention sweep</span>
            </label>
          </div>
        </div>

        <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
          <span className="text-[11px] text-slate-500">
            Oldest succeeded runs pruned when exceeding thresholds.
          </span>
          <button
            onClick={() => handleSaveSetting('history_retention', retention, 'retention')}
            disabled={isSaving === 'history_retention'}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition disabled:opacity-50"
          >
            <Save className="w-3.5 h-3.5" />
            <span>{isSaving === 'history_retention' ? 'Saving...' : 'Save Retention'}</span>
          </button>
        </div>
      </div>

      {/* Section 5: Persistence & Demo Data Operations */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-2xs space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Database & Persistence Telemetry</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Live server storage statistics across workflows, executions, and triggers.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-mono block">Workflows</span>
            <span className="text-lg font-bold text-slate-900 font-mono mt-0.5 block">
              {storageStats.workflowCount}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-mono block">Executions</span>
            <span className="text-lg font-bold text-slate-900 font-mono mt-0.5 block">
              {storageStats.executionCount}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-mono block">Triggers</span>
            <span className="text-lg font-bold text-slate-900 font-mono mt-0.5 block">
              {storageStats.triggerCount}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-mono block">Storage Size</span>
            <span className="text-lg font-bold text-slate-900 font-mono mt-0.5 block">
              ~{storageStats.estimatedKb} KB
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div>
            <h4 className="text-xs font-semibold text-slate-900">Reset Demo Data</h4>
            <p className="text-[11px] text-slate-500">
              Restore default sample workflows, executions, and triggers deterministically.
            </p>
          </div>
          <button
            onClick={() => setIsResetConfirmOpen(true)}
            disabled={isResetting}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition disabled:opacity-50"
          >
            <RotateCcw className={`w-3.5 h-3.5 ${isResetting ? 'animate-spin' : ''}`} />
            <span>{isResetting ? 'Resetting...' : 'Reset to Factory Seeds'}</span>
          </button>
        </div>
      </div>

      {/* Architecture & Backend Specifications */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Distributed Backend Path</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Clean separation ready for production microservices.
            </p>
          </div>
        </div>

        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            The Dormammu Loop architecture decouples frontends from workers through clean interfaces:
          </p>
          <ul className="list-disc pl-5 space-y-1 font-mono text-[11px] text-slate-700">
            <li><strong className="text-slate-900 font-sans">Node.js + Express API:</strong> Live endpoints for workflows, runs, triggers, and workers.</li>
            <li><strong className="text-slate-900 font-sans">PostgreSQL:</strong> Relational workflow DAG definitions, versioning, and execution logs.</li>
            <li><strong className="text-slate-900 font-sans">Redis + BullMQ:</strong> Distributed queues with concurrency management and heartbeat monitoring.</li>
            <li><strong className="text-slate-900 font-sans">Durable DAG Engine:</strong> Pure TypeScript engine with zero React dependencies executing distributed steps.</li>
          </ul>
        </div>
      </div>

      {/* Environment & Version Info */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-2xs space-y-3 text-xs">
        <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
          Runtime Environment
        </h3>
        <div className="grid grid-cols-2 gap-3 font-mono text-[11px] text-slate-600">
          <div>Engine Version: <span className="font-semibold text-slate-900">{systemInfo?.engineVersion || 'v1.0.0-mvp'}</span></div>
          <div>Node Version: <span className="font-semibold text-slate-900">{systemInfo?.nodeVersion || process.version}</span></div>
          <div>Security Model: <span className="font-semibold text-indigo-600">Single-Workspace Local Dev</span></div>
          <div>Environment: <span className="font-semibold text-slate-900">{systemInfo?.environment || 'development'}</span></div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        title="Reset Demo Data"
        message="This will reset all custom workflows and execution logs back to initial factory demo seed records. Database migrations and non-secret application settings will be preserved."
        confirmLabel="Reset Data"
        isDestructive
        onConfirm={handleResetDemoData}
        onCancel={() => setIsResetConfirmOpen(false)}
      />
    </div>
  );
};
