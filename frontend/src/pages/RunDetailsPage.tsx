import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { StatusBadge } from '../components/common/StatusBadge';
import { ExecutionTimeline } from '../components/executions/ExecutionTimeline';
import { PayloadViewer } from '../components/executions/PayloadViewer';
import { LogViewer } from '../components/executions/LogViewer';
import { ExecutionService } from '../features/executions/execution.service';
import { apiClient } from '../lib/api-client';
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
  RefreshCw,
  Info,
} from 'lucide-react';

export const RunDetailsPage: React.FC = () => {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();

  const [execution, setExecution] = useState<Execution | null>(null);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLiveConnected, setIsLiveConnected] = useState(false);

  const loadExecution = async (id: string) => {
    try {
      const res = await apiClient.getExecution(id);
      if (res.success && res.data) {
        setExecution(res.data);
        if (res.data.nodeExecutions && Object.keys(res.data.nodeExecutions).length > 0) {
          const nodes = Object.values(res.data.nodeExecutions) as NodeExecution[];
          const failingNode = nodes.find((n) => n.status === 'Failed');
          setSelectedNodeId((prev) => prev || (failingNode ? failingNode.nodeId : nodes[0].nodeId));
        }
        return;
      }
    } catch (_err) {}

    // Fallback to local storage
    const localData = ExecutionService.getExecution(id);
    setExecution(localData);
    if (localData && Object.keys(localData.nodeExecutions).length > 0) {
      const nodes = Object.values(localData.nodeExecutions);
      const failingNode = nodes.find((n) => n.status === 'Failed');
      setSelectedNodeId((prev) => prev || (failingNode ? failingNode.nodeId : nodes[0].nodeId));
    }
  };

  useEffect(() => {
    if (runId) {
      setLoading(true);
      loadExecution(runId).finally(() => setLoading(false));
    }
  }, [runId]);

  // Real-time updates via Server-Sent Events (SSE) with reliable fallback polling
  useEffect(() => {
    if (!runId || !execution) return;
    if (['Succeeded', 'Failed', 'Cancelled', 'Skipped'].includes(execution.status)) {
      setIsLiveConnected(false);
      return;
    }

    let eventSource: EventSource | null = null;
    let pollTimer: any = null;
    let isPolling = false;

    const startPolling = () => {
      if (isPolling || pollTimer) return;
      isPolling = true;
      setIsLiveConnected(false);
      pollTimer = setInterval(() => {
        loadExecution(runId);
      }, 2500);
    };

    try {
      const url = apiClient.getRunEventsUrl(runId);
      eventSource = new EventSource(url);

      eventSource.onopen = () => {
        setIsLiveConnected(true);
      };

      eventSource.addEventListener('run_state', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          setExecution((prev) => {
            if (!prev) return payload;
            return {
              ...prev,
              status: payload.status || prev.status,
              durationMs: payload.durationMs !== undefined ? payload.durationMs : prev.durationMs,
              completedAt: payload.completedAt !== undefined ? payload.completedAt : prev.completedAt,
              error: payload.error !== undefined ? payload.error : prev.error,
              output: payload.output !== undefined ? payload.output : prev.output,
              nodeExecutions: payload.nodeExecutions || prev.nodeExecutions,
            };
          });
        } catch {}
      });

      eventSource.addEventListener('node_state', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          setExecution((prev) => {
            if (!prev || !payload.nodeId) return prev;
            const existingNode = prev.nodeExecutions[payload.nodeId];
            if (!existingNode) return prev;
            return {
              ...prev,
              nodeExecutions: {
                ...prev.nodeExecutions,
                [payload.nodeId]: {
                  ...existingNode,
                  status: payload.status || existingNode.status,
                  durationMs: payload.durationMs !== undefined ? payload.durationMs : existingNode.durationMs,
                  output: payload.output !== undefined ? payload.output : existingNode.output,
                  error: payload.error !== undefined ? payload.error : existingNode.error,
                  attempt: payload.attempt !== undefined ? payload.attempt : existingNode.attempt,
                },
              },
            };
          });
        } catch {}
      });

      eventSource.addEventListener('node_log', (e: MessageEvent) => {
        try {
          const payload = JSON.parse(e.data);
          if (!payload.nodeId || !payload.log) return;
          setExecution((prev) => {
            if (!prev) return prev;
            const existingNode = prev.nodeExecutions[payload.nodeId];
            if (!existingNode) return prev;
            return {
              ...prev,
              nodeExecutions: {
                ...prev.nodeExecutions,
                [payload.nodeId]: {
                  ...existingNode,
                  logs: [...(existingNode.logs || []), payload.log],
                },
              },
            };
          });
        } catch {}
      });

      eventSource.addEventListener('close', () => {
        eventSource?.close();
        setIsLiveConnected(false);
        loadExecution(runId);
      });

      eventSource.onerror = () => {
        eventSource?.close();
        setIsLiveConnected(false);
        startPolling();
      };
    } catch {
      startPolling();
    }

    return () => {
      eventSource?.close();
      if (pollTimer) clearInterval(pollTimer);
    };
  }, [runId, execution?.status]);

  // Deep load node execution details when selected
  useEffect(() => {
    if (!runId || !selectedNodeId) return;
    apiClient
      .getNodeExecution(runId, selectedNodeId)
      .then((res) => {
        if (res.success && res.data) {
          setExecution((prev) => {
            if (!prev) return prev;
            return {
              ...prev,
              nodeExecutions: {
                ...prev.nodeExecutions,
                [selectedNodeId]: {
                  ...(prev.nodeExecutions[selectedNodeId] || {}),
                  ...res.data,
                },
              },
            };
          });
        }
      })
      .catch(() => {});
  }, [runId, selectedNodeId]);

  const canRetry = execution?.status === 'Failed';

  const handleRetry = async () => {
    if (!execution || !canRetry || isRetrying) return;
    try {
      setIsRetrying(true);

      // Call retry endpoint to create child retry execution
      const retryRes = await apiClient.retryRun(execution.id);
      if (retryRes.success && retryRes.data) {
        const newRun = retryRes.data;
        setToastMessage(`Retry run created: #${newRun.id.substring(0, 8)}`);
        setTimeout(() => {
          setToastMessage(null);
          navigate(`/runs/${newRun.id}`);
        }, 600);
        return;
      }

      // Fallback local retry
      const newRun = await ExecutionService.retryExecution(execution.id, {
        maxDelayMs: 600,
      });
      setToastMessage(`Retry launched: #${newRun.id.substring(0, 8)}`);
      setTimeout(() => {
        setToastMessage(null);
        navigate(`/runs/${newRun.id}`);
      }, 600);
    } catch (err: any) {
      alert(`Retry failed: ${err.message}`);
    } finally {
      setIsRetrying(false);
    }
  };

  if (loading && !execution) {
    return (
      <div className="p-8 max-w-7xl mx-auto flex flex-col items-center justify-center min-h-[400px]">
        <Loader2 className="w-8 h-8 text-indigo-600 animate-spin mb-3" />
        <p className="text-xs font-medium text-slate-500">Loading execution trace...</p>
      </div>
    );
  }

  if (!execution) {
    return (
      <div className="p-8 max-w-7xl mx-auto">
        <div className="p-8 bg-white rounded-xl border border-slate-200 text-center">
          <AlertCircle className="w-8 h-8 text-slate-400 mx-auto mb-2" />
          <h3 className="text-base font-semibold text-slate-900">Run Not Found</h3>
          <p className="text-xs text-slate-500 mt-1">
            Execution ID "{runId}" could not be located in server persistence.
          </p>
          <button
            onClick={() => navigate('/runs')}
            className="mt-4 px-4 py-2 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 transition"
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
        badge={
          <div className="flex items-center gap-2">
            <StatusBadge status={execution.status} />
            {isLiveConnected && (
              <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                Live SSE Stream
              </span>
            )}
          </div>
        }
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
              disabled={!canRetry || isRetrying}
              title={
                canRetry
                  ? 'Retry failed DAG nodes in a new attempt'
                  : `Cannot retry run in ${execution.status} status`
              }
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold rounded-lg shadow-xs transition ${
                canRetry
                  ? 'text-white bg-indigo-600 hover:bg-indigo-700'
                  : 'text-slate-400 bg-slate-100 cursor-not-allowed opacity-60'
              }`}
            >
              {isRetrying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RotateCcw className="w-3.5 h-3.5" />
              )}
              <span>{isRetrying ? 'Retrying DAG...' : canRetry ? 'Retry Run' : 'Retry (Eligible only if failed)'}</span>
            </button>
          </div>
        }
      />

      {/* Retry Provenance Notice if this run was created as a retry */}
      {execution.retryOfRunId && (
        <div className="flex items-center justify-between p-3.5 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 shadow-2xs">
          <div className="flex items-center gap-2">
            <RotateCcw className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              This is retry attempt <strong>#{execution.retryAttempt || 2}</strong> of earlier failed execution:{' '}
              <button
                onClick={() => navigate(`/runs/${execution.retryOfRunId}`)}
                className="font-mono font-bold underline hover:text-amber-950"
              >
                #{execution.retryOfRunId.substring(0, 10)}
              </button>
            </span>
          </div>
          <span className="text-[11px] text-amber-700">Original run history is fully preserved</span>
        </div>
      )}

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
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider font-mono">
                DAG Step Sequence
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Click a node to inspect its specific inputs, outputs, and log streams.
              </p>
            </div>
            {isLiveConnected && (
              <span className="flex h-2 w-2 relative" title="Receiving live stream">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
            )}
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
                    <span>Attempt: {selectedNodeExec.attempt || 1}</span>
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
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs font-bold text-slate-800 uppercase font-mono tracking-wider">
                    Node Execution Logs
                  </h4>
                  <span className="text-[10px] text-slate-400 font-mono">
                    {selectedNodeExec.logs?.length || 0} entries (secrets redacted)
                  </span>
                </div>
                <LogViewer logs={selectedNodeExec.logs || []} />
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
          <PayloadViewer title="Workflow Root Input (Sanitized)" data={execution.input} />
        </div>
        <div>
          <h4 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider mb-2">
            Final Workflow Output
          </h4>
          <PayloadViewer title="Final Sinks / Emitted Payload (Sanitized)" data={execution.output} />
        </div>
      </div>
    </div>
  );
};
