import React, { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { apiClient, DashboardSummary } from '../lib/api-client';
import { WorkflowService } from '../features/workflows/workflow.service';
import { ExecutionService } from '../features/executions/execution.service';
import { formatRelativeTime, formatDuration } from '../lib/date';
import {
  GitFork,
  CheckCircle,
  PlaySquare,
  AlertTriangle,
  Plus,
  ArrowRight,
  RefreshCw,
  Server,
  Zap,
  Activity,
  Layers,
  Clock,
} from 'lucide-react';

type TimePeriod = '24h' | '7d' | '30d' | 'all';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [period, setPeriod] = useState<TimePeriod>('24h');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [isBackendConnected, setIsBackendConnected] = useState<boolean>(true);

  const fetchDashboardData = useCallback(async (selectedPeriod: TimePeriod = period, showRefreshSpin = false) => {
    if (showRefreshSpin) setIsRefreshing(true);
    else setIsLoading(true);
    setError(null);

    try {
      const res = await apiClient.getDashboardSummary(selectedPeriod);
      if (res.success && res.data) {
        setSummary(res.data);
        setIsBackendConnected(true);
      } else {
        throw new Error(res.error?.message || 'Failed to fetch dashboard summary');
      }
    } catch (err: any) {
      // Graceful fallback to local adapter if backend is offline
      setIsBackendConnected(false);
      try {
        const localWorkflows = WorkflowService.listWorkflows();
        const localExecutions = ExecutionService.listExecutions();

        const activeWfs = localWorkflows.filter((w) => w.status === 'published').length;
        const draftWfs = localWorkflows.filter((w) => w.status === 'draft').length;
        const pausedWfs = localWorkflows.filter((w) => w.status === 'paused').length;

        const totalExecs = localExecutions.length;
        const successExecs = localExecutions.filter((e) => e.status === 'Succeeded').length;
        const failedExecs = localExecutions.filter((e) => e.status === 'Failed').length;
        const runningExecs = localExecutions.filter((e) => e.status === 'Running').length;
        const finished = successExecs + failedExecs;
        const successRate = finished > 0 ? Math.round((successExecs / finished) * 1000) / 10 : 0;

        setSummary({
          totalWorkflows: localWorkflows.length,
          activeWorkflows: activeWfs,
          draftWorkflows: draftWfs,
          pausedWorkflows: pausedWfs,
          period: selectedPeriod,
          periodStart: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
          periodEnd: new Date().toISOString(),
          totalExecutions: totalExecs,
          successfulExecutions: successExecs,
          failedExecutions: failedExecs,
          runningExecutions: runningExecs,
          executionSuccessRate: successRate,
          recentWorkflows: localWorkflows.slice(0, 5).map((w) => ({
            id: w.id,
            name: w.name,
            description: w.description,
            status: w.status,
            draftVersion: w.draftVersion,
            publishedVersion: w.publishedVersion,
            nodeCount: w.nodes.length,
            edgeCount: w.edges.length,
            updatedAt: w.updatedAt,
            createdAt: w.createdAt,
          })),
          recentExecutions: localExecutions.slice(0, 5).map((e) => ({
            id: e.id,
            workflowId: e.workflowId,
            workflowName: e.workflowName,
            workflowVersion: e.workflowVersion,
            triggerType: e.triggerType,
            status: e.status,
            startedAt: e.startedAt,
            completedAt: e.completedAt || null,
            durationMs: e.durationMs,
            error: e.error,
          })),
        });
      } catch (fallbackErr: any) {
        setError(err.message || 'Unable to load dashboard data');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [period]);

  useEffect(() => {
    fetchDashboardData(period);
  }, [period, fetchDashboardData]);

  const handlePeriodChange = (newPeriod: TimePeriod) => {
    setPeriod(newPeriod);
  };

  const handleCreateWorkflow = async () => {
    try {
      const res = await apiClient.createWorkflow({
        name: `Pipeline_${Math.floor(Math.random() * 900 + 100)}`,
        description: 'Visual DAG workflow automation',
        status: 'draft',
        nodes: [
          {
            id: `node_trig_${Date.now()}`,
            type: 'trigger',
            label: 'Manual Trigger',
            position: { x: 100, y: 150 },
            config: { triggerType: 'manual', defaultPayload: { initiatedBy: 'dashboard' } },
          },
        ],
        edges: [],
      });

      if (res.success && res.data) {
        navigate(`/builder/${res.data.id}`);
        return;
      }
    } catch (_err) {
      // Local fallback
    }

    const localWf = WorkflowService.createWorkflow({
      name: `Pipeline_${Math.floor(Math.random() * 900 + 100)}`,
      description: 'Newly initialized DAG automation',
    });
    navigate(`/builder/${localWf.id}`);
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Page Header */}
      <PageHeader
        title="Engine Overview"
        description="Real-time DAG orchestration metrics, execution results, and active workflow telemetry."
        badge={
          <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold border bg-white shadow-2xs">
            <span
              className={`w-2 h-2 rounded-full ${
                isBackendConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-400'
              }`}
            />
            <span className={isBackendConnected ? 'text-slate-700' : 'text-amber-700'}>
              {isBackendConnected ? 'API Connected' : 'Local Storage Fallback'}
            </span>
          </div>
        }
        actions={
          <div className="flex items-center gap-3">
            {/* Period Selector */}
            <div className="inline-flex rounded-lg p-0.5 bg-slate-100 border border-slate-200/80 text-xs font-medium text-slate-600">
              {(['24h', '7d', '30d', 'all'] as TimePeriod[]).map((p) => (
                <button
                  key={p}
                  onClick={() => handlePeriodChange(p)}
                  className={`px-2.5 py-1 rounded-md transition ${
                    period === p
                      ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                      : 'hover:text-slate-900'
                  }`}
                >
                  {p === '24h' ? '24 Hours' : p === '7d' ? '7 Days' : p === '30d' ? '30 Days' : 'All Time'}
                </button>
              ))}
            </div>

            {/* Refresh Button */}
            <button
              onClick={() => fetchDashboardData(period, true)}
              disabled={isLoading || isRefreshing}
              className="p-2 text-slate-500 hover:text-slate-800 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 shadow-2xs transition disabled:opacity-50"
              title="Refresh telemetry"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
            </button>

            {/* Create Workflow Button */}
            <button
              onClick={handleCreateWorkflow}
              className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition"
            >
              <Plus className="w-4 h-4" />
              <span>Create Workflow</span>
            </button>
          </div>
        }
      />

      {/* Error Alert State */}
      {error && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/70 flex items-center justify-between text-rose-800 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchDashboardData(period)}
            className="px-3 py-1 font-semibold text-rose-700 hover:bg-rose-100/80 rounded-md transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Metrics Banner */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-pulse">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-28 bg-slate-100 rounded-xl border border-slate-200" />
          ))}
        </div>
      ) : summary ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Total Workflows"
            value={summary.totalWorkflows}
            description={`${summary.activeWorkflows} published · ${summary.draftWorkflows} draft`}
            icon={GitFork}
            accentColor="indigo"
          />
          <StatCard
            label="Active Pipelines"
            value={summary.activeWorkflows}
            description="Trigger-ready DAGs"
            icon={CheckCircle}
            accentColor="emerald"
          />
          <StatCard
            label={`Executions (${period.toUpperCase()})`}
            value={summary.totalExecutions}
            description={`${summary.runningExecutions} running · ${summary.failedExecutions} failed`}
            icon={PlaySquare}
            accentColor="slate"
          />
          <StatCard
            label="Success Rate"
            value={`${summary.executionSuccessRate}%`}
            description={
              summary.totalExecutions > 0
                ? `${summary.successfulExecutions} succeeded of ${summary.successfulExecutions + summary.failedExecutions} finished`
                : 'No finished runs in period'
            }
            icon={Activity}
            accentColor={summary.failedExecutions > 0 ? 'rose' : 'emerald'}
          />
        </div>
      ) : null}

      {/* Recent Workflows & Executions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Workflows (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="w-4 h-4 text-slate-500" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Workflows</h3>
                <p className="text-xs text-slate-500 mt-0.5">Recently edited automation graphs</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/workflows')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition"
            >
              <span>View all</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {isLoading ? (
              <div className="p-8 space-y-4 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-slate-50 rounded-lg" />
                ))}
              </div>
            ) : !summary || summary.recentWorkflows.length === 0 ? (
              /* Empty Workflows State */
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mb-3">
                  <GitFork className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-slate-800">No workflows found</h4>
                <p className="text-xs text-slate-500 max-w-sm mt-1 mb-4">
                  Initialize your first directed acyclic graph to connect triggers, HTTP APIs, and transformations.
                </p>
                <button
                  onClick={handleCreateWorkflow}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Create First Workflow</span>
                </button>
              </div>
            ) : (
              summary.recentWorkflows.map((wf) => (
                <div
                  key={wf.id}
                  onClick={() => navigate(`/builder/${wf.id}`)}
                  className="p-4 hover:bg-slate-50/70 transition flex items-center justify-between gap-4 cursor-pointer group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-xs text-slate-900 group-hover:text-indigo-600 transition-colors truncate">
                        {wf.name}
                      </span>
                      <StatusBadge status={wf.status} size="sm" />
                    </div>
                    {wf.description && (
                      <p className="text-[11px] text-slate-500 truncate mt-0.5 max-w-md">
                        {wf.description}
                      </p>
                    )}
                    <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 font-mono">
                      <span>{wf.nodeCount} nodes · {wf.edgeCount} edges</span>
                      <span>v{wf.draftVersion}</span>
                      <span>Updated {formatRelativeTime(wf.updatedAt)}</span>
                    </div>
                  </div>

                  <div className="text-slate-400 group-hover:text-indigo-600 transition shrink-0">
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Recent Executions (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-slate-500" />
              <div>
                <h3 className="text-sm font-bold text-slate-900">Recent Runs</h3>
                <p className="text-xs text-slate-500 mt-0.5">Execution logs and results</p>
              </div>
            </div>
            <button
              onClick={() => navigate('/runs')}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1 transition"
            >
              <span>History</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="divide-y divide-slate-100 flex-1">
            {isLoading ? (
              <div className="p-8 space-y-4 animate-pulse">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-12 bg-slate-50 rounded-lg" />
                ))}
              </div>
            ) : !summary || summary.recentExecutions.length === 0 ? (
              /* Empty Executions State */
              <div className="p-12 text-center flex flex-col items-center justify-center">
                <div className="w-12 h-12 rounded-full bg-slate-50 border border-slate-100 flex items-center justify-center text-slate-400 mb-3">
                  <PlaySquare className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-semibold text-slate-800">No runs recorded</h4>
                <p className="text-xs text-slate-500 max-w-xs mt-1 mb-4">
                  Execute a workflow in the DAG Builder or dispatch an inbound webhook trigger to generate runs.
                </p>
                <button
                  onClick={() => navigate('/workflows')}
                  className="inline-flex items-center gap-2 px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition"
                >
                  <span>Select Workflow</span>
                  <ArrowRight className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              summary.recentExecutions.map((exec) => (
                <div
                  key={exec.id}
                  onClick={() => navigate(`/runs/${exec.id}`)}
                  className="p-4 hover:bg-slate-50/70 transition flex items-center justify-between gap-3 cursor-pointer group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-xs font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors">
                        #{exec.id.substring(0, 10)}
                      </span>
                      <StatusBadge status={exec.status} size="sm" />
                    </div>
                    <p className="text-xs text-slate-600 truncate mt-0.5">
                      {exec.workflowName}
                    </p>
                    <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-400">
                      <span>{formatRelativeTime(exec.startedAt)}</span>
                      <span>·</span>
                      <span>{formatDuration(exec.durationMs)}</span>
                      <span>·</span>
                      <span className="font-mono text-[10px] uppercase text-slate-500">{exec.triggerType}</span>
                    </div>
                  </div>

                  <ArrowRight className="w-4 h-4 text-slate-400 group-hover:text-indigo-600 transition shrink-0" />
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
