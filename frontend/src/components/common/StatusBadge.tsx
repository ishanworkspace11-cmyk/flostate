import React from 'react';
import { cn } from '../../lib/utils';
import { ExecutionStatus } from '../../features/executions/execution.types';
import { WorkflowStatus } from '../../features/workflows/workflow.types';
import { WorkerStatus } from '../../features/workers/worker.types';

type AnyStatus = ExecutionStatus | WorkflowStatus | WorkerStatus | 'active' | 'warning' | 'error' | string;

interface StatusBadgeProps {
  status: AnyStatus;
  size?: 'sm' | 'md';
  showDot?: boolean;
  className?: string;
}

export const StatusBadge: React.FC<StatusBadgeProps> = ({
  status,
  size = 'md',
  showDot = true,
  className,
}) => {
  const norm = String(status || '').toLowerCase();

  let colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
  let dotColor = 'bg-slate-400';
  let isPulsing = false;

  if (norm === 'succeeded' || norm === 'published' || norm === 'active') {
    colorClasses = 'bg-emerald-50 text-emerald-700 border-emerald-200';
    dotColor = 'bg-emerald-500';
  } else if (norm === 'failed' || norm === 'error' || norm === 'offline') {
    colorClasses = 'bg-rose-50 text-rose-700 border-rose-200';
    dotColor = 'bg-rose-500';
  } else if (norm === 'running' || norm === 'busy') {
    colorClasses = 'bg-indigo-50 text-indigo-700 border-indigo-200';
    dotColor = 'bg-indigo-600';
    isPulsing = true;
  } else if (norm === 'draining') {
    colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
    dotColor = 'bg-amber-500';
    isPulsing = true;
  } else if (norm === 'stale') {
    colorClasses = 'bg-orange-50 text-orange-700 border-orange-200';
    dotColor = 'bg-orange-500';
  } else if (norm === 'unknown') {
    colorClasses = 'bg-zinc-100 text-zinc-600 border-zinc-200';
    dotColor = 'bg-zinc-400';
  } else if (norm === 'pending' || norm === 'ready' || norm === 'draft' || norm === 'idle') {
    colorClasses = 'bg-slate-100 text-slate-700 border-slate-200';
    dotColor = 'bg-slate-400';
  } else if (norm === 'skipped' || norm === 'paused' || norm === 'warning') {
    colorClasses = 'bg-amber-50 text-amber-700 border-amber-200';
    dotColor = 'bg-amber-500';
  } else if (norm === 'retrying') {
    colorClasses = 'bg-purple-50 text-purple-700 border-purple-200';
    dotColor = 'bg-purple-500';
    isPulsing = true;
  }

  const sizeClasses = size === 'sm' ? 'px-2 py-0.5 text-xs' : 'px-2.5 py-1 text-xs';

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-medium rounded-full border tracking-wide uppercase',
        colorClasses,
        sizeClasses,
        className
      )}
    >
      {showDot && (
        <span
          className={cn(
            'w-1.5 h-1.5 rounded-full shrink-0',
            dotColor,
            isPulsing && 'animate-ping'
          )}
        />
      )}
      <span>{status}</span>
    </span>
  );
};
