import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { ExecutionTimeline } from '../components/executions/ExecutionTimeline';
import { PayloadViewer } from '../components/executions/PayloadViewer';
import { LogViewer } from '../components/executions/LogViewer';
import { ExecutionService } from '../features/executions/execution.service';
import { WorkflowService } from '../features/workflows/workflow.service';
import { Execution, NodeExecution } from '../features/executions/execution.types';
import { formatDate, formatDuration } from '../lib/date';
import {
  ArrowLeft,
  RotateCcw,
  CheckCircle,
  AlertCircle,
  Clock,
  Terminal,
  Layers,
  ArrowRight,
  ExternalLink,
  Loader2,
} from 'lucide-react';

export const RunDetailsPage: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();

  const [execution, setExecution] = useState<Execution | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  useEffect(() => {
    if (runId) {
      loadExecution(runId);
    }
  }, [runId]);

  const loadExecution = (id: string) => {
    const data = ExecutionService.getExecution(id);
    setExecution(data);
    if (data && Object.keys(data.nodeExecutions).length > 0) {
      // Default selected node to first failing node or first node
      const nodes = Object.values(data.nodeExecutions);
      const failingNode = nodes.find((n) => n.status === 'Failed');
      setSelectedNodeId(failingNode ? failingNode.nodeId : nodes[0].nodeId);
    }
  };

  const handleRetry = async () => {
    if (!execution || isRetrying) return;
    try {
      setIsRetrying(true);
      const newRun = await ExecutionService.retryExecution(execution.id, {
        maxDelayMs: 600,
      });
      setToastMessage(`Retry launched! New execution record: #${newRun.id.substring(0, 8)}`);
      setTimeout(() => {
        setToastMessage(null);
        navigate(`/runs/${newRun.id}`);
      }, 1500);
    } catch (err: any) {
      alert(`Retry failed: ${err.message}`);
    } finally {
      setIsRetrying(false);
    }
  };

  if (!execution) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="p-8 bg-white rounded-xl border border-slate-200 text-center">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <h3 className="text-base font-semibold text-slate-900">Run Not Found</h3>
          <p className="text-xs text-slate-500 mt-1">
            Execution ID "{runId}" could not be located in local persistence.
          </p>
          <button
            onClick={() => navigate('/runs')}
            className="mt-4 px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700"
          >
            Back to Runs
          </button>
        </div>
      </div>
    );
  }

  const selectedNodeExec: NodeExecution | null = selectedNodeId
    ? execution.nodeExecutions[selectedNodeId] || null
    : null;

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-xl text-xs font-medium flex items-center gap-2 animate-in slide-in-from-top duration-150">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <PageHeader
        title={`Run #${execution.id.substring(0, 10)}`}
        description={`Execution trace for ${execution.workflowName} (v${execution.workflowVersion})`}
        breadcrumbs={[
          { label: 'Home', href: '/' },
          { label: 'Runs', href: '/runs' },
          { label: execution.id.substring(0, 10) },
        ]}
        badge={<StatusBadge status={execution.status} />}
        actions={
          <div className="flex items-center gap-2">
            <button
              onClick={() => navigate(`/builder/${execution.workflowId}`)}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition"
            >
              <span>Open in Builder</span>
              <ExternalLink className="w-3.5 h-3.5 text-slate-400" />
            </button>
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition disabled:opacity-50"
            >
              {isRetrying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              <span>{isRetrying ? 'Retrying DAG...' : 'Retry Run'}</span>
            </button>
          </div>
        }
      />

      {/* Execution Metadata Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs text-xs">
        <div>
          <span className="text-slate-400 text-[11px] uppercase font-mono block">Trigger Source</span>
          <span className="font-semibold text-slate-900 mt-1 inline-block uppercase font-mono">
            {execution.triggerType}
          </span>
        </div>
        <div>
          <span className="text-slate-400 text-[11px] uppercase font-mono block">Started At</span>
          <span className="font-medium text-slate-800 mt-1 inline-block">
            {formatDate(execution.startedAt)}
          </span>
        </div>
        <div>
          <span className="text-slate-400 text-[11px] uppercase font-mono block">Completed At</span>
          <span className="font-medium text-slate-800 mt-1 inline-block">
            {formatDate(execution.completedAt)}
          </span>
        </div>
        <div>
          <span className="text-slate-400 text-[11px] uppercase font-mono block">Total Duration</span>
          <span className="font-mono font-semibold text-slate-900 mt-1 inline-flex items-center gap-1">
            <Clock className="w-3 h-3 text-slate-400" />
            {formatDuration(execution.durationMs)}
          </span>
        </div>
      </div>

      {execution.error && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3 text-xs text-rose-900">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div>
            <h4 className="font-bold">Execution Failed</h4>
            <p className="mt-0.5">{execution.error}</p>
          </div>
        </div>
      )}

      {/* Main Node Timeline & Node Inspector */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left: Node Timeline List (5 cols) */}
        <div className="lg:col-span-5 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-4">
          <div>
            <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
              DAG Step Sequence
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Click a node to inspect its specific inputs, outputs, and log streams.
            </p>
          </div>

          <ExecutionTimeline
            nodeExecutions={execution.nodeExecutions}
            selectedNodeId={selectedNodeId || undefined}
            onSelectNode={(id) => setSelectedNodeId(id)}
          />
        </div>

        {/* Right: Selected Node Details (7 cols) */}
        <div className="lg:col-span-7 bg-white rounded-xl border border-slate-200 p-5 shadow-2xs space-y-5">
          {selectedNodeExec ? (
            <>
              <div className="flex items-start justify-between pb-3 border-b border-slate-100">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="text-sm font-bold text-slate-900">{selectedNodeExec.nodeLabel}</h3>
                    <StatusBadge status={selectedNodeExec.status} size="sm" />
                  </div>
                  <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 font-mono">
                    <span>ID: {selectedNodeExec.nodeId}</span>
                    <span>Type: {selectedNodeExec.nodeType}</span>
                    <span>Duration: {formatDuration(selectedNodeExec.durationMs)}</span>
                  </div>
                </div>
              </div>

              {selectedNodeExec.error && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-900">
                  <span className="font-semibold block">Step Error:</span>
                  <span className="font-mono mt-0.5 block">{selectedNodeExec.error}</span>
                </div>
              )}

              {/* Logs */}
              <div>
                <h4 className="text-xs font-bold text-slate-800 uppercase font-mono tracking-wider mb-2">
                  Node Execution Logs
                </h4>
                <LogViewer logs={selectedNodeExec.logs} />
              </div>

              {/* Node Input & Output Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase font-mono tracking-wider mb-2">
                    Node Input Data
                  </h4>
                  <PayloadViewer title="Aggregated Inputs" data={selectedNodeExec.input} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-slate-800 uppercase font-mono tracking-wider mb-2">
                    Node Output Data
                  </h4>
                  <PayloadViewer title="Emitted Result" data={selectedNodeExec.output} />
                </div>
              </div>
            </>
          ) : (
            <div className="p-8 text-center text-xs text-slate-400">
              Select a node from the left timeline to inspect its execution trace.
            </div>
          )}
        </div>
      </div>

      {/* Global Workflow Input & Final Output */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
        <div>
          <h4 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider mb-2">
            Initial Trigger Payload
          </h4>
          <PayloadViewer title="Workflow Root Input" data={execution.input} />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider mb-2">
            Final Workflow Output
          </h4>
          <PayloadViewer title="Final Sinks / Emitted Payload" data={execution.output} />
        </div>
      </div>
    </div>
  );
};
