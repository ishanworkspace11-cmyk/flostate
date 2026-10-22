import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Repeat, Home, ArrowLeft } from 'lucide-react';

export const NotFoundPage: React.FC = () => {
  const navigate = useNavigate();

  return (
    <div className="h-[80vh] flex flex-col items-center justify-center text-center p-8">
      <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-200 text-indigo-600 flex items-center justify-center mb-5 shadow-xs">
        <Repeat className="w-7 h-7" />
      </div>

      <span className="text-xs font-mono font-bold text-indigo-600 uppercase tracking-widest">
        404 — Graph Node Not Found
      </span>

      <h1 className="text-3xl font-bold tracking-tight text-slate-900 mt-2">
        Dormammu, I've come to bargain!
      </h1>

      <p className="mt-2 text-sm text-slate-500 max-w-md leading-relaxed">
        The requested routing node or workflow execution identifier does not exist within the current DAG topology.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg shadow-2xs transition"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          <span>Go Back</span>
        </button>

        <button
          onClick={() => navigate('/')}
          className="inline-flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-xs transition"
        >
          <Home className="w-3.5 h-3.5" />
          <span>Return to Overview</span>
        </button>
      </div>
    </div>
  );
};
