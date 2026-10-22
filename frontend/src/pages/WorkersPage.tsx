import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { StatCard } from '../components/common/StatCard';
import { WorkerService } from '../features/workers/worker.service';
import { WorkerInstance, WorkerQueueSummary } from '../features/workers/worker.types';
import { formatDate, formatRelativeTime } from '../lib/date';
import {
  Cpu,
  Server,
  Layers,
  Activity,
  ShieldAlert,
  HardDrive,
  RefreshCw,
  Terminal,
} from 'lucide-react';

export const WorkersPage: React.FC = () => {
  const [workers, setWorkers] = useState<WorkerInstance[]>([]);
  const [queues, setQueues] = useState<WorkerQueueSummary[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = () => {
    setWorkers(WorkerService.getWorkers());
    setQueues(WorkerService.getQueues());
  };

  const totalWorkers = workers.length;
  const busyWorkers = workers.filter((w) => w.status === 'busy').length;
  const totalCompletedJobs = workers.reduce((acc, w) => acc + w.completedJobsCount, 0);
  const totalFailedJobs = workers.reduce((acc, w) => acc + w.failedJobsCount, 0);

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Distributed Workers & Queues"
        description="Inspect execution node workers, Redis queue backlogs, concurrency, and task dispatch health."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Workers' }]}
        actions={
          <button
            onClick={loadData}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            <span>Refresh</span>
          </button>
        }
      />

      {/* Honest Simulation Notice */}
      <div className="p-4 bg-amber-50/80 border border-amber-200 rounded-xl flex items-start gap-3 text-xs text-amber-900">
        <ShieldAlert className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p className="font-bold">
            Simulated Cluster Architecture — Redis / BullMQ Infrastructure Preview
          </p>
          <p className="text-amber-800 leading-relaxed">
            The worker instances and queues shown below are simulated to illustrate the distributed execution architecture. In the production deployment, these telemetry records connect to Node.js / BullMQ worker pools running on separate containers or VMs.
          </p>
        </div>
      </div>

      {/* Top Metrics Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="Total Workers"
          value={totalWorkers}
          description={`${busyWorkers} active / ${totalWorkers - busyWorkers} idle`}
          icon={Server}
          accentColor="indigo"
        />
        <StatCard
          label="Active Jobs"
          value={busyWorkers}
          description="In flight across cluster"
          icon={Activity}
          accentColor="emerald"
        />
        <StatCard
          label="Total Jobs Completed"
          value={totalCompletedJobs.toLocaleString()}
          description="Cumulative across nodes"
          icon={Cpu}
          accentColor="slate"
        />
        <StatCard
          label="Queue Backlog"
          value={queues.reduce((acc, q) => acc + q.waitingCount, 0)}
          description="Waiting in Redis buffer"
          icon={Layers}
          accentColor="slate"
        />
      </div>

      {/* Queue Summary Table */}
      <div className="bg-white rounded-xl border border-slate-200/90 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
              BullMQ Queue Depths
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Task queues partitioned by priority and task classification
            </p>
          </div>
          <span className="text-[10px] font-mono font-medium px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200">
            SIMULATED
          </span>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase font-mono tracking-wider text-[11px]">
                <th className="py-3 px-4 font-semibold">Queue Name</th>
                <th className="py-3 px-4 font-semibold">Active</th>
                <th className="py-3 px-4 font-semibold">Waiting</th>
                <th className="py-3 px-4 font-semibold">Delayed</th>
                <th className="py-3 px-4 font-semibold">Completed</th>
                <th className="py-3 px-4 font-semibold">Failed</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-mono">
              {queues.map((q) => (
                <tr key={q.queueName} className="hover:bg-slate-50/60">
                  <td className="py-3 px-4 font-semibold text-slate-800">{q.queueName}</td>
                  <td className="py-3 px-4">
                    <span className="text-indigo-600 font-bold">{q.activeCount}</span>
                  </td>
                  <td className="py-3 px-4 text-slate-600">{q.waitingCount}</td>
                  <td className="py-3 px-4 text-slate-600">{q.delayedCount}</td>
                  <td className="py-3 px-4 text-emerald-600 font-semibold">{q.completedCount}</td>
                  <td className="py-3 px-4 text-rose-600">{q.failedCount}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Workers Grid */}
      <div>
        <div className="mb-3">
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
            Worker Nodes
          </h3>
          <p className="text-[11px] text-slate-500">
            Autonomous execution processes polling BullMQ task partitions
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {workers.map((worker) => (
            <div
              key={worker.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4 hover:border-slate-300 transition"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-slate-100 border border-slate-200 text-slate-700">
                    <Server className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">{worker.name}</h4>
                    <span className="text-[10px] text-slate-400 font-mono block">
                      {worker.hostname}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-slate-100 text-slate-500 border border-slate-200">
                    DEMO
                  </span>
                  <StatusBadge status={worker.status} size="sm" />
                </div>
              </div>

              {/* Current Job or Idle */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg text-xs">
                {worker.currentJobs.length > 0 ? (
                  <div>
                    <span className="text-[10px] text-indigo-600 font-semibold uppercase font-mono block">
                      Processing Job
                    </span>
                    <p className="font-semibold text-slate-900 mt-0.5">
                      {worker.currentJobs[0].nodeLabel}
                    </p>
                    <span className="text-[10px] font-mono text-slate-500 block">
                      Execution #{worker.currentJobs[0].executionId.substring(0, 10)}
                    </span>
                  </div>
                ) : (
                  <div className="text-slate-400 font-mono text-[11px]">
                    Idle · Awaiting next DAG step dispatch
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
                  <span className="text-slate-400 block text-[10px]">Last Heartbeat</span>
                  <span className="font-mono text-slate-700">{formatRelativeTime(worker.lastHeartbeat)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
