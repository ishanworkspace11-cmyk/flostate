import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { WorkflowTable } from '../components/workflows/WorkflowTable';
import { EmptyState } from '../components/common/EmptyState';
import { apiClient } from '../lib/api-client';
import { WorkflowService } from '../features/workflows/workflow.service';
import { Workflow, WorkflowStatus } from '../features/workflows/workflow.types';
import { Plus, Search, GitFork, RefreshCw, AlertTriangle, CheckCircle, Info } from 'lucide-react';

export const WorkflowsPage: React.FC = () => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<{ type: 'success' | 'info' | 'error'; text: string } | null>(null);

  // Create Modal State
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newWfName, setNewWfName] = useState('');
  const [newWfDesc, setNewWfDesc] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [modalError, setModalError] = useState<string | null>(null);

  const showToast = useCallback((text: string, type: 'success' | 'info' | 'error' = 'success') => {
    setToastMessage({ text, type });
    setTimeout(() => {
      setToastMessage((cur) => (cur?.text === text ? null : cur));
    }, 4000);
  }, []);

  const loadWorkflows = useCallback(async (search = searchQuery, status = statusFilter, isManual = false) => {
    if (isManual) setIsRefreshing(true);
    else setIsLoading(true);
    setErrorMessage(null);

    try {
      const res = await apiClient.listWorkflows({
        search: search.trim() || undefined,
        status: status !== 'all' ? status : undefined,
      });

      if (res.success && res.data) {
        setWorkflows(res.data);
      } else {
        throw new Error(res.error?.message || 'Failed to load workflows');
      }
    } catch (err: any) {
      // Local storage fallback for standalone resilience
      try {
        let localList = WorkflowService.listWorkflows();
        if (status !== 'all') {
          localList = localList.filter((w) => w.status === status);
        }
        if (search.trim()) {
          const s = search.toLowerCase();
          localList = localList.filter((w) => w.name.toLowerCase().includes(s) || w.description.toLowerCase().includes(s));
        }
        setWorkflows(localList);
      } catch (_e) {
        setErrorMessage(err.message || 'Unable to connect to workflows service.');
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [searchQuery, statusFilter]);

  // Debounced search trigger
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const handleSearchChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    searchTimeoutRef.current = setTimeout(() => {
      loadWorkflows(val, statusFilter);
    }, 300);
  };

  const handleStatusFilterChange = (newStatus: string) => {
    setStatusFilter(newStatus);
    loadWorkflows(searchQuery, newStatus);
  };

  useEffect(() => {
    loadWorkflows(searchQuery, statusFilter);
    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, []);

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedName = newWfName.trim();
    if (!trimmedName) {
      setModalError('Workflow name is required');
      return;
    }

    setIsSubmitting(true);
    setModalError(null);

    try {
      const res = await apiClient.createWorkflow({
        name: trimmedName,
        description: newWfDesc.trim(),
        status: 'draft',
        nodes: [
          {
            id: `node_trig_${Date.now()}`,
            type: 'trigger',
            label: 'Manual Trigger',
            position: { x: 100, y: 150 },
            config: { triggerType: 'manual', defaultPayload: { message: 'Workflow initiated' } },
          },
        ],
        edges: [],
      });

      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Server rejected workflow creation');
      }

      setIsCreateModalOpen(false);
      setNewWfName('');
      setNewWfDesc('');
      showToast(`Workflow '${res.data.name}' created`, 'success');
      navigate(`/builder/${res.data.id}`);
    } catch (err: any) {
      setModalError(err.message || 'Failed to create workflow');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDuplicate = async (id: string) => {
    try {
      const res = await apiClient.duplicateWorkflow(id);
      if (!res.success || !res.data) {
        throw new Error(res.error?.message || 'Duplication failed');
      }
      showToast(`Duplicated workflow as "${res.data.name}"`, 'success');
      loadWorkflows(searchQuery, statusFilter);
    } catch (err: any) {
      showToast(`Duplicate error: ${err.message}`, 'error');
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const res = await apiClient.deleteWorkflow(id);
      if (!res.success) {
        throw new Error(res.error?.message || 'Delete failed');
      }

      if (res.data?.archived) {
        showToast(
          res.data.message || 'Workflow has historical runs and was archived to preserve audit logs.',
          'info'
        );
      } else {
        showToast(res.data?.message || 'Workflow deleted successfully.', 'success');
      }
      loadWorkflows(searchQuery, statusFilter);
    } catch (err: any) {
      showToast(`Delete error: ${err.message}`, 'error');
    }
  };

  const handleToggleStatus = async (id: string) => {
    const wf = workflows.find((w) => w.id === id);
    if (!wf) return;

    try {
      if (wf.status === 'paused') {
        const res = await apiClient.activateWorkflow(id);
        if (!res.success) throw new Error(res.error?.message || 'Activation failed');
        showToast(`Workflow '${wf.name}' activated and ready for triggers`, 'success');
      } else if (wf.status === 'published') {
        const res = await apiClient.pauseWorkflow(id);
        if (!res.success) throw new Error(res.error?.message || 'Pause failed');
        showToast(`Workflow '${wf.name}' paused`, 'info');
      } else {
        // Draft workflow cannot be toggled directly
        showToast(
          'Draft workflows must be validated and published before activating.',
          'info'
        );
        return;
      }
      loadWorkflows(searchQuery, statusFilter);
    } catch (err: any) {
      showToast(`Status error: ${err.message}`, 'error');
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Toast Alert */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom duration-200">
          <div
            className={`px-4 py-2.5 rounded-xl shadow-xl text-xs font-medium flex items-center gap-2 border ${
              toastMessage.type === 'error'
                ? 'bg-rose-900 border-rose-800 text-rose-100'
                : toastMessage.type === 'info'
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-emerald-950 border-emerald-800 text-emerald-100'
            }`}
          >
            {toastMessage.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : toastMessage.type === 'info' ? (
              <Info className="w-4 h-4 text-indigo-400 shrink-0" />
            ) : (
              <CheckCircle className="w-4 h-4 text-emerald-400 shrink-0" />
            )}
            <span>{toastMessage.text}</span>
          </div>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title="Workflows"
        description="Design, publish, and manage Directed Acyclic Graph automation workflows."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Workflows' }]}
        actions={
          <button
            onClick={() => {
              setModalError(null);
              setIsCreateModalOpen(true);
            }}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create Workflow</span>
          </button>
        }
      />

      {/* Error Message Banner */}
      {errorMessage && (
        <div className="p-4 rounded-xl border border-rose-200 bg-rose-50/80 text-rose-800 text-xs flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{errorMessage}</span>
          </div>
          <button
            onClick={() => loadWorkflows(searchQuery, statusFilter, true)}
            className="px-3 py-1 font-semibold text-rose-700 hover:bg-rose-100 rounded-md transition"
          >
            Retry
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search workflows by name or description..."
            value={searchQuery}
            onChange={(e) => handleSearchChange(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
            {['all', 'published', 'draft', 'paused'].map((status) => (
              <button
                key={status}
                onClick={() => handleStatusFilterChange(status)}
                className={`px-2.5 py-1 rounded-md capitalize transition ${
                  statusFilter === status
                    ? 'bg-white text-slate-900 shadow-2xs font-semibold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {status}
              </button>
            ))}
          </div>

          <button
            onClick={() => loadWorkflows(searchQuery, statusFilter, true)}
            disabled={isLoading || isRefreshing}
            title="Reload workflows from server"
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-indigo-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Workflows List Table or Empty State */}
      {isLoading ? (
        <div className="bg-white rounded-xl border border-slate-200 p-8 space-y-4 animate-pulse">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-12 bg-slate-50 rounded-lg" />
          ))}
        </div>
      ) : workflows.length > 0 ? (
        <WorkflowTable
          workflows={workflows}
          onWorkflowChange={() => loadWorkflows(searchQuery, statusFilter)}
          onDuplicate={handleDuplicate}
          onDelete={handleDelete}
          onToggleStatus={handleToggleStatus}
        />
      ) : (
        <EmptyState
          icon={GitFork}
          title={searchQuery || statusFilter !== 'all' ? 'No matching workflows' : 'No workflows yet'}
          description={
            searchQuery || statusFilter !== 'all'
              ? 'Try adjusting your search criteria or filter options.'
              : 'Create your first workflow to orchestrate tasks across services, APIs, and webhooks.'
          }
          action={
            searchQuery || statusFilter !== 'all'
              ? {
                  label: 'Clear Filters',
                  onClick: () => {
                    setSearchQuery('');
                    setStatusFilter('all');
                    loadWorkflows('', 'all');
                  },
                }
              : {
                  label: 'Create Workflow',
                  onClick: () => {
                    setModalError(null);
                    setIsCreateModalOpen(true);
                  },
                }
          }
        />
      )}

      {/* Create Workflow Modal */}
      {isCreateModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-xs">
          <div className="w-full max-w-md bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden">
            <form onSubmit={handleCreateSubmit}>
              <div className="p-6">
                <h3 className="text-base font-bold text-slate-900">Create New Workflow</h3>
                <p className="mt-1 text-xs text-slate-500">
                  Initializes a new Directed Acyclic Graph editor session.
                </p>

                {modalError && (
                  <div className="mt-3 p-3 rounded-lg border border-rose-200 bg-rose-50 text-rose-800 text-xs flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{modalError}</span>
                  </div>
                )}

                <div className="mt-4 space-y-3.5">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase font-mono mb-1">
                      Workflow Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={newWfName}
                      onChange={(e) => setNewWfName(e.target.value)}
                      placeholder="e.g. Sync Stripe Invoices to Datadog"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
                      autoFocus
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 uppercase font-mono mb-1">
                      Description (Optional)
                    </label>
                    <textarea
                      rows={3}
                      value={newWfDesc}
                      onChange={(e) => setNewWfDesc(e.target.value)}
                      placeholder="Brief summary of pipeline purpose..."
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
              </div>

              <div className="px-6 py-3.5 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsCreateModalOpen(false)}
                  disabled={isSubmitting}
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition shadow-xs disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmitting && <RefreshCw className="w-3.5 h-3.5 animate-spin" />}
                  <span>Create & Launch Builder</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
