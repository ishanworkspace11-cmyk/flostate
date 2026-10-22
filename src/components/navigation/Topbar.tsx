import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Play, ExternalLink, ShieldAlert } from 'lucide-react';
import { WorkflowService } from '../../features/workflows/workflow.service';

export const Topbar: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

  const handleCreateWorkflow = () => {
    const newWf = WorkflowService.createWorkflow({
      name: `Workflow_${Math.floor(Math.random() * 900 + 100)}`,
      description: 'Newly created DAG automation pipeline',
    });
    navigate(`/builder/${newWf.id}`);
  };

  return (
    <header className="h-16 border-b border-slate-200 bg-white/95 backdrop-blur-xs px-6 flex items-center justify-between sticky top-0 z-30">
      <div className="flex items-center gap-3">
        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono bg-slate-100 text-slate-700 border border-slate-200">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
          STANDALONE DEMO RUNNER
        </span>
        <span className="text-xs text-slate-400 hidden sm:inline">
          Browser-isolated DAG execution engine
        </span>
      </div>

      <div className="flex items-center gap-3">
        <a
          href="https://github.com/ishanworkspace11-cmyk/flostate"
          target="_blank"
          rel="noreferrer"
          className="text-xs font-medium text-slate-500 hover:text-slate-800 flex items-center gap-1 px-2.5 py-1.5 rounded-lg hover:bg-slate-50 transition"
        >
          <span>Repository</span>
          <ExternalLink className="w-3.5 h-3.5" />
        </a>

        {!location.pathname.startsWith('/builder') && (
          <button
            onClick={handleCreateWorkflow}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 text-xs font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 shadow-xs transition"
          >
            <Plus className="w-4 h-4" />
            <span>New Workflow</span>
          </button>
        )}
      </div>
    </header>
  );
};
