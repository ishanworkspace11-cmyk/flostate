import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Workflow } from '../../features/workflows/workflow.types';
import { StatusBadge } from '../common/StatusBadge';
import { formatDate } from '../../lib/date';
import {
  Play,
  Edit3,
  Copy,
  Trash2,
  ExternalLink,
  PauseCircle,
  PlayCircle,
  MoreVertical,
  CheckCircle,
  AlertTriangle,
} from 'lucide-react';
import { ConfirmDialog } from '../common/ConfirmDialog';
import { ExecutionService } from '../../features/executions/execution.service';

interface WorkflowTableProps {
  workflows: Workflow[];
  onWorkflowChange?: () => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onToggleStatus: (id: string) => void;
}

export const WorkflowTable: React.FC<WorkflowTableProps> = ({
  workflows,
  onWorkflowChange,
  onDuplicate,
  onDelete,
  onToggleStatus,
}) => {
  const navigate = useNavigate();
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null);
  const [runningId, setRunningId] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const handleRunManual = async (workflow: Workflow) => {
    try {
      setRunningId(workflow.id);
      const execution = await ExecutionService.runWorkflow(workflow.id, {
        triggerType: 'manual_table',
        maxDelayMs: 400,
      });
      setToastMessage(`Execution #${execution.id.substring(0, 8)} started (${execution.status})`);
      setTimeout(() => setToastMessage(null), 3000);
      if (onWorkflowChange) onWorkflowChange();
    } catch (err: any) {
      alert(`Execution error: ${err.message}`);
    } finally {
      setRunningId(null);
    }
  };

  return (
    <>
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-lg text-xs font-medium flex items-center gap-2 animate-in slide-in-from-bottom duration-200">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-slate-200 bg-slate-50/75 text-slate-500 uppercase font-mono tracking-wider text-[11px]">
                <th className="py-3 px-4 font-semibold">Workflow</th>
                <th className="py-3 px-4 font-semibold">Status</th>
                <th className="py-3 px-4 font-semibold">Graph Topology</th>
                <th className="py-3 px-4 font-semibold">Version</th>
                <th className="py-3 px-4 font-semibold">Updated</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {workflows.map((wf) => (
                <tr key={wf.id} className="hover:bg-slate-50/60 transition-colors group">
                  <td className="py-3.5 px-4">
                    <div className="font-semibold text-slate-900 group-hover:text-indigo-600 transition-colors cursor-pointer" onClick={() => navigate(`/builder/${wf.id}`)}>
                      {wf.name}
                    </div>
                    {wf.description && (
                      <p className="text-slate-500 text-[11px] truncate max-w-xs mt-0.5">
                        {wf.description}
                      </p>
                    )}
                  </td>
                  <td className="py-3.5 px-4">
                    <StatusBadge status={wf.status} size="sm" />
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    <span className="font-mono text-[11px] bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {wf.nodes.length} nodes · {wf.edges.length} edges
                    </span>
                  </td>
                  <td className="py-3.5 px-4 font-mono text-slate-500 text-[11px]">
                    v{wf.draftVersion} {wf.publishedVersion ? `(pub v${wf.publishedVersion})` : '(draft)'}
                  </td>
                  <td className="py-3.5 px-4 text-slate-500 whitespace-nowrap">
                    {formatDate(wf.updatedAt)}
                  </td>
                  <td className="py-3.5 px-4 text-right">
                    <div className="flex items-center justify-end gap-1.5">
                      <button
                        onClick={() => handleRunManual(wf)}
                        disabled={runningId === wf.id}
                        title="Run Workflow Now"
                        className="p-1.5 rounded-lg text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition disabled:opacity-50"
                      >
                        <Play className={`w-3.5 h-3.5 ${runningId === wf.id ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        onClick={() => navigate(`/builder/${wf.id}`)}
                        title="Open in Visual Builder"
                        className="p-1.5 rounded-lg text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 transition"
                      >
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onDuplicate(wf.id)}
                        title="Duplicate Workflow"
                        className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition"
                      >
                        <Copy className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => onToggleStatus(wf.id)}
                        title={wf.status === 'paused' ? 'Activate' : 'Pause'}
                        className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 border border-transparent hover:border-slate-200 transition"
                      >
                        {wf.status === 'paused' ? (
                          <PlayCircle className="w-3.5 h-3.5 text-emerald-600" />
                        ) : (
                          <PauseCircle className="w-3.5 h-3.5 text-amber-600" />
                        )}
                      </button>
                      <button
                        onClick={() => setDeleteTargetId(wf.id)}
                        title="Delete Workflow"
                        className="p-1.5 rounded-lg text-rose-600 hover:text-rose-700 hover:bg-rose-50 border border-transparent hover:border-rose-100 transition"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <ConfirmDialog
        isOpen={deleteTargetId !== null}
        title="Delete Workflow"
        message="Are you sure you want to delete this workflow? All associated versions and builder state will be permanently removed."
        confirmLabel="Delete"
        isDestructive
        onConfirm={() => {
          if (deleteTargetId) {
            onDelete(deleteTargetId);
            setDeleteTargetId(null);
          }
        }}
        onCancel={() => setDeleteTargetId(null)}
      />
    </>
  );
};
