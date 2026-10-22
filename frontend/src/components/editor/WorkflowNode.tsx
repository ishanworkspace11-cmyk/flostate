import React, { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import {
  Zap,
  Globe,
  Clock,
  Send,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Loader2,
  MinusCircle,
} from 'lucide-react';
import { NodeType } from '../../features/workflows/workflow.types';
import { ExecutionStatus } from '../../features/executions/execution.types';
import { cn } from '../../lib/utils';

export interface WorkflowNodeData {
  label: string;
  type: NodeType;
  config: Record<string, any>;
  executionStatus?: ExecutionStatus;
  executionError?: string | null;
  durationMs?: number;
}

const nodeTypeMeta: Record<NodeType, { icon: React.ElementType; color: string; bgColor: string; borderColor: string }> = {
  trigger: {
    icon: Zap,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  transform: {
    icon: Cpu,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
  },
  httpRequest: {
    icon: Globe,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  delay: {
    icon: Clock,
    color: 'text-slate-600',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
  },
  webhookAction: {
    icon: Send,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
};

export const CustomWorkflowNode: React.FC<NodeProps> = memo((props) => {
  const { data, selected } = props;
  const nodeData = data as unknown as WorkflowNodeData;
  const type = nodeData.type || 'transform';
  const meta = nodeTypeMeta[type] || nodeTypeMeta.transform;
  const Icon = meta.icon;

  const executionStatus = nodeData.executionStatus;

  // Build summary subtitle based on node configuration
  let subtitle = '';
  const config = nodeData.config || {};
  if (type === 'trigger') {
    subtitle = config.triggerType === 'cron' ? `Cron: ${config.cronExpression || '0 * * * *'}` : (config.triggerType || 'manual');
  } else if (type === 'httpRequest') {
    subtitle = `${config.method || 'GET'} ${config.url || 'https://...'}`;
  } else if (type === 'delay') {
    subtitle = `${config.durationMs || 1000}ms delay`;
  } else if (type === 'transform') {
    subtitle = config.operation ? config.operation.replace('_', ' ') : 'pass through';
  } else if (type === 'webhookAction') {
    try {
      subtitle = config.url ? (config.url.startsWith('http') ? new URL(config.url).pathname : config.url) : 'Outbound webhook';
    } catch {
      subtitle = config.url || 'Outbound webhook';
    }
  }

  // Execution status badge rendering
  let statusBadge = null;
  let statusBorder = '';
  if (executionStatus === 'Running') {
    statusBorder = 'border-indigo-500 ring-2 ring-indigo-200';
    statusBadge = (
      <span className="flex items-center gap-1 text-[10px] font-medium text-indigo-700 bg-indigo-50 px-1.5 py-0.5 rounded-full border border-indigo-200">
        <Loader2 className="w-3 h-3 animate-spin text-indigo-600" />
        Running
      </span>
    );
  } else if (executionStatus === 'Succeeded') {
    statusBorder = 'border-emerald-500';
    statusBadge = (
      <span className="flex items-center gap-1 text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded-full border border-emerald-200">
        <CheckCircle2 className="w-3 h-3 text-emerald-600" />
        {nodeData.durationMs ? `${nodeData.durationMs}ms` : 'Passed'}
      </span>
    );
  } else if (executionStatus === 'Failed') {
    statusBorder = 'border-rose-500 ring-2 ring-rose-200';
    statusBadge = (
      <span className="flex items-center gap-1 text-[10px] font-medium text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded-full border border-rose-200">
        <AlertCircle className="w-3 h-3 text-rose-600" />
        Failed
      </span>
    );
  } else if (executionStatus === 'Skipped') {
    statusBorder = 'border-amber-400 opacity-80';
    statusBadge = (
      <span className="flex items-center gap-1 text-[10px] font-medium text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded-full border border-amber-200">
        <MinusCircle className="w-3 h-3 text-amber-600" />
        Skipped
      </span>
    );
  }

  return (
    <div
      className={cn(
        'w-64 rounded-xl border bg-white p-3 shadow-sm transition-all',
        selected ? 'border-indigo-600 ring-2 ring-indigo-100 shadow-md' : 'border-slate-200/90 hover:border-slate-300',
        statusBorder
      )}
    >
      {/* Target Handle on Left (Trigger nodes do not have upstream dependencies) */}
      {type !== 'trigger' && (
        <Handle
          type="target"
          position={Position.Left}
          className="w-2.5 h-2.5 bg-indigo-600 border-2 border-white"
        />
      )}

      {/* Node Header */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div className={cn('p-2 rounded-lg border shrink-0', meta.bgColor, meta.borderColor, meta.color)}>
            <Icon className="w-4 h-4" />
          </div>
          <div className="min-w-0">
            <h4 className="text-xs font-bold text-slate-900 truncate" title={nodeData.label}>
              {nodeData.label || 'Unnamed Node'}
            </h4>
            <p className="text-[10px] uppercase font-mono tracking-wider text-slate-400">
              {type}
            </p>
          </div>
        </div>
        {statusBadge}
      </div>

      {/* Node Body / Subtitle summary */}
      {subtitle && (
        <div className="mt-2.5 pt-2 border-t border-slate-100 flex items-center justify-between text-[11px] text-slate-500 font-mono">
          <span className="truncate max-w-[200px]" title={subtitle}>
            {subtitle}
          </span>
        </div>
      )}

      {/* Source Handle on Right */}
      <Handle
        type="source"
        position={Position.Right}
        className="w-2.5 h-2.5 bg-indigo-600 border-2 border-white"
      />
    </div>
  );
});

CustomWorkflowNode.displayName = 'CustomWorkflowNode';
