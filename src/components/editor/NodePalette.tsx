import React from 'react';
import { NodeType } from '../../features/workflows/workflow.types';
import { Zap, Globe, Clock, Send, Cpu, Plus, GripVertical } from 'lucide-react';

interface PaletteItem {
  type: NodeType;
  label: string;
  category: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgColor: string;
  borderColor: string;
}

export const PALETTE_ITEMS: PaletteItem[] = [
  {
    type: 'trigger',
    label: 'Trigger',
    category: 'Ingress',
    description: 'Initial entry point: manual, webhook, or cron schedule.',
    icon: Zap,
    color: 'text-amber-600',
    bgColor: 'bg-amber-50',
    borderColor: 'border-amber-200',
  },
  {
    type: 'transform',
    label: 'Transform',
    category: 'Processing',
    description: 'Safe JSON extraction, field mapping, template strings, math aggregations.',
    icon: Cpu,
    color: 'text-violet-600',
    bgColor: 'bg-violet-50',
    borderColor: 'border-violet-200',
  },
  {
    type: 'httpRequest',
    label: 'HTTP Request',
    category: 'Integrations',
    description: 'Calls external API with method, headers, timeout, and mock support.',
    icon: Globe,
    color: 'text-blue-600',
    bgColor: 'bg-blue-50',
    borderColor: 'border-blue-200',
  },
  {
    type: 'delay',
    label: 'Delay',
    category: 'Timing',
    description: 'Pauses workflow execution for a configurable duration.',
    icon: Clock,
    color: 'text-slate-600',
    bgColor: 'bg-slate-50',
    borderColor: 'border-slate-200',
  },
  {
    type: 'webhookAction',
    label: 'Webhook Action',
    category: 'Egress',
    description: 'Dispatches payload to external endpoint / webhook receiver.',
    icon: Send,
    color: 'text-emerald-600',
    bgColor: 'bg-emerald-50',
    borderColor: 'border-emerald-200',
  },
];

interface NodePaletteProps {
  onAddNode: (type: NodeType) => void;
}

export const NodePalette: React.FC<NodePaletteProps> = ({ onAddNode }) => {
  const onDragStart = (event: React.DragEvent, nodeType: NodeType) => {
    event.dataTransfer.setData('application/reactflow-type', nodeType);
    event.dataTransfer.effectAllowed = 'move';
  };

  return (
    <div className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0 h-full select-none">
      <div className="p-3.5 border-b border-slate-100 flex items-center justify-between">
        <div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
            Node Palette
          </h3>
          <p className="text-[11px] text-slate-500">Drag or click to add</p>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-2.5">
        {PALETTE_ITEMS.map((item) => {
          const Icon = item.icon;
          return (
            <div
              key={item.type}
              draggable
              onDragStart={(e) => onDragStart(e, item.type)}
              onClick={() => onAddNode(item.type)}
              className="group p-2.5 rounded-xl border border-slate-200/90 hover:border-indigo-400 bg-white hover:bg-indigo-50/20 cursor-grab active:cursor-grabbing transition shadow-2xs hover:shadow-xs"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`p-1.5 rounded-lg border ${item.bgColor} ${item.borderColor} ${item.color}`}>
                    <Icon className="w-4 h-4" />
                  </div>
                  <div>
                    <span className="text-xs font-bold text-slate-900 group-hover:text-indigo-600 transition-colors">
                      {item.label}
                    </span>
                    <span className="block text-[10px] text-slate-400 uppercase font-mono">
                      {item.category}
                    </span>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-slate-300 group-hover:text-indigo-500">
                  <Plus className="w-3.5 h-3.5" />
                  <GripVertical className="w-3.5 h-3.5" />
                </div>
              </div>
              <p className="mt-1.5 text-[11px] text-slate-500 line-clamp-2 leading-relaxed">
                {item.description}
              </p>
            </div>
          );
        })}
      </div>

      <div className="p-3 bg-slate-50 border-t border-slate-100 text-[11px] text-slate-500">
        <span className="font-semibold text-slate-700">Tip:</span> Connect nodes from right handle to left handle to build your DAG flow.
      </div>
    </div>
  );
};
