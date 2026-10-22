import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { PageHeader } from '../components/common/PageHeader';
import { WorkflowTable } from '../components/workflows/WorkflowTable';
import { EmptyState } from '../components/common/EmptyState';
import { WorkflowService } from '../features/workflows/workflow.service';
import { Workflow, WorkflowStatus } from '../features/workflows/workflow.types';
import { Plus, Search, Filter, GitFork, RefreshCw } from 'lucide-react';

export const WorkflowsPage: React.FC = () => {
  const navigate = useNavigate();
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newWfName, setNewWfName] = useState('');
  const [newWfDesc, setNewWfDesc] = useState('');

  useEffect(() => {
    loadWorkflows();
  }, []);

  const loadWorkflows = () => {
    setWorkflows(WorkflowService.listWorkflows());
  };

  const handleCreateSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newWfName.trim()) return;

    const created = WorkflowService.createWorkflow({
      name: newWfName.trim(),
      description: newWfDesc.trim(),
    });

    setIsCreateModalOpen(false);
    setNewWfName('');
    setNewWfDesc('');
    navigate(`/builder/${created.id}`);
  };

  const handleDuplicate = (id: string) => {
    WorkflowService.duplicateWorkflow(id);
    loadWorkflows();
  };

  const handleDelete = (id: string) => {
    WorkflowService.deleteWorkflow(id);
    loadWorkflows();
  };

  const handleToggleStatus = (id: string) => {
    const wf = WorkflowService.getWorkflow(id);
    if (!wf) return;
    const nextStatus = wf.status === 'paused' ? 'published' : 'paused';
    WorkflowService.setWorkflowStatus(id, nextStatus);
    loadWorkflows();
  };

  const filteredWorkflows = workflows.filter((w) => {
    const matchesSearch =
      w.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesStatus = statusFilter === 'all' || w.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      <PageHeader
        title="Workflows"
        description="Design, publish, and manage Directed Acyclic Graph automation workflows."
        breadcrumbs={[{ label: 'Home', href: '/' }, { label: 'Workflows' }]}
        actions={
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-sm transition"
          >
            <Plus className="w-4 h-4" />
            <span>Create Workflow</span>
          </button>
        }
      />

      {/* Filter and Search Bar */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white p-3.5 rounded-xl border border-slate-200/90 shadow-2xs">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            placeholder="Search workflows by name or description..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 text-xs rounded-lg border border-slate-200 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 font-medium"
          />
        </div>

        <div className="flex items-center gap-2 self-stretch sm:self-auto justify-end">
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200 text-xs font-medium">
            {['all', 'published', 'draft', 'paused'].map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
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
            onClick={loadWorkflows}
            title="Reload workflows"
            className="p-2 text-slate-500 hover:text-slate-700 hover:bg-slate-100 rounded-lg border border-slate-200 transition"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Workflows List Table or Empty State */}
      {filteredWorkflows.length > 0 ? (
        <WorkflowTable
          workflows={filteredWorkflows}
          onWorkflowChange={loadWorkflows}
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
                  },
                }
              : {
                  label: 'Create Workflow',
                  onClick: () => setIsCreateModalOpen(true),
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
                  className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition shadow-xs"
                >
                  Create & Launch Builder
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
