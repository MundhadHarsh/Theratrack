import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  GitCompare,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  ArrowRight,
  ShieldAlert,
  Calendar,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { MedicalDisclaimer } from '../components/MedicalDisclaimer';

interface Baseline {
  BaselineId: string;
  UserId: string;
  ExerciseType: string;
  SourceSessionId: string;
  CompletedRepetitions: number;
  EstimatedRangeOfMotion: number | null;
  PeakAngleVariability: number | null;
  PainRating: number | null;
  IsActive: boolean;
  CreatedAt: string;
  SourceSessionCompletedAt: string;
}

interface SessionItem {
  SessionId: string;
  ExerciseType: string;
  TrackingMode: string;
  CompletedRepetitions: number;
  TargetRepetitions: number;
  EstimatedRangeOfMotion: number | null;
  PainRating: number | null;
  DurationSeconds: number;
  CreatedAt: string;
  IsBaseline: number;
}

export const BaselineProgress: React.FC = () => {
  const [baselines, setBaselines] = useState<Baseline[]>([]);
  const [sessions, setSessions] = useState<SessionItem[]>([]);
  const [selectedSessionToCompare, setSelectedSessionToCompare] = useState<string>('');
  const [comparisonResult, setComparisonResult] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [isComparing, setIsComparing] = useState(false);
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      setLoading(true);
      const [baseData, sessData] = await Promise.all([
        apiRequest<Baseline[]>('/api/baselines'),
        apiRequest<SessionItem[]>('/api/sessions'),
      ]);
      setBaselines(baseData);
      setSessions(sessData.filter((s) => s.SessionId));
      if (sessData.length > 0 && !selectedSessionToCompare) {
        setSelectedSessionToCompare(sessData[0].SessionId);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to load baseline data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleSetBaseline = async (sessionId: string, exerciseType: string) => {
    try {
      setError(null);
      await apiRequest('/api/baselines', {
        method: 'POST',
        body: JSON.stringify({
          sourceSessionId: sessionId,
          exerciseType,
        }),
      });
      setActionMessage('Active baseline established successfully.');
      fetchData();
    } catch (err: any) {
      setError(err.message || 'Failed to set baseline');
    }
  };

  const handleRunComparison = async () => {
    if (!selectedSessionToCompare) return;
    setIsComparing(true);
    setError(null);
    try {
      const res = await apiRequest(`/api/sessions/${selectedSessionToCompare}/compare`, {
        method: 'POST',
      });
      setComparisonResult(res.results);
    } catch (err: any) {
      setError(err.message || 'Comparison failed');
    } finally {
      setIsComparing(false);
    }
  };

  const activeBaseline = baselines.find((b) => b.IsActive) || baselines[0] || null;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Baseline & Progress Comparison</h1>
        <p className="text-sm text-slate-500">
          Establish rehabilitation reference baselines and evaluate mathematical differences in completed repetitions, ROM, and thermal intensity.
        </p>
      </div>

      <MedicalDisclaimer />

      {actionMessage && (
        <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 text-xs rounded-lg flex items-center gap-2">
          <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
          <span>{actionMessage}</span>
        </div>
      )}

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Active Baseline Card */}
      <div className="healthcare-card p-6 bg-teal-50/30 border-teal-200 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-teal-100 pb-3">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-teal-600 text-white flex items-center justify-center font-bold">
              <GitCompare className="w-4 h-4" />
            </div>
            <div>
              <span className="text-[11px] font-bold text-teal-700 uppercase tracking-wider block">
                Current Active Baseline
              </span>
              <h2 className="text-base font-bold text-slate-900 capitalize">
                {activeBaseline ? activeBaseline.ExerciseType.replace(/_/g, ' ') : 'No Baseline Established'}
              </h2>
            </div>
          </div>

          {activeBaseline && (
            <span className="text-xs text-slate-500 font-mono">
              Established: {new Date(activeBaseline.CreatedAt).toLocaleDateString()}
            </span>
          )}
        </div>

        {activeBaseline ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
            <div className="p-3 bg-white rounded-xl border border-teal-200/80">
              <span className="text-[11px] text-slate-500 block">Baseline Reps</span>
              <span className="text-xl font-bold text-slate-900">{activeBaseline.CompletedRepetitions} reps</span>
            </div>
            <div className="p-3 bg-white rounded-xl border border-teal-200/80">
              <span className="text-[11px] text-slate-500 block">Baseline ROM</span>
              <span className="text-xl font-bold text-slate-900">
                {activeBaseline.EstimatedRangeOfMotion ? `${activeBaseline.EstimatedRangeOfMotion}°` : 'N/A'}
              </span>
            </div>
            <div className="p-3 bg-white rounded-xl border border-teal-200/80">
              <span className="text-[11px] text-slate-500 block">Peak Variability</span>
              <span className="text-xl font-bold text-slate-900">
                {activeBaseline.PeakAngleVariability ? `±${activeBaseline.PeakAngleVariability}°` : 'N/A'}
              </span>
            </div>
            <div className="p-3 bg-white rounded-xl border border-teal-200/80">
              <span className="text-[11px] text-slate-500 block">Pain Rating</span>
              <span className="text-xl font-bold text-amber-600">
                {activeBaseline.PainRating !== null ? `${activeBaseline.PainRating}/10` : 'N/A'}
              </span>
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-2">
            Designate any completed session below as your reference baseline to start comparing progression over time.
          </p>
        )}
      </div>

      {/* Comparison Runner Section */}
      {activeBaseline && sessions.length > 0 && (
        <div className="healthcare-card p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Compare a Session Against Active Baseline
          </h2>

          <div className="flex flex-col sm:flex-row gap-3">
            <select
              value={selectedSessionToCompare}
              onChange={(e) => setSelectedSessionToCompare(e.target.value)}
              className="flex-1 text-xs p-2.5 rounded-lg border border-slate-300 bg-white"
            >
              {sessions.map((s) => (
                <option key={s.SessionId} value={s.SessionId}>
                  {new Date(s.CreatedAt).toLocaleDateString()} — {s.CompletedRepetitions} reps, ROM: {s.EstimatedRangeOfMotion ?? 'N/A'}° (ID: {s.SessionId.slice(0, 8)})
                </option>
              ))}
            </select>

            <button
              onClick={handleRunComparison}
              disabled={isComparing}
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-5 py-2.5 rounded-lg shadow-sm transition-colors flex items-center justify-center gap-2"
            >
              <GitCompare className="w-4 h-4" />
              <span>{isComparing ? 'Comparing...' : 'Compute Baseline Comparison'}</span>
            </button>
          </div>

          {/* Comparison Output */}
          {comparisonResult && (
            <div className="pt-4 space-y-4 border-t border-slate-100">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Comparison Evaluation Results
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {Object.entries(comparisonResult.metrics).map(([key, m]: [string, any]) => {
                  if (!m.available) {
                    return (
                      <div key={key} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                        <span className="text-slate-500 block text-[11px]">{m.label}</span>
                        <span className="text-slate-400 italic">Not enough data</span>
                      </div>
                    );
                  }
                  return (
                    <div key={key} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
                      <span className="text-slate-500 block text-[11px]">{m.label}</span>
                      <div className="flex items-baseline justify-between">
                        <span className="text-base font-bold text-slate-900">
                          {m.currentValue} {m.unit}
                        </span>
                        <span
                          className={`text-xs font-bold ${
                            m.absoluteDifference > 0
                              ? 'text-teal-700'
                              : m.absoluteDifference < 0
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {m.absoluteDifference > 0 ? `+${m.absoluteDifference}` : m.absoluteDifference} {m.unit}
                        </span>
                      </div>
                      {m.percentageChange !== null && (
                        <span className="text-[10px] text-slate-400 block">
                          Change: {m.percentageChange > 0 ? `+${m.percentageChange}%` : `${m.percentageChange}%`}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Factual Summaries */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 space-y-1.5">
                <span className="text-xs font-bold text-slate-800 block mb-1">Factual Comparison Statements:</span>
                {comparisonResult.summaries?.map((stmt: string, i: number) => (
                  <div key={i} className="text-xs text-slate-700 flex items-start gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-teal-600 mt-1.5 shrink-0"></span>
                    <span>{stmt}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* Selectable Sessions Table */}
      <div className="healthcare-card p-6 space-y-4">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
          Completed Sessions (Designate Reference Baseline)
        </h2>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                <th className="pb-2 font-medium">Session Date</th>
                <th className="pb-2 font-medium">Exercise</th>
                <th className="pb-2 font-medium">Completed Reps</th>
                <th className="pb-2 font-medium">Estimated ROM</th>
                <th className="pb-2 font-medium">Pain</th>
                <th className="pb-2 font-medium">Baseline Status</th>
                <th className="pb-2 font-medium text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {sessions.map((s) => (
                <tr key={s.SessionId} className="hover:bg-slate-50/80">
                  <td className="py-3 font-semibold text-slate-900">
                    {new Date(s.CreatedAt).toLocaleString()}
                  </td>
                  <td className="py-3 text-slate-600 capitalize">{s.ExerciseType.replace(/_/g, ' ')}</td>
                  <td className="py-3 font-bold text-slate-800">
                    {s.CompletedRepetitions} / {s.TargetRepetitions}
                  </td>
                  <td className="py-3 font-semibold text-slate-700">{s.EstimatedRangeOfMotion ? `${s.EstimatedRangeOfMotion}°` : 'N/A'}</td>
                  <td className="py-3 text-slate-600">{s.PainRating !== null ? `${s.PainRating}/10` : '—'}</td>
                  <td className="py-3">
                    {s.IsBaseline > 0 ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded border border-teal-200">
                        <CheckCircle2 className="w-3 h-3" />
                        <span>Baseline</span>
                      </span>
                    ) : (
                      <span className="text-[11px] text-slate-400">Regular</span>
                    )}
                  </td>
                  <td className="py-3 text-right">
                    <button
                      onClick={() => handleSetBaseline(s.SessionId, s.ExerciseType)}
                      className="px-3 py-1 rounded-lg border border-teal-600 text-teal-700 hover:bg-teal-50 font-semibold text-xs transition-colors"
                    >
                      Make Baseline
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
