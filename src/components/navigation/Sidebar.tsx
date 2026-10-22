import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  GitFork,
  Network,
  PlaySquare,
  Zap,
  Cpu,
  Settings,
  Repeat,
  CircleDot,
} from 'lucide-react';
import { cn } from '../../lib/utils';

const navItems = [
  { label: 'Overview', to: '/', icon: LayoutDashboard, exact: true },
  { label: 'Workflows', to: '/workflows', icon: GitFork },
  { label: 'Builder', to: '/builder', icon: Network },
  { label: 'Runs', to: '/runs', icon: PlaySquare },
  { label: 'Triggers', to: '/triggers', icon: Zap },
  { label: 'Workers', to: '/workers', icon: Cpu },
  { label: 'Settings', to: '/settings', icon: Settings },
];

export const Sidebar: React.FC = () => {
  return (
    <aside className="w-64 border-r border-slate-200 bg-white flex flex-col shrink-0 h-screen sticky top-0 select-none">
      {/* Brand Header */}
      <div className="h-16 flex items-center gap-3 px-5 border-b border-slate-100">
        <div className="w-9 h-9 rounded-lg bg-indigo-600 flex items-center justify-center text-white shadow-sm shrink-0">
          <Repeat className="w-5 h-5 animate-spin-slow" />
        </div>
        <div className="flex flex-col min-w-0">
          <span className="font-bold text-sm tracking-tight text-slate-900 truncate">
            DORMAMMU LOOP
          </span>
          <span className="text-[10px] uppercase font-mono tracking-wider text-indigo-600">
            DAG Engine v0.1
          </span>
        </div>
      </div>

      {/* Nav Links */}
      <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
        <div className="px-3 pb-2 text-[10px] font-semibold text-slate-400 uppercase tracking-wider font-mono">
          Core Engine
        </div>
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.exact}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors',
                  isActive
                    ? 'bg-indigo-50 text-indigo-700 font-semibold shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50'
                )
              }
            >
              <Icon className="w-4 h-4 shrink-0" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* Footer / System Status */}
      <div className="p-4 border-t border-slate-100 bg-slate-50/60">
        <div className="rounded-lg border border-slate-200/80 bg-white p-3 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-medium text-slate-700">
            <span className="flex items-center gap-1.5">
              <CircleDot className="w-3.5 h-3.5 text-emerald-500 animate-pulse" />
              Local DAG Runner
            </span>
            <span className="text-[10px] font-mono text-slate-400">READY</span>
          </div>
          <p className="mt-1.5 text-[11px] text-slate-500 leading-tight">
            Topological executor with dependency propagation & step logs.
          </p>
        </div>
      </div>
    </aside>
  );
};
