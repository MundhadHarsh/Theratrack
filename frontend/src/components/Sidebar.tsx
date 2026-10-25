import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  PlayCircle,
  Activity,
  Flame,
  GitCompare,
  History,
  Settings,
  LogOut,
  ShieldAlert,
} from 'lucide-react';
import { useAuth } from '../context/AuthContext';

export const Sidebar: React.FC = () => {
  const { user, logout } = useAuth();

  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/new-session', label: 'New Session', icon: PlayCircle },
    { to: '/tracking', label: 'Exercise Tracking', icon: Activity },
    { to: '/thermal', label: 'Thermal Analysis', icon: Flame },
    { to: '/baselines', label: 'Baseline & Progress', icon: GitCompare },
    { to: '/history', label: 'Session History', icon: History },
    { to: '/settings', label: 'Settings & Demo', icon: Settings },
  ];

  return (
    <aside className="w-64 bg-white border-r border-slate-200 flex flex-col shrink-0 min-h-screen">
      {/* Brand Header */}
      <div className="p-5 border-b border-slate-100 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-lg bg-teal-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
            T
          </div>
          <div>
            <h1 className="text-base font-bold text-slate-900 tracking-tight leading-tight">TheraTrack</h1>
            <span className="text-[11px] font-medium text-teal-700 uppercase tracking-wider">Rehab Monitor</span>
          </div>
        </div>
      </div>

      {/* Navigation Links */}
      <nav className="p-3 space-y-1 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          return (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-teal-50 text-teal-800 font-semibold shadow-xs'
                    : 'text-slate-600 hover:bg-slate-100/80 hover:text-slate-900'
                }`
              }
            >
              <Icon className="w-4 h-4 shrink-0 text-teal-600" />
              <span>{item.label}</span>
            </NavLink>
          );
        })}
      </nav>

      {/* User profile & Logout */}
      <div className="p-4 border-t border-slate-100">
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200/80 mb-3">
          <p className="text-xs font-semibold text-slate-800 truncate">{user?.name || 'Patient User'}</p>
          <p className="text-[11px] text-slate-500 truncate">{user?.email}</p>
        </div>
        <button
          onClick={logout}
          className="w-full flex items-center justify-center gap-2 text-xs font-medium text-slate-600 hover:text-rose-600 hover:bg-rose-50 py-2 rounded-lg transition-colors border border-slate-200"
        >
          <LogOut className="w-3.5 h-3.5" />
          <span>Sign Out</span>
        </button>
      </div>
    </aside>
  );
};
