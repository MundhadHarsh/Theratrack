import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  History,
  Download,
  Trash2,
  GitCompare,
  Flame,
  ArrowRight,
  CheckCircle2,
  AlertCircle,
  FileText,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { MedicalDisclaimer } from '../components/MedicalDisclaimer';

interface SessionRecord {
  SessionId: string;
  ExerciseType: string;
  TrackingMode: string;
  SessionStatus: string;
  CompletedRepetitions: number;
  TargetRepetitions: number;
  EstimatedRangeOfMotion: number | null;
  PainRating: number | null;
  DurationSeconds: number;
  IsDemo: boolean;
  CreatedAt: string;
  ThermalCount: number;
  IsBaseline: number;
  ComparisonCount: number;
}

export const SessionHistory: React.FC = () => {
  const [sessions, setSessions] = useState<SessionRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterMode, setFilterMode] = useState<string>('all');
  const [error, setError] = useState<string | null>(null);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  const fetchSessions = async () => {
    try {
      setLoading(true);
      const data = await apiRequest<SessionRecord[]>('/api/sessions');
      setSessions(data);
    } catch (err: any) {
      setError(err.message || 'Failed to load session history');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const handleDelete = async (sessionId: string) => {
    if (!window.confirm('Are you sure you want to delete this session? This action cannot be undone.')) {
      return;
    }
    try {
      await apiRequest(`/api/sessions/${sessionId}`, { method: 'DELETE' });
      setActionNotice('Session deleted successfully.');
      fetchSessions();
    } catch (err: any) {
      alert('Delete failed: ' + err.message);
    }
  };

  const handleExport = (sessionId: string, format: 'json' | 'csv') => {
    const token = localStorage.getItem('theratrack_token');
    const url = `/api/sessions/${sessionId}/export?format=${format}`;

    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `theratrack_session_${sessionId.slice(0, 8)}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch((err) => alert('Export failed: ' + err.message));
  };

  const filteredSessions = sessions.filter((s) => {
    if (filterMode === 'demo') return s.IsDemo;
    if (filterMode === 'thermal') return s.ThermalCount > 0;
    if (filterMode === 'baseline') return s.IsBaseline > 0;
    return true;
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Session History</h1>
          <p className="text-sm text-slate-500">
            Audit log of all rehabilitation exercise sessions stored in SQL Server.
          </p>
        </div>

        {/* Filter Badges */}
        <div className="flex items-center gap-1.5 bg-slate-100 p-1 rounded-xl text-xs">
          <button
            onClick={() => setFilterMode('all')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterMode === 'all' ? 'bg-white font-bold text-slate-900 shadow-2xs' : 'text-slate-600'
            }`}
          >
            All ({sessions.length})
          </button>
          <button
            onClick={() => setFilterMode('thermal')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterMode === 'thermal' ? 'bg-white font-bold text-slate-900 shadow-2xs' : 'text-slate-600'
            }`}
          >
            With Thermal
          </button>
          <button
            onClick={() => setFilterMode('baseline')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterMode === 'baseline' ? 'bg-white font-bold text-slate-900 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Baselines
          </button>
          <button
            onClick={() => setFilterMode('demo')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors ${
              filterMode === 'demo' ? 'bg-white font-bold text-slate-900 shadow-2xs' : 'text-slate-600'
            }`}
          >
            Demo Records
          </button>
        </div>
      </div>

      <MedicalDisclaimer />

      {actionNotice && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 text-xs rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{actionNotice}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* History Table */}
      <div className="healthcare-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                <th className="py-3 px-4 font-semibold">Date & Time</th>
                <th className="py-3 px-4 font-semibold">Exercise</th>
                <th className="py-3 px-4 font-semibold">Tracking</th>
                <th className="py-3 px-4 font-semibold">Reps Completed</th>
                <th className="py-3 px-4 font-semibold">Range (ROM)</th>
                <th className="py-3 px-4 font-semibold">Duration</th>
                <th className="py-3 px-4 font-semibold">Pain</th>
                <th className="py-3 px-4 font-semibold">Telemetry Flags</th>
                <th className="py-3 px-4 font-semibold text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredSessions.length > 0 ? (
                filteredSessions.map((s) => (
                  <tr key={s.SessionId} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-semibold text-slate-900">
                      <div>{new Date(s.CreatedAt).toLocaleDateString()}</div>
                      <div className="text-[11px] text-slate-400 font-normal">
                        {new Date(s.CreatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </div>
                    </td>

                    <td className="py-3 px-4 capitalize text-slate-700 font-medium">
                      {s.ExerciseType.replace(/_/g, ' ')}
                    </td>

                    <td className="py-3 px-4">
                      <span className="capitalize text-teal-800 font-medium">
                        {s.TrackingMode.replace(/_/g, ' ')}
                      </span>
                    </td>

                    <td className="py-3 px-4 font-bold text-slate-900">
                      {s.CompletedRepetitions} / {s.TargetRepetitions}
                    </td>

                    <td className="py-3 px-4 font-semibold text-slate-700">
                      {s.EstimatedRangeOfMotion ? `${s.EstimatedRangeOfMotion}°` : 'N/A'}
                    </td>

                    <td className="py-3 px-4 text-slate-600 font-mono">
                      {Math.floor(s.DurationSeconds / 60)}:{(s.DurationSeconds % 60).toString().padStart(2, '0')}
                    </td>

                    <td className="py-3 px-4 text-slate-700 font-semibold">
                      {s.PainRating !== null ? `${s.PainRating}/10` : '—'}
                    </td>

                    <td className="py-3 px-4 space-x-1">
                      {s.IsBaseline > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-teal-100 text-teal-800">
                          Baseline
                        </span>
                      )}
                      {s.ThermalCount > 0 && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-amber-100 text-amber-800">
                          Thermal
                        </span>
                      )}
                      {s.IsDemo && (
                        <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-bold bg-slate-200 text-slate-700">
                          Demo Data
                        </span>
                      )}
                    </td>

                    <td className="py-3 px-4 text-right space-x-1 whitespace-nowrap">
                      <Link
                        to={`/sessions/${s.SessionId}`}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-teal-50 text-teal-700 hover:bg-teal-100 font-semibold transition-colors"
                      >
                        <span>Details</span>
                        <ArrowRight className="w-3 h-3" />
                      </Link>

                      <button
                        onClick={() => handleExport(s.SessionId, 'csv')}
                        title="Export CSV"
                        className="px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium"
                      >
                        CSV
                      </button>

                      <button
                        onClick={() => handleExport(s.SessionId, 'json')}
                        title="Export JSON"
                        className="px-2 py-1 rounded border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium"
                      >
                        JSON
                      </button>

                      <button
                        onClick={() => handleDelete(s.SessionId)}
                        title="Delete Session"
                        className="p-1 rounded text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={9} className="py-10 text-center text-slate-400">
                    No sessions match the selected filter.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
