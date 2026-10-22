import React from 'react';
import { ExecutionLogEntry } from '../../features/executions/execution.types';
import { formatDate } from '../../lib/date';
import { cn } from '../../lib/utils';

interface LogViewerProps {
  logs: ExecutionLogEntry[];
  emptyMessage?: string;
}

export const LogViewer: React.FC<LogViewerProps> = ({
  logs,
  emptyMessage = 'No logs recorded for this node execution.',
}) => {
  if (!logs || logs.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-slate-200">
        {emptyMessage}
      </div>
    );
  }

  const levelColorMap = {
    info: 'text-indigo-400 bg-indigo-950/40 border-indigo-800/50',
    warn: 'text-amber-400 bg-amber-950/40 border-amber-800/50',
    error: 'text-rose-400 bg-rose-950/40 border-rose-800/50',
    debug: 'text-slate-400 bg-slate-800/40 border-slate-700/50',
  };

  return (
    <div className="bg-slate-900 rounded-lg border border-slate-800 p-3 font-mono text-xs overflow-y-auto max-h-80 space-y-2">
      {logs.map((log, index) => (
        <div key={index} className="flex items-start gap-2.5 leading-relaxed">
          <span className="text-[10px] text-slate-500 shrink-0 font-mono select-none pt-0.5">
            {formatDate(log.timestamp).split(', ')[1] || log.timestamp}
          </span>
          <span
            className={cn(
              'px-1.5 py-0.2 rounded text-[10px] uppercase font-bold shrink-0 border select-none',
              levelColorMap[log.level] || levelColorMap.info
            )}
          >
            {log.level}
          </span>
          <span className="text-slate-200 break-all">{log.message}</span>
        </div>
      ))}
    </div>
  );
};
