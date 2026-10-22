import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Link } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { StatCard } from '../components/common/StatCard';
import { WorkerService } from '../features/workers/worker.service';
import {
  WorkerInstance,
  WorkerQueueSummary,
  SystemExecutionHealth,
  WorkerEvent,
} from '../features/workers/worker.types';
import { formatDate, formatRelativeTime } from '../lib/date';
import {
  Cpu,
  Server,
  Layers,
  Activity,
  ShieldAlert,
  RefreshCw,
  Terminal,
  X,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ExternalLink,
  Copy,
  Check,
  Info,
  ListFilter,
  Play,
  Zap,
} from 'lucide-react';

export const WorkersPage: React.FC = () => {
  const [workers, setWorkers] = useState<WorkerInstance[]>([]);
  const [queues, setQueues] = useState<WorkerQueueSummary[]>([]);
  const [health, setHealth] = useState<SystemExecutionHealth | null>(null);
  const [events, setEvents] = useState<WorkerEvent[]>([]);
  const [selectedWorker, setSelectedWorker] = useState<WorkerInstance | null>(null);
  const [showEventsDrawer, setShowEventsDrawer] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);

  const isVisibleRef = useRef(true);

  // Load telemetry data from live backend
  const loadData = useCallback(async (isBackground = false) => {
    if (!isBackground) setIsRefreshing(true);
    setError(null);

    try {
      if (isDemoMode) {
        setWorkers(WorkerService.getDemoWorkers());
        setQueues(WorkerService.getDemoQueues());
        setHealth({
          status: 'healthy',
          totalWorkers: 4,
          onlineWorkers: 4,
          drainingWorkers: 0,
          staleWorkers: 0,
          offlineWorkers: 0,
          totalQueueDepth: 1,
          activeJobsCount: 1,
          redisConnected: true,
          runnerMode: 'bullmq-distributed',
          timestamp: new Date().toISOString(),
        });
      } else {
        const [workerList, queueList, healthStatus, eventList] = await Promise.all([
          WorkerService.getWorkers({ includeSimulated: false }),
          WorkerService.getQueues(),
          WorkerService.getHealth(),
          WorkerService.getEvents({ limit: 30 }),
        ]);

        setWorkers(workerList);
        setQueues(queueList);
        setHealth(healthStatus);
        setEvents(eventList);
      }
      setLastUpdated(new Date());
    } catch (err: any) {
      setError(err?.message || 'Failed to load worker cluster telemetry');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [isDemoMode]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Periodic 5s polling, paused when tab is inactive / hidden
  useEffect(() => {
    const handleVisibilityChange = () => {
      isVisibleRef.current = document.visibilityState === 'visible';
      if (isVisibleRef.current) {
        loadData(true);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    const interval = setInterval(() => {
      if (isVisibleRef.current && !isLoading) {
        loadData(true);
      }
    }, 5000);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearInterval(interval);
    };
  }, [loadData, isLoading]);

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCmd(label);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const totalWorkers = workers.length;
  const onlineWorkers = workers.filter((w) => w.status === 'idle' || w.status === 'busy').length;
  const busyWorkers = workers.filter((w) => w.status === 'busy').length;
  const staleWorkers = workers.filter((w) => w.status === 'stale').length;
  const totalCompletedJobs = workers.reduce((acc, w) => acc + w.completedJobsCount, 0);
  const totalQueueBacklog = queues.reduce((acc, q) => acc + q.waitingCount, 0);
  const totalActiveJobs = queues.reduce((acc, q) => acc + q.activeCount, 0) || busyWorkers;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Distributed Workers & Queues"
        description="Inspect execution node workers, Redis queue backlogs, concurrency, and task dispatch health."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Workers' }]}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowGuideModal(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition"
            >
              <Terminal className="w-3.5 h-3.5 text-indigo-600" />
              <span>Launch Worker</span>
            </button>
            <button
              onClick={() => setShowEventsDrawer(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition"
            >
              <Radio className="w-3.5 h-3.5 text-slate-500" />
              <span>Cluster Events</span>
              {events.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full bg-slate-100 text-[10px] font-mono text-slate-600">
                  {events.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setIsDemoMode(!isDemoMode)}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-lg border transition ${
                isDemoMode
                  ? 'bg-amber-50 text-amber-800 border-amber-300 font-semibold'
                  : 'bg-white text-slate-600 hover:bg-slate-50 border-slate-200 shadow-2xs'
              }`}
            >
              <span>{isDemoMode ? 'Preview: Demo Active' : 'View Demo Cluster'}</span>
            </button>
            <button
              onClick={() => loadData(false)}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition disabled:opacity-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
              <span>Refresh</span>
            </button>
          </div>
        }
      />

      {/* Cluster Health & Live Telemetry Banner */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span
              className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                health?.status === 'healthy'
                  ? 'bg-emerald-500 animate-pulse'
                  : health?.status === 'degraded'
                  ? 'bg-amber-500'
                  : 'bg-rose-500 animate-ping'
              }`}
            />
            <span className="font-semibold text-slate-900 uppercase font-mono tracking-wider text-[11px]">
              Cluster Health: {health?.status || 'Active'}
            </span>
          </div>
          <span className="text-slate-300">|</span>
          <div className="flex items-center gap-1.5 text-slate-600">
            <Layers className="w-3.5 h-3.5 text-slate-400" />
            <span>Driver:</span>
            <span className="font-mono font-medium text-slate-800">
              {health?.runnerMode === 'bullmq-distributed'
                ? 'BullMQ Distributed (Redis)'
                : 'Local Durable In-Memory Queue'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-3 text-slate-500 font-mono text-[11px]">
          {isDemoMode && (
            <span className="px-2 py-0.5 rounded bg-amber-100 text-amber-800 font-medium border border-amber-200">
              DEMO PREVIEW
            </span>
          )}
          {lastUpdated && (
            <span>
              Updated {lastUpdated.toLocaleTimeString()} (5s auto-refresh)
            </span>
          )}
        </div>
      </div>

      {/* Error Notice */}
      {error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center justify-between text-xs text-rose-800">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{error}</span>
          </div>
          <button
            onClick={() => loadData(false)}
            className="underline font-semibold hover:text-rose-900"
          >
            Retry
          </button>
        </div>
      )}

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Workers"
          value={totalWorkers}
          description={`${onlineWorkers} online${staleWorkers > 0 ? ` · ${staleWorkers} stale` : ''}`}
          icon={Server}
          accentColor={onlineWorkers > 0 ? 'emerald' : 'slate'}
        />
        <StatCard
          label="Active In-Flight Jobs"
          value={totalActiveJobs}
          description="Processing across worker pool"
          icon={Activity}
          accentColor={totalActiveJobs > 0 ? 'indigo' : 'slate'}
        />
        <StatCard
          label="Cumulative Tasks"
          value={totalCompletedJobs.toLocaleString()}
          description="Total completed DAG jobs"
          icon={Cpu}
          accentColor="slate"
        />
        <StatCard
          label="Queue Backlog"
          value={totalQueueBacklog}
          description="Waiting in task buffer"
          icon={Layers}
          accentColor={totalQueueBacklog > 0 ? 'amber' : 'slate'}
        />
      </div>

      {/* Queue Summary Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
              Task Queue Depths & Telemetry
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Task partitions monitored via BullMQ / queue engine
            </p>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
              {queues.some((q) => q.isExact) ? 'EXACT TELEMETRY' : 'ESTIMATED'}
            </span>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase font-mono tracking-wider text-[11px]">
                <th className="py-3 px-4 font-semibold">Queue Name</th>
                <th className="py-3 px-4 font-semibold">Driver</th>
                <th className="py-3 px-4 font-semibold">Active</th>
                <th className="py-3 px-4 font-semibold">Waiting</th>
                <th className="py-3 px-4 font-semibold">Delayed</th>
                <th className="py-3 px-4 font-semibold">Completed</th>
                <th className="py-3 px-4 font-semibold">Failed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {queues.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-6 text-center text-slate-400">
                    No active queues reported.
                  </td>
                </tr>
              ) : (
                queues.map((q) => (
                  <tr key={q.queueName} className="hover:bg-slate-50/60 transition">
                    <td className="py-3 px-4 font-semibold text-slate-800">
                      <div className="flex items-center gap-1.5">
                        <span>{q.queueName}</span>
                        {q.note && (
                          <span className="text-[10px] text-slate-400 font-normal truncate max-w-xs block">
                            ({q.note})
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="py-3 px-4">
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 uppercase font-semibold">
                        {q.driver || 'bullmq'}
                      </span>
                    </td>
                    <td className="py-3 px-4">
                      <span className={`font-bold ${q.activeCount > 0 ? 'text-indigo-600' : 'text-slate-500'}`}>
                        {q.activeCount}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{q.waitingCount}</td>
                    <td className="py-3 px-4 text-slate-600">{q.delayedCount}</td>
                    <td className="py-3 px-4 text-emerald-600 font-semibold">{q.completedCount}</td>
                    <td className="py-3 px-4 text-rose-600">{q.failedCount}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Workers Grid */}
      <div>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
              Connected Worker Nodes ({workers.length})
            </h3>
            <p className="text-[11px] text-slate-500">
              Autonomous execution processes reporting live heartbeats
            </p>
          </div>
        </div>

        {/* Empty State */}
        {workers.length === 0 && !isLoading && (
          <div className="bg-white rounded-xl border border-dashed border-slate-300 p-8 text-center space-y-4 shadow-2xs">
            <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mx-auto text-slate-500">
              <Server className="w-6 h-6" />
            </div>
            <div className="max-w-md mx-auto space-y-1">
              <h4 className="text-sm font-bold text-slate-900">No Worker Nodes Registered</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                No active execution workers are currently reporting heartbeats. Launch a worker process to start processing DAG jobs, or view the demo preview.
              </p>
            </div>
            <div className="flex items-center justify-center gap-3 pt-2">
              <button
                onClick={() => setShowGuideModal(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-2xs transition"
              >
                <Terminal className="w-3.5 h-3.5" />
                <span>Launch Worker Instructions</span>
              </button>
              <button
                onClick={() => setIsDemoMode(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition"
              >
                <span>View Demo Cluster</span>
              </button>
            </div>
          </div>
        )}

        {/* Worker Cards Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workers.map((worker) => (
            <div
              key={worker.id}
              onClick={() => setSelectedWorker(worker)}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4 hover:border-indigo-300 hover:shadow-xs transition cursor-pointer"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div
                    className={`p-2 rounded-lg border text-slate-700 ${
                      worker.status === 'busy'
                        ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                        : worker.status === 'draining'
                        ? 'bg-amber-50 border-amber-200 text-amber-700'
                        : worker.status === 'stale'
                        ? 'bg-orange-50 border-orange-200 text-orange-700'
                        : 'bg-slate-100 border-slate-200'
                    }`}
                  >
                    <Server className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                      <span>{worker.name}</span>
                    </h4>
                    <span className="text-[10px] text-slate-400 font-mono block">
                      {worker.hostname} · {worker.id}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {worker.isSimulated && (
                    <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-amber-50 text-amber-700 border border-amber-200 font-medium">
                      SIMULATED
                    </span>
                  )}
                  <StatusBadge status={worker.status} size="sm" />
                </div>
              </div>

              {/* Current Job or Idle */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                {worker.currentJobs && worker.currentJobs.length > 0 ? (
                  <div>
                    <span className="text-[10px] text-indigo-600 font-semibold uppercase font-mono block">
                      Active In-Flight Task
                    </span>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {worker.currentJobs[0].nodeLabel}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                      <Link
                        to={`/runs/${worker.currentJobs[0].executionId}`}
                        onClick={(e) => e.stopPropagation()}
                        className="text-[10px] font-mono text-indigo-600 hover:underline flex items-center gap-1"
                      >
                        <span>Run #{worker.currentJobs[0].executionId.substring(0, 10)}</span>
                        <ExternalLink className="w-2.5 h-2.5" />
                      </Link>
                      <span className="text-slate-300">·</span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        Node: {worker.currentJobs[0].nodeId}
                      </span>
                    </div>
                  </div>
                ) : worker.status === 'draining' ? (
                  <div className="text-amber-700 font-mono text-[11px] flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 animate-spin" />
                    <span>Draining · Waiting for running tasks before exit</span>
                  </div>
                ) : worker.status === 'stale' ? (
                  <div className="text-orange-700 font-mono text-[11px] flex items-center gap-1.5">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Telemetry Stale · Heartbeats have stopped arriving</span>
                  </div>
                ) : worker.status === 'offline' ? (
                  <div className="text-slate-400 font-mono text-[11px]">
                    Offline · Process stopped or disconnected
                  </div>
                ) : (
                  <div className="text-slate-500 font-mono text-[11px]">
                    Idle · Polling queue for ready DAG steps
                  </div>
                )}
              </div>

              {/* Stats Footer */}
              <div className="grid grid-cols-3 gap-2 text-center text-[11px] pt-2 border-t border-slate-100">
                <div>
                  <span className="text-slate-400 block text-[10px]">Concurrency</span>
                  <span className="font-mono font-bold text-slate-800">{worker.concurrency} tasks</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Completed</span>
                  <span className="font-mono font-bold text-emerald-600">{worker.completedJobsCount}</span>
                </div>
                <div>
                  <span className="text-slate-400 block text-[10px]">Heartbeat</span>
                  <span className="font-mono text-slate-700">
                    {formatRelativeTime(worker.lastHeartbeat)}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Slide-over Worker Details Drawer */}
      {selectedWorker && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-lg bg-white h-full shadow-2xl p-6 overflow-y-auto space-y-6 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-4 border-b border-slate-200">
              <div className="space-y-0.5">
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Server className="w-4 h-4 text-indigo-600" />
                  <span>{selectedWorker.name}</span>
                </h3>
                <span className="text-[11px] font-mono text-slate-500">{selectedWorker.id}</span>
              </div>
              <button
                onClick={() => setSelectedWorker(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status & Quick Stats */}
            <div className="flex items-center justify-between p-3.5 bg-slate-50 rounded-xl border border-slate-200">
              <div>
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Node Status</span>
                <div className="mt-1">
                  <StatusBadge status={selectedWorker.status} size="sm" />
                </div>
              </div>
              <div className="text-right">
                <span className="text-[10px] text-slate-400 uppercase font-mono block">Concurrency</span>
                <span className="text-xs font-mono font-bold text-slate-900 mt-1 block">
                  {selectedWorker.concurrency} concurrent tasks
                </span>
              </div>
            </div>

            {/* Telemetry Details */}
            <div className="space-y-3">
              <h4 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
                Node Telemetry
              </h4>
              <div className="bg-white rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                <div className="p-3 flex justify-between">
                  <span className="text-slate-500">Hostname:</span>
                  <span className="font-mono text-slate-900 font-semibold">{selectedWorker.hostname}</span>
                </div>
                <div className="p-3 flex justify-between">
                  <span className="text-slate-500">Last Heartbeat:</span>
                  <span className="font-mono text-slate-900">
                    {formatDate(selectedWorker.lastHeartbeat)} ({formatRelativeTime(selectedWorker.lastHeartbeat)})
                  </span>
                </div>
                {selectedWorker.registeredAt && (
                  <div className="p-3 flex justify-between">
                    <span className="text-slate-500">First Registered:</span>
                    <span className="font-mono text-slate-900">
                      {formatDate(selectedWorker.registeredAt)}
                    </span>
                  </div>
                )}
                <div className="p-3 flex justify-between">
                  <span className="text-slate-500">Uptime:</span>
                  <span className="font-mono text-slate-900">
                    {Math.floor(selectedWorker.uptimeSeconds / 3600)}h {Math.floor((selectedWorker.uptimeSeconds % 3600) / 60)}m {selectedWorker.uptimeSeconds % 60}s
                  </span>
                </div>
                <div className="p-3 flex justify-between">
                  <span className="text-slate-500">Completed Jobs:</span>
                  <span className="font-mono font-bold text-emerald-600">{selectedWorker.completedJobsCount}</span>
                </div>
                <div className="p-3 flex justify-between">
                  <span className="text-slate-500">Failed Jobs:</span>
                  <span className="font-mono font-bold text-rose-600">{selectedWorker.failedJobsCount}</span>
                </div>
                {selectedWorker.memoryUsage && (
                  <div className="p-3 flex justify-between">
                    <span className="text-slate-500">Node Memory:</span>
                    <span className="font-mono text-slate-900">
                      {selectedWorker.memoryUsage.heapUsedMB} MB Heap / {selectedWorker.memoryUsage.rssMB} MB RSS
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Current Active Jobs */}
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
                In-Flight Jobs ({selectedWorker.currentJobs?.length || 0})
              </h4>
              {selectedWorker.currentJobs && selectedWorker.currentJobs.length > 0 ? (
                <div className="space-y-2">
                  {selectedWorker.currentJobs.map((job) => (
                    <div key={job.jobId} className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-slate-900">{job.nodeLabel}</span>
                        <Link
                          to={`/runs/${job.executionId}`}
                          className="text-[10px] text-indigo-600 hover:underline flex items-center gap-0.5 font-mono"
                        >
                          <span>Inspect Run</span>
                          <ExternalLink className="w-2.5 h-2.5" />
                        </Link>
                      </div>
                      <div className="text-[11px] font-mono text-slate-500">
                        Node ID: {job.nodeId} · Started {formatRelativeTime(job.startedAt)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-lg text-center text-xs text-slate-400 font-mono">
                  No active jobs currently in flight.
                </div>
              )}
            </div>

            {/* Safe Last Error if present */}
            {selectedWorker.lastError && (
              <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs space-y-1 text-rose-900">
                <span className="font-bold flex items-center gap-1.5 text-[11px] uppercase font-mono">
                  <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
                  <span>Recent Error Event</span>
                </span>
                <p className="font-mono text-rose-800">{selectedWorker.lastError.message}</p>
                <span className="text-[10px] text-rose-500 font-mono block">
                  {formatDate(selectedWorker.lastError.timestamp)}
                </span>
              </div>
            )}

            {/* Shutdown Info if present */}
            {selectedWorker.shutdownInfo && (
              <div className="p-3.5 bg-slate-100 border border-slate-200 rounded-xl text-xs space-y-1 text-slate-800">
                <span className="font-bold text-[11px] uppercase font-mono">Shutdown Details</span>
                <p className="font-mono">{selectedWorker.shutdownInfo.reason}</p>
                <span className="text-[10px] text-slate-500 font-mono block">
                  {formatDate(selectedWorker.shutdownInfo.timestamp)}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Slide-over Cluster Events Drawer */}
      {showEventsDrawer && (
        <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/40 backdrop-blur-xs flex justify-end">
          <div className="w-full max-w-md bg-white h-full shadow-2xl p-6 overflow-y-auto space-y-4 animate-in slide-in-from-right duration-200">
            <div className="flex items-center justify-between pb-3 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <Radio className="w-4 h-4 text-indigo-600" />
                <h3 className="text-sm font-bold text-slate-900 font-mono uppercase">
                  Cluster Audit Events
                </h3>
              </div>
              <button
                onClick={() => setShowEventsDrawer(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Safe real-time audit stream for worker registration, jobs, draining, and lifecycle transitions.
            </p>

            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="p-8 text-center text-xs text-slate-400 font-mono">
                  No cluster events recorded yet.
                </div>
              ) : (
                events.map((evt) => (
                  <div
                    key={evt.id}
                    className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-[10px] font-mono font-bold px-1.5 py-0.5 rounded ${
                          evt.type === 'REGISTERED'
                            ? 'bg-blue-100 text-blue-700'
                            : evt.type === 'JOB_STARTED'
                            ? 'bg-indigo-100 text-indigo-700'
                            : evt.type === 'JOB_COMPLETED'
                            ? 'bg-emerald-100 text-emerald-700'
                            : evt.type === 'JOB_FAILED'
                            ? 'bg-rose-100 text-rose-700'
                            : evt.type === 'OFFLINE'
                            ? 'bg-slate-200 text-slate-700'
                            : 'bg-amber-100 text-amber-700'
                        }`}
                      >
                        {evt.type}
                      </span>
                      <span className="text-[10px] text-slate-400 font-mono">
                        {formatRelativeTime(evt.timestamp)}
                      </span>
                    </div>
                    <div className="font-mono text-slate-700 text-[11px]">
                      Worker: <span className="font-semibold">{evt.workerId}</span>
                    </div>
                    {evt.details && (
                      <div className="text-[10px] text-slate-500 font-mono bg-white p-1.5 rounded border border-slate-100 mt-1">
                        {JSON.stringify(evt.details)}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Guide Modal: Launch Multiple Workers Locally */}
      {showGuideModal && (
        <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-5 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-50 border border-indigo-200 text-indigo-600">
                  <Terminal className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-900">
                    Launch Distributed Workers Locally
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Run autonomous worker instances to process DAG execution queues in parallel.
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowGuideModal(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-4 text-xs">
              <div className="space-y-1.5">
                <span className="font-bold text-slate-900 block">
                  1. Launch Default Worker Process
                </span>
                <p className="text-slate-600">
                  Starts an autonomous worker daemon listening on BullMQ / Redis or local queue:
                </p>
                <div className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono flex items-center justify-between">
                  <span>npm run worker:dev --workspace=backend</span>
                  <button
                    onClick={() =>
                      copyToClipboard(
                        'npm run worker:dev --workspace=backend',
                        'default'
                      )
                    }
                    className="p-1 hover:text-indigo-400 transition"
                  >
                    {copiedCmd === 'default' ? (
                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                    ) : (
                      <Copy className="w-3.5 h-3.5" />
                    )}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <span className="font-bold text-slate-900 block">
                  2. Launch Additional Worker with Custom ID & Concurrency
                </span>
                <p className="text-slate-600">
                  Open a new terminal tab and specify custom worker IDs and concurrency settings:
                </p>
                <div className="space-y-2">
                  <div className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono flex items-center justify-between">
                    <span>
                      $env:WORKER_ID="worker-gpu-01"; $env:WORKER_CONCURRENCY="10"; npm run worker:dev --workspace=backend
                    </span>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          '$env:WORKER_ID="worker-gpu-01"; $env:WORKER_CONCURRENCY="10"; npm run worker:dev --workspace=backend',
                          'pwsh'
                        )
                      }
                      className="p-1 hover:text-indigo-400 transition"
                    >
                      {copiedCmd === 'pwsh' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                  <span className="text-[11px] text-slate-400">
                    Bash / Linux / macOS syntax:
                  </span>
                  <div className="bg-slate-900 text-slate-100 p-3 rounded-lg font-mono flex items-center justify-between">
                    <span>
                      WORKER_ID=worker-gpu-01 WORKER_CONCURRENCY=10 npm run worker:dev --workspace=backend
                    </span>
                    <button
                      onClick={() =>
                        copyToClipboard(
                          'WORKER_ID=worker-gpu-01 WORKER_CONCURRENCY=10 npm run worker:dev --workspace=backend',
                          'bash'
                        )
                      }
                      className="p-1 hover:text-indigo-400 transition"
                    >
                      {copiedCmd === 'bash' ? (
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                      ) : (
                        <Copy className="w-3.5 h-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-100 rounded-xl flex items-start gap-2.5 text-indigo-900">
                <Info className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
                <p className="leading-relaxed">
                  Every launched worker will instantly appear in this dashboard with its live heartbeat, PID, hostname, and active jobs. DAG jobs queued by executions will be distributed across all registered workers.
                </p>
              </div>
            </div>

            <div className="flex justify-end pt-2 border-t border-slate-100">
              <button
                onClick={() => setShowGuideModal(false)}
                className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition"
              >
                Close Guide
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
