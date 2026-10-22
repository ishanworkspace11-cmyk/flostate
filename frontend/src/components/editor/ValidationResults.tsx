import React from 'react';
import { ValidationResult } from '../../features/workflows/workflow.types';
import { AlertCircle, AlertTriangle, CheckCircle2, X } from 'lucide-react';

interface ValidationResultsProps {
  validation: ValidationResult;
  onClose: () => void;
  onSelectNode?: (nodeId: string) => void;
}

export const ValidationResults: React.FC<ValidationResultsProps> = ({
  validation,
  onClose,
  onSelectNode,
}) => {
  return (
    <div className="absolute bottom-4 left-72 z-30 w-96 max-w-[calc(100vw-20rem)] bg-white rounded-xl border border-slate-200 shadow-xl overflow-hidden animate-in slide-in-from-bottom duration-200">
      <div className="px-4 py-3 bg-slate-50 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2">
          {validation.isValid ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          ) : (
            <AlertCircle className="w-4 h-4 text-rose-600" />
          )}
          <span className="text-xs font-bold text-slate-900 font-mono uppercase">
            Graph Validation {validation.isValid ? 'Passed' : 'Failed'}
          </span>
        </div>
        <button
          onClick={onClose}
          className="text-slate-400 hover:text-slate-600 p-0.5 rounded transition"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-4 max-h-72 overflow-y-auto space-y-2.5 text-xs">
        {validation.isValid && validation.warnings.length === 0 && (
          <div className="p-3 bg-emerald-50 text-emerald-800 rounded-lg border border-emerald-100 flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-semibold">DAG is fully valid!</p>
              <p className="text-[11px] text-emerald-700 mt-0.5">
                Topological Order: {validation.topologicalOrder?.join(' → ') || 'Linear'}
              </p>
            </div>
          </div>
        )}

        {validation.errors.map((err, idx) => (
          <div
            key={`err-${idx}`}
            onClick={() => err.nodeId && onSelectNode && onSelectNode(err.nodeId)}
            className={`p-2.5 bg-rose-50 border border-rose-200 text-rose-900 rounded-lg flex items-start gap-2 ${
              err.nodeId ? 'cursor-pointer hover:bg-rose-100/70 transition' : ''
            }`}
          >
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-medium">{err.message}</span>
              {err.nodeId && (
                <span className="block mt-0.5 text-[10px] text-rose-700 font-mono">
                  Click to inspect node: {err.nodeId}
                </span>
              )}
            </div>
          </div>
        ))}

        {validation.warnings.map((warn, idx) => (
          <div
            key={`warn-${idx}`}
            onClick={() => warn.nodeId && onSelectNode && onSelectNode(warn.nodeId)}
            className={`p-2.5 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg flex items-start gap-2 ${
              warn.nodeId ? 'cursor-pointer hover:bg-amber-100/70 transition' : ''
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1">
              <span className="font-medium">{warn.message}</span>
              {warn.nodeId && (
                <span className="block mt-0.5 text-[10px] text-amber-700 font-mono">
                  Node: {warn.nodeId}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
