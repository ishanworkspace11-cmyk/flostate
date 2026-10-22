import React from 'react';
import { NodeExecution } from '../../features/executions/execution.types';
import { StatusBadge } from '../common/StatusBadge';
import { formatDuration, formatDate } from '../../lib/date';
import { Clock, AlertCircle } from 'lucide-react';
import { cn } from '../../lib/utils';

interface ExecutionTimelineProps {
  nodeExecutions: Record<string, NodeExecution>;
  selectedNodeId?: string;
  onSelectNode?: (nodeId: string) => void;
}

export const ExecutionTimeline: React.FC<ExecutionTimelineProps> = ({
  nodeExecutions,
  selectedNodeId,
  onSelectNode,
}) => {
  const nodes = Object.values(nodeExecutions);

  if (nodes.length === 0) {
    return (
      <div className="p-4 text-center text-xs text-slate-400 bg-slate-50 rounded-lg border border-slate-200">
        No node executions recorded.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {nodes.map((node, index) => {
        const isSelected = selectedNodeId === node.nodeId;
        return (
          <div
            key={node.id || node.nodeId || index}
            onClick={() => onSelectNode && onSelectNode(node.nodeId)}
            className={cn(
              'p-3.5 rounded-lg border transition cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs',
              isSelected
                ? 'bg-indigo-50/60 border-indigo-300 ring-1 ring-indigo-200'
                : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/50'
            )}
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="w-5 h-5 rounded-full bg-slate-100 text-slate-600 flex items-center justify-center font-mono font-medium text-[10px] shrink-0 border border-slate-200">
                {index + 1}
              </span>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-slate-900 truncate">{node.nodeLabel}</span>
                  <span className="text-[11px] font-mono text-slate-400">({node.nodeType})</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500">
                  <span className="flex items-center gap-1">
                    <Clock className="w-3 h-3 text-slate-400" />
                    {formatDuration(node.durationMs)}
                  </span>
                  <span>Attempt {node.attempt || 1}</span>
                  {node.startedAt && (
                    <span className="hidden md:inline text-slate-400">
                      Started: {formatDate(node.startedAt).split(', ')[1]}
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-center shrink-0">
              {node.error && (
                <span className="flex items-center gap-1 text-rose-600 text-[11px] max-w-xs truncate" title={node.error}>
                  <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{node.error}</span>
                </span>
              )}
              <StatusBadge status={node.status} size="sm" />
            </div>
          </div>
        );
      })}
    </div>
  );
};
