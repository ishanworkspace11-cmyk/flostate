import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { ExecutionService } from '../features/executions/execution.service';
import { Execution, ExecutionStatus } from '../features/executions/execution.types';
import { formatDate, formatDuration, formatRelativeTime } from '../lib/date';
import { PlaySquare, Search, RefreshCw, ExternalLink, AlertCircle, Clock } from 'lucide-react';

export const RunsPage: React.FC = () => {
  const navigate = useNavigate();
  const [executions, setExecutions] = useState<Execution[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  useEffect(() => {
    loadExecutions();
  }, []);

  const loadExecutions = () => {
    setExecutions(ExecutionService.listExecutions());
  };

  const filteredRuns = executions.filter((run) => {
    const matchesSearch =
      run.id.toLowerCase().includes(searchQuery.toLowerCase()) ||
      run.workflowName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      run.triggerType.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || run.status.toLowerCase() === statusFilter.toLowerCase();
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Execution History"
        description="Audit logs, step timings, and status traces for all DAG runs."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Runs' }]}
        actions={
          <button
            onClick={loadExecutions}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search by Run ID, workflow, trigger..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium overflow-x-auto max-w-full">
          {['all', 'Succeeded', 'Failed', 'Running', 'Skipped'].map((status) => (
            <button
              key={status}
              onClick={() => setStatusFilter(status)}
              className={`px-2.5 py-1 rounded-md transition text-xs whitespace-nowrap ${
                statusFilter.toLowerCase() === status.toLowerCase()
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {status}
            </button>
          ))}
        </div>
      </div>

      {/* Runs Table */}
      {filteredRuns.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase font-mono tracking-wider text-[11px]">
                  <th className="py-3 px-4 font-semibold">Run ID</th>
                  <th className="py-3 px-4 font-semibold">Workflow</th>
                  <th className="py-3 px-4 font-semibold">Trigger</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Duration</th>
                  <th className="py-3 px-4 font-semibold">Started At</th>
                  <th className="py-3 px-4 font-semibold text-right">Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredRuns.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => navigate(`/runs/${run.id}`)}
                    className="hover:bg-slate-50/70 transition cursor-pointer group"
                  >
                    <td className="py-3.5 px-4 font-mono font-semibold text-indigo-600 group-hover:underline">
                      #{run.id.substring(0, 10)}
                    </td>
                    <td className="py-3.5 px-4 font-semibold text-slate-900">
                      {run.workflowName}
                      <span className="text-slate-400 font-mono text-[11px] ml-1.5">
                        v{run.workflowVersion}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 uppercase">
                        {run.triggerType}
                      </span>
                    </td>
                    <td className="py-3.5 px-4">
                      <StatusBadge status={run.status} size="sm" />
                    </td>
                    <td className="py-3.5 px-4 font-mono text-slate-600">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {formatDuration(run.durationMs)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                      {formatDate(run.startedAt)}
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {formatRelativeTime(run.startedAt)}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <span className="inline-flex items-center gap-1 text-slate-400 group-hover:text-indigo-600 transition text-xs font-medium">
                        <span>Inspect</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={PlaySquare}
          title={searchQuery || statusFilter !== 'all' ? 'No matching runs found' : 'No execution history'}
          description={
            searchQuery || statusFilter !== 'all'
              ? 'Try modifying your search query or status filter.'
              : 'Launch a workflow execution from the builder or workflows table to inspect recorded traces.'
          }
          action={
            searchQuery || statusFilter !== 'all'
              ? {
                  label: 'Clear Filters',
                  onClick: () => {
                    setSearchQuery('');
                    setStatusFilter('all');
                  },
                }
              : {
                  label: 'Go to Workflows',
                  onClick: () => navigate('/workflows'),
                }
          }
        />
      )}
    </div>
  );
};
