import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { StatCard } from '../components/common/StatCard';
import { StatusBadge } from '../components/common/StatusBadge';
import { WorkflowService } from '../features/workflows/workflow.service';
import { ExecutionService } from '../features/executions/execution.service';
import { Workflow } from '../features/workflows/workflow.types';
import { Execution } from '../features/executions/execution.types';
import { formatDate, formatRelativeTime, formatDuration } from '../lib/date';
import {
  GitFork,
  CheckCircle,
  PlaySquare,
  AlertTriangle,
  Plus,
  ArrowRight,
  Sparkles,
  ExternalLink,
  Zap,
} from 'lucide-react';

export const DashboardPage: React.FC = () => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [executions, setExecutions] = useState<Execution[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setWorkflows(WorkflowService.listWorkflows());
    setExecutions(ExecutionService.listExecutions());
  };

  const handleCreateWorkflow = () => {
    const wf = WorkflowService.createWorkflow({
      name: `Pipeline_${Math.floor(Math.random() * 900 + 100)}`,
      description: 'Newly initialized DAG automation',
    });
    navigate(`/builder/${wf.id}`);
  };

  const totalWorkflows = workflows.length;
  const activeWorkflows = workflows.filter((w) => w.status === 'published').length;
  const totalExecutions = executions.length;
  const failedExecutions = executions.filter((e) => e.status === 'Failed').length;
  const successRate = totalExecutions > 0
    ? `${Math.round(((totalExecutions - failedExecutions) / totalExecutions) * 100)}%`
    : '100%';

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8">
      {/* Page Header */}
      <PageHeader
        title="Engine Overview"
        description="Directed Acyclic Graph (DAG) orchestration metrics, execution history, and automation pipelines."
        actions={
          <button
            onClick={handleCreateWorkflow}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create Workflow</span>
          </button>
        }
      />

      {/* Metrics Banner */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Workflows"
          value={totalWorkflows}
          description="Stored in local registry"
          icon={GitFork}
          accentColor="indigo"
        />
        <StatCard
          label="Published Workflows"
          value={activeWorkflows}
          description="Ready for live triggers"
          icon={CheckCircle}
          accentColor="emerald"
        />
        <StatCard
          label="Recent Executions"
          value={totalExecutions}
          description={`Success rate: ${successRate}`}
          icon={PlaySquare}
          accentColor="slate"
        />
        <StatCard
          label="Failed Runs"
          value={failedExecutions}
          description={failedExecutions > 0 ? 'Requires attention' : 'All runs nominal'}
          icon={AlertTriangle}
          accentColor={failedExecutions > 0 ? 'rose' : 'emerald'}
        />
      </div>

      {/* Recent Workflows & Executions Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Recent Workflows (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Workflows</h3>
              <p className="text-xs text-slate-500 mt-0.5">Recently edited automation graphs</p>
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
            {workflows.slice(0, 5).map((wf) => (
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
                  <p className="text-[11px] text-slate-500 truncate mt-0.5 max-w-md">
                    {wf.description}
                  </p>
                  <div className="flex items-center gap-3 mt-1.5 text-[10px] text-slate-400 font-mono">
                    <span>{wf.nodes.length} nodes · {wf.edges.length} edges</span>
                    <span>v{wf.draftVersion}</span>
                    <span>Updated {formatRelativeTime(wf.updatedAt)}</span>
                  </div>
                </div>

                <div className="text-slate-400 group-hover:text-indigo-600 transition shrink-0">
                  <ArrowRight className="w-4 h-4" />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Executions (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden flex flex-col">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div>
              <h3 className="text-sm font-bold text-slate-900">Recent Runs</h3>
              <p className="text-xs text-slate-500 mt-0.5">Execution logs and results</p>
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
            {executions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                No runs recorded yet. Execute a workflow in the builder to generate logs.
              </div>
            ) : (
              executions.slice(0, 5).map((exec) => (
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
