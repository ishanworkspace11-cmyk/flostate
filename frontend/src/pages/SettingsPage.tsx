import React, { useState, useEffect } from 'react';
import { PageHeader } from '../components/common/PageHeader';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { WorkflowService } from '../features/workflows/workflow.service';
import { ExecutionService } from '../features/executions/execution.service';
import { TriggerService } from '../features/triggers/trigger.service';
import {
  RotateCcw,
  Database,
  ShieldCheck,
  Server,
  Layers,
  Info,
  CheckCircle,
} from 'lucide-react';

export const SettingsPage: React.FC = () => {
  const [isResetConfirmOpen, setIsResetConfirmOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [storageStats, setStorageStats] = useState({
    workflowCount: 0,
    executionCount: 0,
    triggerCount: 0,
    estimatedKb: 0,
  });

  useEffect(() => {
    calculateStats();
  }, []);

  const calculateStats = () => {
    const wfList = WorkflowService.listWorkflows();
    const exList = ExecutionService.listExecutions();
    const trList = TriggerService.listTriggers();

    let totalChars = 0;
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith('dormammu_')) {
        totalChars += (localStorage.getItem(key) || '').length;
      }
    }

    setStorageStats({
      workflowCount: wfList.length,
      executionCount: exList.length,
      triggerCount: trList.length,
      estimatedKb: Math.round((totalChars * 2) / 1024), // Approx 2 bytes per char
    });
  };

  const handleResetDemoData = () => {
    WorkflowService.resetDemoWorkflows();
    ExecutionService.resetDemoExecutions();
    TriggerService.resetDemoTriggers();
    calculateStats();
    setIsResetConfirmOpen(false);
    setToastMessage('Demo workflows, executions, and triggers have been reset to factory state.');
    setTimeout(() => setToastMessage(null), 3500);
  };

  return (
    <div className="p-8 max-w-4xl mx-auto space-y-6">
      {toastMessage && (
        <div className="fixed top-20 right-6 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-xl text-xs font-medium flex items-center gap-2 animate-in slide-in-from-top duration-150">
          <CheckCircle className="w-4 h-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      <PageHeader
        title="Settings & Environment"
        description="Application configuration, local demo storage, and architecture specifications."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Settings' }]}
      />

      {/* Persistence Card */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-2xs space-y-5">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-indigo-50 border border-indigo-100 text-indigo-600">
            <Database className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Local Storage Adapter</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Client-side persistent caching using browser LocalStorage.
            </p>
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-2">
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-mono block">Workflows</span>
            <span className="text-lg font-bold text-slate-900 font-mono mt-0.5 block">
              {storageStats.workflowCount}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-mono block">Executions</span>
            <span className="text-lg font-bold text-slate-900 font-mono mt-0.5 block">
              {storageStats.executionCount}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-mono block">Triggers</span>
            <span className="text-lg font-bold text-slate-900 font-mono mt-0.5 block">
              {storageStats.triggerCount}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-center">
            <span className="text-[10px] text-slate-500 uppercase font-mono block">Storage Size</span>
            <span className="text-lg font-bold text-slate-900 font-mono mt-0.5 block">
              ~{storageStats.estimatedKb} KB
            </span>
          </div>
        </div>

        <div className="pt-4 border-t border-slate-100 flex items-center justify-between">
          <div>
            <h4 className="text-xs font-semibold text-slate-900">Reset Demo Data</h4>
            <p className="text-[11px] text-slate-500">
              Restore default sample workflows, executions, and triggers.
            </p>
          </div>
          <button
            onClick={() => setIsResetConfirmOpen(true)}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-lg transition"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Factory Seeds</span>
          </button>
        </div>
      </div>

      {/* Architecture & Backend Roadmap */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-2xs space-y-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-lg bg-emerald-50 border border-emerald-100 text-emerald-600">
            <Server className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Distributed Backend Path</h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Clean separation ready for production microservices.
            </p>
          </div>
        </div>

        <div className="space-y-3 text-xs text-slate-600 leading-relaxed">
          <p>
            The Dormammu Loop frontend is decoupled from storage via clean service interfaces:
          </p>
          <ul className="list-disc pl-5 space-y-1 font-mono text-[11px] text-slate-700">
            <li><strong className="text-slate-900 font-sans">Node.js + Express API:</strong> Replaces `workflow.service.ts` and `execution.service.ts` with REST endpoints.</li>
            <li><strong className="text-slate-900 font-sans">PostgreSQL:</strong> Stores relational workflow DAG definitions, versioning, and execution logs.</li>
            <li><strong className="text-slate-900 font-sans">Redis + BullMQ:</strong> Distributed FIFO/Priority queues with concurrency management and heartbeat monitoring.</li>
            <li><strong className="text-slate-900 font-sans">Execution Engine:</strong> The TypeScript engine in `execution.engine.ts` is 100% pure logic with zero React dependencies, ready to run directly on BullMQ backend worker nodes.</li>
          </ul>
        </div>
      </div>

      {/* Environment & Version Info */}
      <div className="bg-white rounded-xl border border-slate-200/90 p-6 shadow-2xs space-y-3 text-xs">
        <h3 className="text-xs font-bold text-slate-900 uppercase font-mono tracking-wider">
          Runtime Environment
        </h3>
        <div className="grid grid-cols-2 gap-3 font-mono text-[11px] text-slate-600">
          <div>Engine Version: <span className="font-semibold text-slate-900">v0.1.0-mvp</span></div>
          <div>Canvas Engine: <span className="font-semibold text-slate-900">@xyflow/react v12</span></div>
          <div>Execution Context: <span className="font-semibold text-emerald-600">Pure TypeScript DAG Runner</span></div>
          <div>Environment: <span className="font-semibold text-slate-900">Vite + React 18</span></div>
        </div>
      </div>

      <ConfirmDialog
        isOpen={isResetConfirmOpen}
        title="Reset Demo Data"
        message="This will reset all custom workflows and execution logs back to initial factory demo seed records. Any unsaved custom graphs will be overwritten."
        confirmLabel="Reset Data"
        isDestructive
        onConfirm={handleResetDemoData}
        onCancel={() => setIsResetConfirmOpen(false)}
      />
    </div>
  );
};
