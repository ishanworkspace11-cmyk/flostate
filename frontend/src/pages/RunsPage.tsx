import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { EmptyState } from '../components/common/EmptyState';
import { apiClient } from '../lib/api-client';
import { ExecutionService } from '../features/executions/execution.service';
import { ExecutionSummary, ExecutionStatus } from '../features/executions/execution.types';
import { formatDate, formatDuration, formatRelativeTime } from '../lib/date';
import {
  PlaySquare,
  Search,
  RefreshCw,
  ExternalLink,
  AlertCircle,
  Clock,
  Layers,
  ChevronLeft,
  ChevronRight,
  Filter,
  ArrowUpDown,
  Radio,
  CheckCircle2,
  XCircle,
  HelpCircle,
} from 'lucide-react';

export const RunsPage: React.FC = () => {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  // Query & Filter states initialized from URL or defaults
  const [page, setPage] = useState<number>(() => parseInt(searchParams.get('page') || '1', 10));
  const [limit] = useState<number>(15);
  const [searchQuery, setSearchQuery] = useState<string>(() => searchParams.get('search') || '');
  const [statusFilter, setStatusFilter] = useState<string>(() => searchParams.get('status') || 'all');
  const [triggerFilter, setTriggerFilter] = useState<string>(() => searchParams.get('trigger') || 'all');
  const [sortBy, setSortBy] = useState<string>(() => searchParams.get('sortBy') || 'startedAt');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>(() => (searchParams.get('sortOrder') as any) || 'desc');
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Data & UI states
  const [executions, setExecutions] = useState<ExecutionSummary[]>([]);
  const [total, setTotal] = useState<number>(0);
  const [totalPages, setTotalPages] = useState<number>(1);
  const [loading, setLoading] = useState<boolean>(true);
  const [refreshing, setRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  const searchDebounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync state to URL search parameters
  useEffect(() => {
    const params = new URLSearchParams();
    if (page > 1) params.set('page', String(page));
    if (searchQuery) params.set('search', searchQuery);
    if (statusFilter !== 'all') params.set('status', statusFilter);
    if (triggerFilter !== 'all') params.set('trigger', triggerFilter);
    if (sortBy !== 'startedAt') params.set('sortBy', sortBy);
    if (sortOrder !== 'desc') params.set('sortOrder', sortOrder);
    setSearchParams(params, { replace: true });
  }, [page, searchQuery, statusFilter, triggerFilter, sortBy, sortOrder, setSearchParams]);

  // Load executions from backend API with fallback
  const fetchExecutions = useCallback(
    async (isBackground = false) => {
      if (!isBackground) {
        setLoading(true);
      } else {
        setRefreshing(true);
      }
      setError(null);

      try {
        const res = await apiClient.listExecutions({
          page,
          limit,
          status: statusFilter !== 'all' ? statusFilter : undefined,
          triggerType: triggerFilter !== 'all' ? triggerFilter : undefined,
          search: searchQuery.trim() || undefined,
          sortBy,
          sortOrder,
        });

        if (res.success && Array.isArray(res.data)) {
          setExecutions(res.data);
          setTotal(res.meta?.total ?? res.data.length);
          setTotalPages(res.meta?.totalPages ?? (Math.ceil((res.meta?.total ?? res.data.length) / limit) || 1));
        } else {
          throw new Error(res.error?.message || 'Failed to load execution records');
        }
      } catch (err: any) {
        // Fallback to local storage
        try {
          const localData = ExecutionService.listExecutions();
          let filtered = localData.map((e) => ({
            id: e.id,
            workflowId: e.workflowId,
            workflowName: e.workflowName,
            workflowVersion: e.workflowVersion,
            triggerType: e.triggerType,
            status: e.status,
            startedAt: e.startedAt,
            completedAt: e.completedAt,
            durationMs: e.durationMs,
            error: e.error,
            nodeCount: Object.keys(e.nodeExecutions || {}).length,
            completedNodeCount: Object.values(e.nodeExecutions || {}).filter((n) => n.status === 'Succeeded').length,
          }));

          if (statusFilter !== 'all') {
            filtered = filtered.filter((r) => r.status.toLowerCase() === statusFilter.toLowerCase());
          }
          if (triggerFilter !== 'all') {
            filtered = filtered.filter((r) => r.triggerType.toLowerCase() === triggerFilter.toLowerCase());
          }
          if (searchQuery.trim()) {
            const q = searchQuery.toLowerCase();
            filtered = filtered.filter(
              (r) =>
                r.id.toLowerCase().includes(q) ||
                r.workflowName.toLowerCase().includes(q) ||
                (r.error && r.error.toLowerCase().includes(q))
            );
          }

          setExecutions(filtered.slice((page - 1) * limit, page * limit));
          setTotal(filtered.length);
          setTotalPages(Math.ceil(filtered.length / limit) || 1);
          setError('Backend offline; viewing cached local executions.');
        } catch (_localErr) {
          setError(err?.message || 'Failed to connect to execution service');
        }
      } finally {
        setLoading(false);
        setRefreshing(false);
      }
    },
    [page, limit, statusFilter, triggerFilter, searchQuery, sortBy, sortOrder]
  );

  // Initial and reactive fetch
  useEffect(() => {
    fetchExecutions();
  }, [fetchExecutions]);

  // Live Auto-Refresh polling (every 3 seconds if active or contains running jobs)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      // Background poll without showing full loading skeleton
      fetchExecutions(true);
    }, 3000);

    return () => clearInterval(interval);
  }, [autoRefresh, fetchExecutions]);

  // Handle Search Input with Debounce
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setSearchQuery(val);
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    searchDebounceRef.current = setTimeout(() => {
      setPage(1);
    }, 300);
  };

  const handleClearFilters = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setTriggerFilter('all');
    setSortBy('startedAt');
    setSortOrder('desc');
    setPage(1);
  };

  const hasActiveFilters = searchQuery !== '' || statusFilter !== 'all' || triggerFilter !== 'all';

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Execution History"
        description="Audit logs, step timings, and status traces for all DAG runs."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Runs' }]}
        actions={
          <div className="flex items-center gap-2">
            {/* Live Auto-Refresh Toggle */}
            <button
              onClick={() => setAutoRefresh(!autoRefresh)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                autoRefresh
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
              }`}
              title="Toggle live execution polling every 3 seconds"
            >
              <Radio className={`w-3.5 h-3.5 ${autoRefresh ? 'animate-pulse text-emerald-600' : 'text-slate-400'}`} />
              <span>{autoRefresh ? 'Live Polling' : 'Live Paused'}</span>
            </button>

            {/* Manual Refresh Button */}
            <button
              onClick={() => fetchExecutions(false)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${refreshing ? 'animate-spin text-indigo-600' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        }
      />

      {/* Error & Offline Alert */}
      {error && (
        <div className="flex items-center justify-between p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-800">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => fetchExecutions(false)}
            className="font-medium underline hover:text-amber-900 ml-4 shrink-0"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="space-y-3 bg-white p-4 rounded-xl border border-slate-200/90 shadow-2xs">
        <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
          {/* Search Input */}
          <div className="relative flex-1 max-w-md">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by Run ID, workflow name, error..."
              value={searchQuery}
              onChange={handleSearchChange}
              className="w-full pl-9 pr-8 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
            />
            {searchQuery && (
              <button
                onClick={() => {
                  setSearchQuery('');
                  setPage(1);
                }}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs"
              >
                ✕
              </button>
            )}
          </div>

          {/* Trigger & Sort Selectors */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Trigger Filter Dropdown */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
              <span className="text-slate-400 font-medium text-[11px]">Trigger:</span>
              <select
                value={triggerFilter}
                onChange={(e) => {
                  setTriggerFilter(e.target.value);
                  setPage(1);
                }}
                className="bg-transparent text-slate-700 font-medium focus:outline-hidden text-xs cursor-pointer"
              >
                <option value="all">All Triggers</option>
                <option value="manual">Manual</option>
                <option value="webhook">Webhook</option>
                <option value="cron">Cron</option>
              </select>
            </div>

            {/* Sort Selector */}
            <div className="flex items-center gap-1.5 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1 text-xs">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-400" />
              <select
                value={`${sortBy}:${sortOrder}`}
                onChange={(e) => {
                  const [field, order] = e.target.value.split(':');
                  setSortBy(field);
                  setSortOrder(order as any);
                  setPage(1);
                }}
                className="bg-transparent text-slate-700 font-medium focus:outline-hidden text-xs cursor-pointer"
              >
                <option value="startedAt:desc">Newest First</option>
                <option value="startedAt:asc">Oldest First</option>
                <option value="durationMs:desc">Duration (Longest)</option>
                <option value="durationMs:asc">Duration (Shortest)</option>
                <option value="workflowName:asc">Workflow (A-Z)</option>
              </select>
            </div>

            {hasActiveFilters && (
              <button
                onClick={handleClearFilters}
                className="text-xs text-indigo-600 hover:text-indigo-800 font-medium px-2 py-1"
              >
                Reset
              </button>
            )}
          </div>
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200/80 text-xs font-medium overflow-x-auto">
          {[
            { id: 'all', label: 'All Statuses' },
            { id: 'Running', label: 'Running', dot: 'bg-blue-500 animate-pulse' },
            { id: 'Succeeded', label: 'Succeeded', dot: 'bg-emerald-500' },
            { id: 'Failed', label: 'Failed', dot: 'bg-rose-500' },
            { id: 'Skipped', label: 'Skipped', dot: 'bg-slate-400' },
          ].map((item) => (
            <button
              key={item.id}
              onClick={() => {
                setStatusFilter(item.id);
                setPage(1);
              }}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-md transition text-xs whitespace-nowrap ${
                statusFilter.toLowerCase() === item.id.toLowerCase()
                  ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {item.dot && <span className={`w-2 h-2 rounded-full ${item.dot}`} />}
              <span>{item.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Runs Table or Empty/Loading View */}
      {loading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-2xs space-y-3">
          <div className="animate-pulse space-y-3">
            {[...Array(6)].map((_, i) => (
              <div key={i} className="h-10 bg-slate-100 rounded-lg w-full" />
            ))}
          </div>
        </div>
      ) : executions.length > 0 ? (
        <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase font-mono tracking-wider text-[11px]">
                  <th className="py-3 px-4 font-semibold">Run ID</th>
                  <th className="py-3 px-4 font-semibold">Workflow</th>
                  <th className="py-3 px-4 font-semibold">Trigger</th>
                  <th className="py-3 px-4 font-semibold">Status</th>
                  <th className="py-3 px-4 font-semibold">Steps</th>
                  <th className="py-3 px-4 font-semibold">Duration</th>
                  <th className="py-3 px-4 font-semibold">Started At</th>
                  <th className="py-3 px-4 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {executions.map((run) => (
                  <tr
                    key={run.id}
                    onClick={() => navigate(`/runs/${run.id}`)}
                    className="hover:bg-slate-50/70 transition cursor-pointer group"
                  >
                    {/* Run ID */}
                    <td className="py-3.5 px-4 font-mono font-semibold text-indigo-600 group-hover:underline whitespace-nowrap">
                      #{run.id.substring(0, 10)}
                    </td>

                    {/* Workflow Name & Version */}
                    <td className="py-3.5 px-4 font-semibold text-slate-900 max-w-xs truncate">
                      {run.workflowName}
                      <span className="text-slate-400 font-mono text-[11px] ml-1.5 font-normal">
                        v{run.workflowVersion}
                      </span>
                      {run.error && (
                        <span className="block text-[11px] text-rose-600 font-normal truncate mt-0.5">
                          {run.error}
                        </span>
                      )}
                    </td>

                    {/* Trigger Kind */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <span className="font-mono text-[11px] bg-slate-100 text-slate-700 px-2 py-0.5 rounded border border-slate-200 uppercase">
                        {run.triggerType}
                      </span>
                    </td>

                    {/* Execution Status Badge */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <StatusBadge status={run.status} size="sm" />
                    </td>

                    {/* Node / Step Completion Ratio */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-slate-600">
                      <span className="inline-flex items-center gap-1 font-mono text-[11px]">
                        <Layers className="w-3 h-3 text-slate-400" />
                        <span>
                          {run.completedNodeCount !== undefined && run.nodeCount !== undefined
                            ? `${run.completedNodeCount}/${run.nodeCount}`
                            : '—'}
                        </span>
                      </span>
                    </td>

                    {/* Duration */}
                    <td className="py-3.5 px-4 font-mono text-slate-600 whitespace-nowrap">
                      <span className="inline-flex items-center gap-1">
                        <Clock className="w-3 h-3 text-slate-400" />
                        {run.status === 'Running' ? (
                          <span className="text-blue-600 animate-pulse">Running...</span>
                        ) : (
                          formatDuration(run.durationMs)
                        )}
                      </span>
                    </td>

                    {/* Started At Timestamp */}
                    <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                      <span>{formatDate(run.startedAt)}</span>
                      <span className="text-[10px] text-slate-400 block font-mono">
                        {formatRelativeTime(run.startedAt)}
                      </span>
                    </td>

                    {/* Action */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <span className="inline-flex items-center gap-1 text-slate-400 group-hover:text-indigo-600 transition text-xs font-medium">
                        <span>Details</span>
                        <ExternalLink className="w-3.5 h-3.5" />
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          <div className="flex flex-col sm:flex-row items-center justify-between px-4 py-3 bg-slate-50/75 border-t border-slate-200 text-xs text-slate-600 gap-3">
            <div>
              Showing <span className="font-semibold text-slate-900">{(page - 1) * limit + 1}</span> to{' '}
              <span className="font-semibold text-slate-900">{Math.min(page * limit, total)}</span> of{' '}
              <span className="font-semibold text-slate-900">{total}</span> executions
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition"
              >
                <ChevronLeft className="w-3.5 h-3.5" />
                <span>Previous</span>
              </button>

              <span className="font-medium px-2">
                Page {page} of {totalPages}
              </span>

              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-white border border-slate-200 rounded-md hover:bg-slate-50 disabled:opacity-40 disabled:cursor-not-allowed shadow-2xs transition"
              >
                <span>Next</span>
                <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <EmptyState
          icon={PlaySquare}
          title={hasActiveFilters ? 'No matching runs found' : 'No execution history'}
          description={
            hasActiveFilters
              ? 'Try modifying your search query or relaxing your status and trigger filters.'
              : 'Launch a workflow execution from the builder or workflows table to inspect recorded traces.'
          }
          action={
            hasActiveFilters
              ? {
                  label: 'Clear Filters',
                  onClick: handleClearFilters,
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
