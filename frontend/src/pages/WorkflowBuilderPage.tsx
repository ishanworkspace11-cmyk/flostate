import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  Node,
  Edge,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
  Connection,
  OnNodesChange,
  OnEdgesChange,
  OnConnect,
} from '@xyflow/react';
import { WorkflowCanvas } from '../components/editor/WorkflowCanvas';
import { NodePalette } from '../components/editor/NodePalette';
import { NodeConfigPanel } from '../components/editor/NodeConfigPanel';
import { ValidationResults } from '../components/editor/ValidationResults';
import { apiClient } from '../lib/api-client';
import { WorkflowService } from '../features/workflows/workflow.service';
import { ExecutionService } from '../features/executions/execution.service';
import { validateWorkflow } from '../features/workflows/workflow.validation';
import { ExecutionEngine } from '../features/executions/execution.engine';
import {
  Workflow,
  WorkflowNode,
  WorkflowEdge,
  NodeType,
  ValidationResult,
} from '../features/workflows/workflow.types';
import { Execution, NodeExecution, ExecutionStatus } from '../features/executions/execution.types';
import { generateId } from '../lib/utils';
import {
  Save,
  CheckCircle,
  Play,
  Upload,
  AlertCircle,
  ArrowLeft,
  Loader2,
  ExternalLink,
  ChevronUp,
  ChevronDown,
  Terminal,
} from 'lucide-react';
import { LogViewer } from '../components/executions/LogViewer';
import { PayloadViewer } from '../components/executions/PayloadViewer';
import { ConfirmDialog } from '../components/common/ConfirmDialog';

export const WorkflowBuilderPage: React.FC = () => {
  const { workflowId } = useParams<{ workflowId: string }>();
  const navigate = useNavigate();

  // Workflow state
  const [workflow, setWorkflow] = useState<Workflow | null>(null);
  const [workflowName, setWorkflowName] = useState('Untitled Workflow');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  // React Flow state
  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  // Validation state
  const [validation, setValidation] = useState<ValidationResult | null>(null);
  const [showValidationModal, setShowValidationModal] = useState(false);

  // Test Run & Execution state
  const [isRunning, setIsRunning] = useState(false);
  const [activeExecution, setActiveExecution] = useState<Execution | null>(null);
  const [isConsoleDrawerOpen, setIsConsoleDrawerOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<{ text: string; type: 'success' | 'error'; runId?: string } | null>(null);

  // Warn on browser close/refresh when there are unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  // Load workflow on mount or route param change
  useEffect(() => {
    let isCancelled = false;

    async function load() {
      let targetWf: Workflow | null = null;
      if (workflowId) {
        try {
          const res = await apiClient.getWorkflow(workflowId);
          if (res.success && res.data) {
            targetWf = res.data;
          }
        } catch (_e) {}
        if (!targetWf) {
          targetWf = WorkflowService.getWorkflow(workflowId);
        }
      }

      if (!targetWf) {
        if (workflowId) {
          try {
            const listRes = await apiClient.listWorkflows();
            if (listRes.success && listRes.data && listRes.data.length > 0) {
              targetWf = listRes.data[0];
            }
          } catch (_e) {}
          if (!targetWf) {
            const list = WorkflowService.listWorkflows();
            targetWf = list.length > 0 ? list[0] : WorkflowService.createWorkflow({ name: 'Default DAG Workflow' });
          }
          if (!isCancelled) navigate(`/builder/${targetWf.id}`, { replace: true });
        } else {
          try {
            const createRes = await apiClient.createWorkflow({
              name: `Pipeline_${Math.floor(Math.random() * 900 + 100)}`,
              description: 'Newly created DAG automation pipeline',
            });
            if (createRes.success && createRes.data) {
              targetWf = createRes.data;
            }
          } catch (_e) {}
          if (!targetWf) {
            targetWf = WorkflowService.createWorkflow({
              name: `Pipeline_${Math.floor(Math.random() * 900 + 100)}`,
              description: 'Newly created DAG automation pipeline',
            });
          }
          if (!isCancelled) navigate(`/builder/${targetWf.id}`, { replace: true });
        }
      }

      if (targetWf && !isCancelled) {
        setWorkflow(targetWf);
        setWorkflowName(targetWf.name);
        loadGraphFromWorkflow(targetWf);
        setHasUnsavedChanges(false);
      }
    }

    load();
    return () => {
      isCancelled = true;
    };
  }, [workflowId, navigate]);

  // Convert workflow model into React Flow nodes & edges
  const loadGraphFromWorkflow = (wf: Workflow) => {
    const rfNodes: Node[] = wf.nodes.map((n) => ({
      id: n.id,
      type: 'custom',
      position: n.position,
      data: {
        label: n.label,
        type: n.type,
        config: n.config,
      },
    }));

    const rfEdges: Edge[] = wf.edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
      type: 'smoothstep',
    }));

    setNodes(rfNodes);
    setEdges(rfEdges);
  };

  // Construct current workflow object from state
  const getCurrentWorkflowObject = useCallback((): Workflow => {
    if (!workflow) {
      throw new Error('No active workflow loaded');
    }

    const currentNodes: WorkflowNode[] = nodes.map((n) => ({
      id: n.id,
      type: (n.data?.type as NodeType) || 'transform',
      label: (n.data?.label as string) || 'Node',
      position: n.position,
      config: (n.data?.config as Record<string, any>) || {},
    }));

    const currentEdges: WorkflowEdge[] = edges.map((e) => ({
      id: e.id,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle,
      targetHandle: e.targetHandle,
    }));

    return {
      ...workflow,
      name: workflowName,
      nodes: currentNodes,
      edges: currentEdges,
    };
  }, [workflow, workflowName, nodes, edges]);

  // React Flow Handlers
  const onNodesChange: OnNodesChange = useCallback((changes) => {
    setNodes((nds) => applyNodeChanges(changes, nds));
    const removedIds = changes.filter((c) => c.type === 'remove').map((c) => (c as any).id);
    if (selectedNodeId && removedIds.includes(selectedNodeId)) {
      setSelectedNodeId(null);
    }
    setHasUnsavedChanges(true);
  }, [selectedNodeId]);

  const onEdgesChange: OnEdgesChange = useCallback((changes) => {
    setEdges((eds) => applyEdgeChanges(changes, eds));
    setHasUnsavedChanges(true);
  }, []);

  const onConnect: OnConnect = useCallback((connection: Connection) => {
    if (!connection.source || !connection.target) return;
    if (connection.source === connection.target) {
      setToastMessage({ text: 'Self-connecting loops are forbidden in DAGs.', type: 'error' });
      return;
    }

    setEdges((eds) =>
      addEdge(
        {
          ...connection,
          id: generateId('e'),
          type: 'customEdge',
        },
        eds
      )
    );
    setHasUnsavedChanges(true);
  }, []);

  const onNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    setSelectedNodeId(node.id);
  }, []);

  const onPaneClick = useCallback(() => {
    setSelectedNodeId(null);
  }, []);

  // Adding node from Palette
  const handleAddNode = useCallback(
    (type: NodeType, position?: { x: number; y: number }) => {
      const newNodeId = generateId(`node_${type}`);
      const defaultConfigs: Record<NodeType, Record<string, any>> = {
        trigger: { triggerType: 'manual', defaultPayload: { demoKey: 'demoValue' } },
        transform: { operation: 'pass_through' },
        httpRequest: { method: 'GET', url: 'https://jsonplaceholder.typicode.com/todos/1' },
        delay: { durationMs: 1000 },
        webhookAction: { url: 'https://hooks.slack.com/services/...' },
      };

      const labels: Record<NodeType, string> = {
        trigger: 'Trigger Node',
        transform: 'Transform Step',
        httpRequest: 'HTTP Call',
        delay: 'Delay Timer',
        webhookAction: 'Outbound Webhook',
      };

      setNodes((nds) => {
        const finalPos = position || {
          x: 140 + (nds.length % 5) * 60 + Math.floor(nds.length / 5) * 30,
          y: 120 + (nds.length % 5) * 50,
        };

        const newNode: Node = {
          id: newNodeId,
          type: 'custom',
          position: finalPos,
          data: {
            label: labels[type] || 'New Node',
            type,
            config: defaultConfigs[type] || {},
          },
        };

        return [...nds, newNode];
      });

      setSelectedNodeId(newNodeId);
      setHasUnsavedChanges(true);
    },
    []
  );

  // Updating node from Config Panel
  const handleUpdateNode = useCallback((nodeId: string, updates: Partial<WorkflowNode>) => {
    setNodes((nds) =>
      nds.map((n) => {
        if (n.id !== nodeId) return n;
        return {
          ...n,
          data: {
            ...n.data,
            ...(updates.label !== undefined ? { label: updates.label } : {}),
            ...(updates.config !== undefined ? { config: updates.config } : {}),
          },
        };
      })
    );
    setHasUnsavedChanges(true);
  }, []);

  // Deleting node
  const handleDeleteNode = useCallback((nodeId: string) => {
    setNodes((nds) => nds.filter((n) => n.id !== nodeId));
    setEdges((eds) => eds.filter((e) => e.source !== nodeId && e.target !== nodeId));
    setSelectedNodeId(null);
    setHasUnsavedChanges(true);
  }, []);

  // Selected node lookup for Config Panel
  const selectedNode: WorkflowNode | null = useMemo(() => {
    if (!selectedNodeId) return null;
    const found = nodes.find((n) => n.id === selectedNodeId);
    if (!found) return null;
    return {
      id: found.id,
      type: (found.data?.type as NodeType) || 'transform',
      label: (found.data?.label as string) || 'Node',
      position: found.position,
      config: (found.data?.config as Record<string, any>) || {},
    };
  }, [selectedNodeId, nodes]);

  // Validation
  const handleValidate = async () => {
    if (!workflow) return;
    const currentWf = getCurrentWorkflowObject();
    try {
      const res = await apiClient.validateWorkflow(currentWf);
      if (res.success && res.data) {
        setValidation(res.data);
        setShowValidationModal(true);
        return res.data;
      }
    } catch (_e) {}

    const result = validateWorkflow(currentWf);
    setValidation(result);
    setShowValidationModal(true);
    return result;
  };

  // Save workflow
  const handleSave = async () => {
    if (!workflow) return;
    const currentWf = getCurrentWorkflowObject();

    try {
      const res = await apiClient.updateWorkflow(workflow.id, {
        name: currentWf.name,
        nodes: currentWf.nodes,
        edges: currentWf.edges,
        expectedVersion: workflow.draftVersion,
      });

      if (res.success && res.data) {
        setWorkflow(res.data);
        WorkflowService.updateWorkflow(workflow.id, res.data);
        setHasUnsavedChanges(false);
        setToastMessage({ text: `Workflow saved (v${res.data.draftVersion}).`, type: 'success' });
        setTimeout(() => setToastMessage(null), 2500);
        return;
      } else {
        throw new Error(res.error?.message || 'Server rejected save');
      }
    } catch (err: any) {
      if (err.message?.includes('Conflict')) {
        setToastMessage({ text: `Save conflict: ${err.message}`, type: 'error' });
      } else {
        // Fallback local save
        const updated = WorkflowService.updateWorkflow(workflow.id, {
          name: currentWf.name,
          nodes: currentWf.nodes,
          edges: currentWf.edges,
        });
        setWorkflow(updated);
        setHasUnsavedChanges(false);
        setToastMessage({ text: 'Workflow saved locally (backend offline).', type: 'success' });
      }
      setTimeout(() => setToastMessage(null), 3000);
    }
  };

  // Publish workflow
  const handlePublish = async () => {
    if (!workflow) return;
    const currentWf = getCurrentWorkflowObject();
    const result = validateWorkflow(currentWf);
    if (!result.isValid) {
      setValidation(result);
      setShowValidationModal(true);
      setToastMessage({ text: 'Cannot publish: Graph has validation errors.', type: 'error' });
      return;
    }

    try {
      // 1. Save graph first
      await apiClient.updateWorkflow(workflow.id, {
        name: currentWf.name,
        nodes: currentWf.nodes,
        edges: currentWf.edges,
      });

      // 2. Publish
      const pubRes = await apiClient.publishWorkflow(workflow.id);
      if (pubRes.success && pubRes.data) {
        setWorkflow(pubRes.data);
        WorkflowService.updateWorkflow(workflow.id, pubRes.data);
        setHasUnsavedChanges(false);
        setToastMessage({ text: `Workflow published as v${pubRes.data.publishedVersion}!`, type: 'success' });
        setTimeout(() => setToastMessage(null), 3000);
        return;
      } else {
        throw new Error(pubRes.error?.message || 'Publishing failed on server');
      }
    } catch (err: any) {
      setToastMessage({ text: `Publish error: ${err.message}`, type: 'error' });
      setTimeout(() => setToastMessage(null), 3500);
    }
  };

  // Test Run: Executes the DAG with live step animation on the canvas!
  const handleTestRun = async () => {
    if (!workflow || isRunning) return;

    // Validate first
    const currentWf = getCurrentWorkflowObject();
    const result = validateWorkflow(currentWf);
    if (!result.isValid) {
      setValidation(result);
      setShowValidationModal(true);
      setToastMessage({ text: 'Cannot execute: Fix DAG validation errors first.', type: 'error' });
      return;
    }

    // Reset node statuses on canvas to Pending
    setNodes((nds) =>
      nds.map((n) => ({
        ...n,
        data: {
          ...n.data,
          executionStatus: 'Pending',
          executionError: null,
          durationMs: undefined,
        },
      }))
    );

    setIsRunning(true);
    setIsConsoleDrawerOpen(true);

    try {
      // Trigger durable backend execution run record
      let backendRunId: string | undefined = undefined;
      try {
        const createRes = await apiClient.createRun(workflow.id, {
          input: { source: 'builder_test_run' },
          triggerType: 'manual',
        });
        if (createRes.success && createRes.data?.id) {
          backendRunId = createRes.data.id;
        }
      } catch (_backendErr) {
        // Standalone or offline fallback
      }

      // Execute DAG with live animation on canvas
      const execution = await ExecutionEngine.execute(currentWf, {
        triggerType: 'builder_test_run',
        maxDelayMs: 1200, // fast-paced for responsive UI feedback
        onNodeStart: (nodeId) => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      executionStatus: 'Running',
                    },
                  }
                : n
            )
          );
        },
        onNodeComplete: (nodeId, nodeExec) => {
          setNodes((nds) =>
            nds.map((n) =>
              n.id === nodeId
                ? {
                    ...n,
                    data: {
                      ...n.data,
                      executionStatus: nodeExec.status,
                      executionError: nodeExec.error,
                      durationMs: nodeExec.durationMs,
                    },
                  }
                : n
            )
          );
        },
      });

      if (backendRunId) {
        execution.id = backendRunId;
      }

      // Persist the executed run for history inspection!
      ExecutionService.saveExecution(execution);
      setActiveExecution(execution);

      if (execution.status === 'Succeeded') {
        setToastMessage({
          text: `Test run finished in ${execution.durationMs}ms with status: Succeeded`,
          type: 'success',
          runId: execution.id,
        });
      } else {
        setToastMessage({
          text: `Test run completed with status: ${execution.status}`,
          type: 'error',
          runId: execution.id,
        });
      }
    } catch (err: any) {
      setToastMessage({ text: `Execution engine error: ${err.message}`, type: 'error' });
    } finally {
      setIsRunning(false);
      setTimeout(() => setToastMessage(null), 6000);
    }
  };

  const handleBackToWorkflows = () => {
    if (hasUnsavedChanges) {
      setShowExitConfirm(true);
    } else {
      navigate('/workflows');
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50">
      {/* Toast Alert */}
      {toastMessage && (
        <div
          className={`fixed top-20 right-6 z-50 px-4 py-2.5 rounded-lg shadow-xl text-xs font-medium flex items-center gap-2 animate-in slide-in-from-top duration-150 ${
            toastMessage.type === 'success'
              ? 'bg-slate-900 text-white border border-slate-800'
              : 'bg-rose-600 text-white'
          }`}
        >
          {toastMessage.type === 'success' ? (
            <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <AlertCircle className="w-4 h-4 text-white shrink-0" />
          )}
          <span>{toastMessage.text}</span>
          {toastMessage.runId && (
            <button
              onClick={() => navigate(`/runs/${toastMessage.runId}`)}
              className="ml-2 font-semibold underline hover:text-indigo-200 transition shrink-0"
            >
              View Run Details &rarr;
            </button>
          )}
        </div>
      )}

      {/* Editor Sub-Header */}
      <div className="h-14 bg-white border-b border-slate-200 px-4 flex items-center justify-between shrink-0 z-20">
        <div className="flex items-center gap-3">
          <button
            onClick={handleBackToWorkflows}
            title="Back to workflows"
            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-lg transition"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>

          <input
            type="text"
            value={workflowName}
            onChange={(e) => {
              setWorkflowName(e.target.value);
              setHasUnsavedChanges(true);
            }}
            className="font-bold text-sm text-slate-900 px-2 py-1 rounded hover:bg-slate-100 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-indigo-500 border border-transparent focus:border-indigo-400 max-w-sm"
          />

          <span className="text-[11px] font-mono text-slate-400">
            v{workflow?.draftVersion || 1}
          </span>

          <span
            className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
              hasUnsavedChanges
                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                : 'bg-slate-100 text-slate-600'
            }`}
          >
            {hasUnsavedChanges ? 'Unsaved Changes' : 'Saved'}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={handleValidate}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition"
          >
            <CheckCircle className="w-3.5 h-3.5 text-slate-500" />
            <span>Validate</span>
          </button>

          <button
            onClick={handleTestRun}
            disabled={isRunning}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition shadow-xs disabled:opacity-50"
          >
            {isRunning ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current" />
            )}
            <span>{isRunning ? 'Running DAG...' : 'Test Run'}</span>
          </button>

          <button
            onClick={handleSave}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition"
          >
            <Save className="w-3.5 h-3.5 text-slate-500" />
            <span>Save</span>
          </button>

          <button
            onClick={handlePublish}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition shadow-xs"
          >
            <Upload className="w-3.5 h-3.5" />
            <span>Publish</span>
          </button>
        </div>
      </div>

      {/* Editor Body */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* Left Palette */}
        <NodePalette onAddNode={(type) => handleAddNode(type)} />

        {/* Center Canvas */}
        <div className="flex-1 relative h-full">
          <WorkflowCanvas
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onConnect={onConnect}
            onNodeClick={onNodeClick}
            onPaneClick={onPaneClick}
            onDropNode={handleAddNode}
          />

          {/* Validation Floating Card */}
          {showValidationModal && validation && (
            <ValidationResults
              validation={validation}
              onClose={() => setShowValidationModal(false)}
              onSelectNode={(nodeId) => setSelectedNodeId(nodeId)}
            />
          )}

          {/* Floating Drawer Trigger for Live Console */}
          {activeExecution && (
            <button
              onClick={() => setIsConsoleDrawerOpen(!isConsoleDrawerOpen)}
              className="absolute bottom-4 right-4 z-20 flex items-center gap-2 px-3 py-1.5 bg-slate-900 text-white rounded-lg shadow-lg text-xs font-mono border border-slate-800 hover:bg-slate-800 transition"
            >
              <Terminal className="w-3.5 h-3.5 text-indigo-400" />
              <span>Execution Output (#{activeExecution.id.substring(0, 8)})</span>
              {isConsoleDrawerOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
            </button>
          )}

          {/* Live Execution Drawer */}
          {isConsoleDrawerOpen && activeExecution && (
            <div className="absolute bottom-0 left-0 right-0 z-30 max-h-80 bg-slate-950 text-slate-100 border-t border-slate-800 shadow-2xl flex flex-col font-mono text-xs">
              <div className="px-4 py-2.5 bg-slate-900 border-b border-slate-800 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="font-bold text-indigo-400">Execution Console</span>
                  <span className="text-[11px] text-slate-400">
                    Status: <strong className={activeExecution.status === 'Succeeded' ? 'text-emerald-400' : 'text-rose-400'}>{activeExecution.status}</strong>
                  </span>
                  <span className="text-[11px] text-slate-400">
                    Elapsed: {activeExecution.durationMs}ms
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => navigate(`/runs/${activeExecution.id}`)}
                    className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 underline"
                  >
                    <span>Full Run Details</span>
                    <ExternalLink className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => setIsConsoleDrawerOpen(false)}
                    className="text-slate-400 hover:text-white p-1"
                  >
                    <ChevronDown className="w-4 h-4" />
                  </button>
                </div>
              </div>

              <div className="p-4 grid grid-cols-1 md:grid-cols-2 gap-4 overflow-y-auto">
                <div>
                  <h5 className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">
                    Live Engine Logs
                  </h5>
                  <div className="space-y-1 max-h-48 overflow-y-auto font-mono text-[11px]">
                    {Object.values(activeExecution.nodeExecutions).flatMap((n) =>
                      n.logs.map((l, i) => (
                        <div key={`${n.nodeId}-${i}`} className="flex items-start gap-2 text-slate-300">
                          <span className="text-slate-500 shrink-0">[{n.nodeLabel}]</span>
                          <span className={l.level === 'error' ? 'text-rose-400' : l.level === 'warn' ? 'text-amber-400' : 'text-slate-200'}>
                            {l.message}
                          </span>
                        </div>
                      ))
                    )}
                  </div>
                </div>

                <div>
                  <h5 className="text-[11px] uppercase tracking-wider text-slate-400 mb-1.5">
                    Workflow Final Output
                  </h5>
                  <PayloadViewer data={activeExecution.output} maxHeight="max-h-48" />
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right Config Panel */}
        {selectedNode && (
          <NodeConfigPanel
            key={selectedNode.id}
            node={selectedNode}
            onUpdateNode={handleUpdateNode}
            onDeleteNode={handleDeleteNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>

      {/* Discard Changes Confirmation Dialog */}
      <ConfirmDialog
        isOpen={showExitConfirm}
        title="Unsaved Changes"
        message="You have unsaved changes in this workflow. Leaving without saving will discard your modifications."
        confirmLabel="Leave without Saving"
        cancelLabel="Stay in Builder"
        isDestructive
        onConfirm={() => {
          setShowExitConfirm(false);
          navigate('/workflows');
        }}
        onCancel={() => setShowExitConfirm(false)}
      />
    </div>
  );
};
