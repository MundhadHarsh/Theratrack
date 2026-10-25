import React, { useState, useEffect } from 'react';
import {
  Settings as SettingsIcon,
  Database,
  Cpu,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Sparkles,
  RefreshCw,
  ShieldCheck,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { useAuth } from '../context/AuthContext';
import { MedicalDisclaimer } from '../components/MedicalDisclaimer';

export const Settings: React.FC = () => {
  const { user } = useAuth();
  const [health, setHealth] = useState<any | null>(null);
  const [isSeeding, setIsSeeding] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchHealth = async () => {
    try {
      const data = await apiRequest('/api/health');
      setHealth(data);
    } catch (err: any) {
      setHealth({ status: 'unreachable', error: err.message });
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleSeedDemo = async () => {
    if (
      !window.confirm(
        'Seed demonstration dataset?\n\nThis will insert 3 progressive knee exercise sessions with attached OpenCV thermal analyses, establish a baseline, and compute mathematical comparisons. All records are clearly marked as [Demo Data].'
      )
    ) {
      return;
    }

    setIsSeeding(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await apiRequest('/api/demo/seed', { method: 'POST' });
      setActionMessage(res.message);
    } catch (err: any) {
      setError(err.message || 'Failed to seed demonstration data.');
    } finally {
      setIsSeeding(false);
    }
  };

  const handleClearDemo = async () => {
    if (
      !window.confirm(
        'Clear all demonstration records?\n\nThis will remove all records marked as Demo Data from your account in SQL Server. Real sessions will remain untouched.'
      )
    ) {
      return;
    }

    setIsClearing(true);
    setError(null);
    setActionMessage(null);
    try {
      const res = await apiRequest('/api/demo/clear', { method: 'POST' });
      setActionMessage(res.message);
    } catch (err: any) {
      setError(err.message || 'Failed to clear demonstration data.');
    } finally {
      setIsClearing(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">System Settings & Demonstration Mode</h1>
        <p className="text-sm text-slate-500">
          Manage sample demonstration telemetry datasets and inspect architecture component health.
        </p>
      </div>

      <MedicalDisclaimer />

      {actionMessage && (
        <div className="p-3.5 bg-teal-50 border border-teal-200 text-teal-800 text-xs rounded-xl flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-3.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Demo Data Management */}
      <div className="healthcare-card p-6 space-y-4">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-teal-100 text-teal-800 flex items-center justify-center">
            <Sparkles className="w-4 h-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              Demonstration Telemetry Dataset
            </h2>
            <p className="text-xs text-slate-500">
              Inject synthetic evaluation records to demonstrate progression over time without requiring physical sensors.
            </p>
          </div>
        </div>

        <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 text-xs text-slate-600 space-y-2">
          <p className="font-semibold text-slate-800">Demonstration Dataset Contents:</p>
          <ul className="list-disc list-inside space-y-1 text-slate-600">
            <li>Session 1 (Day 1): Baseline seated knee extension (8 reps, ROM 73.5°, pain 4/10, resting thermal capture).</li>
            <li>Session 2 (Day 2): Mid-progress session (9 reps, ROM 80.5°, pain 3/10).</li>
            <li>Session 3 (Day 3): Loaded post-exercise session (10 reps, ROM 86°, pain 2/10, post-exercise active thermal capture).</li>
            <li>Baseline established and mathematical comparison results generated.</li>
            <li>Every synthetic session is explicitly tagged with <span className="font-bold text-slate-800">IsDemo = 1</span> in MSSQL.</li>
          </ul>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          <button
            onClick={handleSeedDemo}
            disabled={isSeeding}
            className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow-sm flex items-center gap-2 transition-colors disabled:opacity-60"
          >
            <Sparkles className="w-4 h-4" />
            <span>{isSeeding ? 'Seeding Demo Data...' : 'Seed Demonstration Dataset'}</span>
          </button>

          <button
            onClick={handleClearDemo}
            disabled={isClearing}
            className="bg-white hover:bg-rose-50 text-rose-700 border border-rose-300 font-semibold text-xs px-5 py-2.5 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60"
          >
            <Trash2 className="w-4 h-4" />
            <span>{isClearing ? 'Clearing...' : 'Clear Demo Records'}</span>
          </button>
        </div>
      </div>

      {/* Services Health & Diagnostic Status */}
      <div className="healthcare-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center">
              <Cpu className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
                Microservice Diagnostic Health
              </h2>
              <p className="text-xs text-slate-500">Real-time status of backend and Python analysis engine</p>
            </div>
          </div>

          <button
            onClick={fetchHealth}
            className="p-1.5 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50"
            title="Refresh Health"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-1">
          {/* MSSQL Status */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Database className="w-4 h-4 text-teal-600" />
                <span>Microsoft SQL Server</span>
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                  health?.database?.status === 'healthy'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-rose-100 text-rose-800'
                }`}
              >
                {health?.database?.status || 'Checking...'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              Database: <span className="font-mono text-slate-700 font-semibold">TheraTrackDb</span>
            </p>
            {health?.database?.version && (
              <p className="text-[10px] text-slate-400 font-mono truncate">
                {health.database.version.split('\n')[0]}
              </p>
            )}
          </div>

          {/* Python Thermal Service Status */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-teal-600" />
                <span>Python FastAPI Thermal Engine</span>
              </span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded ${
                  health?.pythonAnalysisService?.status === 'healthy'
                    ? 'bg-emerald-100 text-emerald-800'
                    : 'bg-amber-100 text-amber-800'
                }`}
              >
                {health?.pythonAnalysisService?.status || 'Checking...'}
              </span>
            </div>
            <p className="text-[11px] text-slate-500">
              URL: <span className="font-mono text-slate-700 font-semibold">http://127.0.0.1:8001</span>
            </p>
            {health?.pythonAnalysisService?.opencv_version && (
              <p className="text-[11px] text-slate-600">
                OpenCV: <span className="font-mono font-bold text-teal-700">v{health.pythonAnalysisService.opencv_version}</span>
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Account Info */}
      <div className="healthcare-card p-6 space-y-3">
        <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
          <ShieldCheck className="w-4 h-4 text-teal-600" />
          <span>Patient Account & Authorization</span>
        </h2>
        <div className="grid grid-cols-2 gap-4 text-xs">
          <div>
            <span className="text-slate-500 block">Name:</span>
            <span className="font-semibold text-slate-800">{user?.name}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Email:</span>
            <span className="font-semibold text-slate-800">{user?.email}</span>
          </div>
          <div>
            <span className="text-slate-500 block">Role:</span>
            <span className="font-semibold text-teal-700 capitalize">{user?.role}</span>
          </div>
          <div>
            <span className="text-slate-500 block">User ID:</span>
            <span className="font-mono text-[11px] text-slate-500">{user?.userId}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
