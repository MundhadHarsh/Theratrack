import React, { useState, useEffect } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import {
  Calendar,
  Activity,
  Flame,
  GitCompare,
  Download,
  ArrowLeft,
  CheckCircle2,
  AlertTriangle,
  Info,
  Clock,
  ChevronRight,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { MedicalDisclaimer } from '../components/MedicalDisclaimer';

export const SessionDetails: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const [data, setData] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isComparing, setIsComparing] = useState(false);
  const [compareSuccess, setCompareSuccess] = useState<string | null>(null);

  const fetchSession = async () => {
    try {
      setLoading(true);
      const res = await apiRequest(`/api/sessions/${id}`);
      setData(res);
    } catch (err: any) {
      setError(err.message || 'Failed to load session details');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchSession();
    }
  }, [id]);

  const handleRunComparison = async () => {
    setIsComparing(true);
    setCompareSuccess(null);
    try {
      const res = await apiRequest(`/api/sessions/${id}/compare`, { method: 'POST' });
      setCompareSuccess('Baseline comparison completed and persisted.');
      fetchSession();
    } catch (err: any) {
      alert('Comparison failed: ' + err.message);
    } finally {
      setIsComparing(false);
    }
  };

  const handleExport = (format: 'json' | 'csv') => {
    const token = localStorage.getItem('theratrack_token');
    const url = `/api/sessions/${id}/export?format=${format}`;

    fetch(url, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((res) => res.blob())
      .then((blob) => {
        const downloadUrl = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = downloadUrl;
        a.download = `theratrack_session_${id?.slice(0, 8)}.${format}`;
        document.body.appendChild(a);
        a.click();
        a.remove();
      })
      .catch((err) => alert('Export failed: ' + err.message));
  };

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-teal-600 border-t-transparent mb-3"></div>
        <p className="text-sm text-slate-500">Loading session telemetry from SQL Server...</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="healthcare-card p-8 text-center space-y-4">
        <AlertTriangle className="w-10 h-10 text-rose-500 mx-auto" />
        <h2 className="text-base font-bold text-slate-900">Session Not Found</h2>
        <p className="text-xs text-slate-500">{error || 'Could not locate session record.'}</p>
        <Link to="/history" className="text-xs font-semibold text-teal-600 underline">
          Back to Session History
        </Link>
      </div>
    );
  }

  const { session, thermalAnalyses, comparison, events, isBaseline } = data;

  return (
    <div className="space-y-6">
      {/* Back button & Breadcrumbs */}
      <div className="flex items-center justify-between">
        <button
          onClick={() => navigate('/history')}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 hover:text-slate-900"
        >
          <ArrowLeft className="w-4 h-4" />
          <span>Back to Session History</span>
        </button>

        <div className="flex items-center gap-2">
          <button
            onClick={() => handleExport('csv')}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export CSV</span>
          </button>
          <button
            onClick={() => handleExport('json')}
            className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-50 text-xs font-semibold flex items-center gap-1.5"
          >
            <Download className="w-3.5 h-3.5 text-slate-500" />
            <span>Export JSON</span>
          </button>
        </div>
      </div>

      {/* Main Title Banner */}
      <div className="healthcare-card p-6 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-100 px-2 py-0.5 rounded">
                Telemetry Audit
              </span>
              {session.IsDemo && (
                <span className="text-xs font-bold text-slate-600 bg-slate-200 px-2 py-0.5 rounded">
                  Demo Data
                </span>
              )}
              {isBaseline && (
                <span className="text-xs font-bold text-teal-800 bg-teal-50 border border-teal-200 px-2 py-0.5 rounded">
                  Active Reference Baseline
                </span>
              )}
            </div>
            <h1 className="text-2xl font-bold text-slate-900 capitalize">
              {session.ExerciseType.replace(/_/g, ' ')}
            </h1>
          </div>

          <div className="text-xs text-slate-500 text-right">
            <div>Recorded: {new Date(session.CreatedAt).toLocaleString()}</div>
            <div className="font-mono text-[11px] text-slate-400">UUID: {session.SessionId}</div>
          </div>
        </div>

        {compareSuccess && (
          <div className="p-2.5 bg-teal-50 border border-teal-200 text-teal-800 text-xs rounded-lg flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-teal-600 shrink-0" />
            <span>{compareSuccess}</span>
          </div>
        )}

        {/* Primary Metrics Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 pt-1">
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Completed Reps</span>
            <span className="text-xl font-bold text-slate-900">
              {session.CompletedRepetitions} / {session.TargetRepetitions}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Estimated ROM</span>
            <span className="text-xl font-bold text-slate-900">
              {session.EstimatedRangeOfMotion ? `${session.EstimatedRangeOfMotion}°` : 'N/A'}
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Angle Range (Min/Max)</span>
            <span className="text-xl font-bold text-slate-900">
              {session.MinimumKneeAngle ? Math.round(session.MinimumKneeAngle) : 90}° / {session.MaximumKneeAngle ? Math.round(session.MaximumKneeAngle) : 160}°
            </span>
          </div>
          <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
            <span className="text-[11px] text-slate-500 block">Duration</span>
            <span className="text-xl font-bold text-slate-900 font-mono">
              {Math.floor(session.DurationSeconds / 60)}:{(session.DurationSeconds % 60).toString().padStart(2, '0')}
            </span>
          </div>
        </div>

        {/* Ratings Row */}
        <div className="grid grid-cols-3 gap-4 pt-1 text-xs">
          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
            <span className="text-slate-500">Self-Reported Pain:</span>
            <span className="font-bold text-amber-600">{session.PainRating !== null ? `${session.PainRating}/10` : '—'}</span>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
            <span className="text-slate-500">Soreness / Stiffness:</span>
            <span className="font-bold text-slate-800">{session.SorenessRating !== null ? `${session.SorenessRating}/10` : '—'}</span>
          </div>
          <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200 flex justify-between items-center">
            <span className="text-slate-500">Muscular Fatigue:</span>
            <span className="font-bold text-slate-800">{session.FatigueRating !== null ? `${session.FatigueRating}/10` : '—'}</span>
          </div>
        </div>

        {session.Notes && (
          <div className="p-3 bg-slate-50/80 rounded-xl border border-slate-200 text-xs italic text-slate-600">
            "{session.Notes}"
          </div>
        )}
      </div>

      <MedicalDisclaimer />

      {/* Baseline Comparison Card (if exists or trigger comparison) */}
      <div className="healthcare-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <GitCompare className="w-4 h-4 text-teal-600" />
            <span>Comparison Against Established Baseline</span>
          </h2>

          <button
            onClick={handleRunComparison}
            disabled={isComparing}
            className="bg-teal-600 hover:bg-teal-700 text-white font-bold text-xs px-3.5 py-1.5 rounded-lg shadow-2xs transition-colors"
          >
            {isComparing ? 'Computing...' : comparison ? 'Re-Evaluate Comparison' : 'Compare Against Baseline'}
          </button>
        </div>

        {comparison ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {Object.entries(comparison.ComparisonResults.metrics || {}).map(([k, m]: [string, any]) => {
                if (!m.available) return null;
                return (
                  <div key={k} className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs">
                    <span className="text-[11px] text-slate-500 block">{m.label}</span>
                    <div className="flex items-baseline justify-between mt-1">
                      <span className="font-bold text-slate-900">{m.currentValue} {m.unit}</span>
                      <span className={`font-bold ${m.absoluteDifference > 0 ? 'text-teal-700' : 'text-amber-700'}`}>
                        {m.absoluteDifference > 0 ? `+${m.absoluteDifference}` : m.absoluteDifference} {m.unit}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Summaries */}
            <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 space-y-1">
              <span className="text-xs font-bold text-slate-800 block mb-1">Factual Comparison Statements:</span>
              {comparison.ComparisonResults.summaries?.map((stmt: string, i: number) => (
                <div key={i} className="text-xs text-slate-700 flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-teal-600 mt-1.5 shrink-0"></span>
                  <span>{stmt}</span>
                </div>
              ))}
            </div>
          </div>
        ) : (
          <p className="text-xs text-slate-500 py-2">
            This session has not been evaluated against a baseline yet. Click "Compare Against Baseline" above to compute differences.
          </p>
        )}
      </div>

      {/* Attached Thermal Analyses */}
      <div className="healthcare-card p-6 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
            <Flame className="w-4 h-4 text-teal-600" />
            <span>Attached Thermal Analyses ({thermalAnalyses?.length || 0})</span>
          </h2>

          <Link
            to={`/thermal?sessionId=${session.SessionId}`}
            className="text-xs font-bold text-teal-700 hover:text-teal-800 underline"
          >
            + Attach Another Thermal Image
          </Link>
        </div>

        {thermalAnalyses && thermalAnalyses.length > 0 ? (
          <div className="space-y-6">
            {thermalAnalyses.map((t: any) => (
              <div key={t.ThermalAnalysisId} className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-4">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800 capitalize">
                    {t.ImageSource.replace(/_/g, ' ')} Thermal Capture
                  </span>
                  <span className="text-slate-400 font-mono text-[11px]">
                    {new Date(t.CreatedAt).toLocaleString()}
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <span className="text-[11px] font-semibold text-slate-600 block mb-1">Original Image</span>
                    <div className="bg-slate-900 rounded-lg overflow-hidden aspect-4/3 flex items-center justify-center">
                      <img
                        src={t.OriginalImageReference}
                        alt="Original thermal input"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                  <div>
                    <span className="text-[11px] font-semibold text-slate-600 block mb-1">Processed False-Color Visualization</span>
                    <div className="bg-slate-900 rounded-lg overflow-hidden aspect-4/3 flex items-center justify-center">
                      <img
                        src={t.ProcessedImageReference}
                        alt="Processed false-color"
                        className="w-full h-full object-contain"
                      />
                    </div>
                  </div>
                </div>

                {t.AnalysisResults?.regional_comparison && (
                  <div className="p-3 bg-white rounded-lg border border-slate-200 text-xs">
                    <span className="font-bold text-slate-900 block mb-0.5">Bilateral ROI Asymmetry:</span>
                    <p className="text-slate-600">{t.AnalysisResults.regional_comparison.interpretation}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-slate-400">
            No thermal images attached to this session yet.{' '}
            <Link to={`/thermal?sessionId=${session.SessionId}`} className="text-teal-600 underline font-semibold">
              Analyze and attach thermal image now
            </Link>
          </div>
        )}
      </div>

      {/* Logged Exercise Repetition Events */}
      {events && events.length > 0 && (
        <div className="healthcare-card p-6 space-y-3">
          <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider">
            Logged Movement Event Telemetry ({events.length} Events)
          </h2>

          <div className="overflow-x-auto max-h-60 overflow-y-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="border-b border-slate-200 text-slate-500 uppercase text-[11px]">
                  <th className="pb-2 font-medium">Timestamp</th>
                  <th className="pb-2 font-medium">Event Type</th>
                  <th className="pb-2 font-medium">Knee Angle</th>
                  <th className="pb-2 font-medium">Landmark Confidence</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((e: any) => (
                  <tr key={e.ExerciseEventId}>
                    <td className="py-2 text-slate-500 font-mono text-[11px]">
                      {new Date(e.EventTimestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-2 font-semibold text-slate-800 capitalize">
                      {e.EventType.replace(/_/g, ' ')}
                    </td>
                    <td className="py-2 text-slate-700 font-bold">{e.KneeAngle ? `${e.KneeAngle}°` : '—'}</td>
                    <td className="py-2 text-slate-500">
                      {e.LandmarkConfidence ? `${Math.round(e.LandmarkConfidence * 100)}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};
