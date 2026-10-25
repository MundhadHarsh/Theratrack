import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  CheckCircle2,
  Flame,
  GitCompare,
  TrendingUp,
  AlertTriangle,
  PlayCircle,
  Calendar,
  Sparkles,
  ArrowUpRight,
  ShieldAlert,
} from 'lucide-react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Legend,
  BarChart,
  Bar,
} from 'recharts';
import { apiRequest } from '../api/client';
import { MedicalDisclaimer } from '../components/MedicalDisclaimer';

interface DashboardSummary {
  totalSessions: number;
  totalRepetitions: number;
  avgCompletionPercentage: number;
  latestSession: any | null;
  latestPainRating: number | null;
  usableThermalSessions: number;
  activeBaseline: any | null;
}

interface ProgressPoint {
  sessionId: string;
  date: string;
  fullDate: string;
  repetitions: number;
  targetRepetitions: number;
  completionRate: number;
  durationMinutes: number;
  rangeOfMotion: number | null;
  peakAngleVariability: number | null;
  painRating: number | null;
  fatigueRating: number | null;
  thermalAsymmetry: number | null;
}

export const Dashboard: React.FC = () => {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [progress, setProgress] = useState<ProgressPoint[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [sumData, progData] = await Promise.all([
        apiRequest<DashboardSummary>('/api/dashboard/summary'),
        apiRequest<ProgressPoint[]>('/api/dashboard/progress'),
      ]);
      setSummary(sumData);
      setProgress(progData);
    } catch (err: any) {
      setError(err.message || 'Failed to load dashboard data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  if (loading) {
    return (
      <div className="py-20 text-center">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-4 border-teal-600 border-t-transparent mb-3"></div>
        <p className="text-sm text-slate-500">Loading rehabilitation records from SQL Server...</p>
      </div>
    );
  }

  const hasData = summary && summary.totalSessions > 0;

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Rehabilitation Dashboard</h1>
          <p className="text-sm text-slate-500">
            Telemetry metrics, range-of-motion estimates, and bilateral thermal statistics
          </p>
        </div>

        <div className="flex items-center gap-3">
          <Link
            to="/new-session"
            className="inline-flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white font-medium text-xs px-4 py-2.5 rounded-lg shadow-sm transition-colors"
          >
            <PlayCircle className="w-4 h-4" />
            <span>Start Exercise</span>
          </Link>
          <Link
            to="/thermal"
            className="inline-flex items-center gap-2 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 font-medium text-xs px-4 py-2.5 rounded-lg shadow-2xs transition-colors"
          >
            <Flame className="w-4 h-4 text-teal-600" />
            <span>Thermal Analysis</span>
          </Link>
        </div>
      </div>

      {/* Safety Notice */}
      <MedicalDisclaimer />

      {/* Empty State Banner if no sessions exist */}
      {!hasData && (
        <div className="healthcare-card p-8 text-center bg-white border border-dashed border-slate-300">
          <div className="w-12 h-12 rounded-full bg-teal-50 text-teal-600 mx-auto flex items-center justify-center mb-3">
            <Activity className="w-6 h-6" />
          </div>
          <h3 className="text-base font-semibold text-slate-900 mb-1">No Exercise Telemetry Recorded Yet</h3>
          <p className="text-xs text-slate-500 max-w-md mx-auto mb-6">
            Start your first knee extension session to track repetitions with automatic webcam pose estimation, or load sample demonstration records from Settings.
          </p>
          <div className="flex items-center justify-center gap-3">
            <Link
              to="/new-session"
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Start New Session
            </Link>
            <Link
              to="/settings"
              className="bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              Load Demo Dataset
            </Link>
          </div>
        </div>
      )}

      {/* Stat Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sessions */}
        <div className="healthcare-card p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Total Sessions</span>
            <Calendar className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{summary?.totalSessions ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">Recorded in SQL Server</p>
        </div>

        {/* Total Repetitions */}
        <div className="healthcare-card p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Completed Reps</span>
            <Activity className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{summary?.totalRepetitions ?? 0}</p>
          <p className="text-xs text-slate-500 mt-1">
            Avg completion: {summary?.avgCompletionPercentage ?? 0}%
          </p>
        </div>

        {/* Latest Pain Rating */}
        <div className="healthcare-card p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Latest Pain Rating</span>
            <AlertTriangle className="w-4 h-4 text-amber-500" />
          </div>
          <div className="flex items-baseline gap-1">
            <p className="text-2xl font-bold text-slate-900">
              {summary?.latestPainRating !== null ? summary?.latestPainRating : '—'}
            </p>
            <span className="text-xs text-slate-400">/ 10</span>
          </div>
          <p className="text-xs text-slate-500 mt-1">Self-reported by patient</p>
        </div>

        {/* Active Baseline Status */}
        <div className="healthcare-card p-5">
          <div className="flex items-center justify-between text-slate-500 mb-2">
            <span className="text-xs font-medium uppercase tracking-wider">Active Baseline</span>
            <GitCompare className="w-4 h-4 text-teal-600" />
          </div>
          <p className="text-sm font-semibold text-slate-900 truncate">
            {summary?.activeBaseline ? summary.activeBaseline.ExerciseType.replace(/_/g, ' ') : 'None Set'}
          </p>
          <p className="text-xs text-slate-500 mt-1">
            {summary?.activeBaseline
              ? `ROM: ${summary.activeBaseline.EstimatedRangeOfMotion ?? 'N/A'}°`
              : 'Select baseline in History'}
          </p>
        </div>
      </div>

      {/* Thermal & Latest Snapshot Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Usable Thermal Sessions */}
        <div className="healthcare-card p-5 lg:col-span-1 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Thermal Telemetry</span>
              <Flame className="w-4 h-4 text-teal-600" />
            </div>
            <p className="text-3xl font-extrabold text-slate-900">{summary?.usableThermalSessions ?? 0}</p>
            <p className="text-xs text-slate-600 mt-1">Sessions with linked OpenCV ROI statistical analyses.</p>

            <div className="mt-4 p-3 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
              <span className="font-semibold block text-slate-800 mb-0.5">Intensity Analysis Notice</span>
              Thermal analyses measure calibrated pixel intensities across regions of interest. True skin temperature requires radiometric camera matrix.
            </div>
          </div>

          <Link
            to="/thermal"
            className="mt-4 inline-flex items-center justify-between text-xs font-semibold text-teal-700 hover:text-teal-800 pt-2 border-t border-slate-100"
          >
            <span>Analyze image or sample</span>
            <ArrowUpRight className="w-4 h-4" />
          </Link>
        </div>

        {/* Latest Session Details Card */}
        <div className="healthcare-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-700 uppercase tracking-wider">Latest Session Summary</span>
            {summary?.latestSession && (
              <span className="text-[11px] text-slate-400 font-mono">
                {new Date(summary.latestSession.CreatedAt).toLocaleString()}
              </span>
            )}
          </div>

          {summary?.latestSession ? (
            <div className="space-y-3">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">Exercise</span>
                  <span className="text-xs font-bold text-slate-800 capitalize">
                    {summary.latestSession.ExerciseType.replace(/_/g, ' ')}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">Repetitions</span>
                  <span className="text-xs font-bold text-slate-800">
                    {summary.latestSession.CompletedRepetitions} / {summary.latestSession.TargetRepetitions}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">Estimated ROM</span>
                  <span className="text-xs font-bold text-slate-800">
                    {summary.latestSession.EstimatedRangeOfMotion ? `${summary.latestSession.EstimatedRangeOfMotion}°` : 'N/A'}
                  </span>
                </div>
                <div className="p-3 rounded-lg bg-slate-50 border border-slate-200">
                  <span className="text-[11px] text-slate-500 block">Tracking Mode</span>
                  <span className="text-xs font-bold text-teal-700 capitalize">
                    {summary.latestSession.TrackingMode.replace(/_/g, ' ')}
                  </span>
                </div>
              </div>

              {summary.latestSession.Notes && (
                <div className="text-xs text-slate-600 bg-slate-50/80 p-2.5 rounded-lg border border-slate-200/80 italic">
                  "{summary.latestSession.Notes}"
                </div>
              )}

              <div className="flex justify-end pt-2">
                <Link
                  to={`/sessions/${summary.latestSession.SessionId}`}
                  className="text-xs font-semibold text-teal-700 hover:text-teal-800 flex items-center gap-1"
                >
                  <span>Review Complete Session Telemetry</span>
                  <ArrowUpRight className="w-3.5 h-3.5" />
                </Link>
              </div>
            </div>
          ) : (
            <div className="py-6 text-center text-xs text-slate-400">
              No sessions completed yet. Start an exercise to view metrics.
            </div>
          )}
        </div>
      </div>

      {/* Telemetry Charts (Recharts) */}
      {hasData && progress.length > 0 && (
        <div className="space-y-6 pt-2">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight">Rehabilitation Progress Trends</h2>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Chart 1: Repetitions Completed Over Time */}
            <div className="healthcare-card p-5">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
                Repetitions Completed Over Time
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={progress}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Bar dataKey="repetitions" name="Completed Reps" fill="#0d9488" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="targetRepetitions" name="Target Reps" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 2: Estimated Angular Range of Motion (ROM) */}
            <div className="healthcare-card p-5">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
                Estimated Range of Motion (ROM in Degrees)
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progress.filter((p) => p.rangeOfMotion !== null)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={['auto', 'auto']} tick={{ fontSize: 11 }} unit="°" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Line
                      type="monotone"
                      dataKey="rangeOfMotion"
                      name="Range of Motion"
                      stroke="#0f766e"
                      strokeWidth={2.5}
                      dot={{ r: 4, fill: '#0f766e' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 3: Pain & Fatigue Ratings */}
            <div className="healthcare-card p-5">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
                Patient-Reported Pain & Fatigue (0–10 Scale)
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progress.filter((p) => p.painRating !== null || p.fatigueRating !== null)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 10]} tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Line
                      type="monotone"
                      dataKey="painRating"
                      name="Pain Level"
                      stroke="#f59e0b"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#f59e0b' }}
                    />
                    <Line
                      type="monotone"
                      dataKey="fatigueRating"
                      name="Fatigue Level"
                      stroke="#64748b"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#64748b' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>

            {/* Chart 4: Thermal Bilateral Intensity Differences */}
            <div className="healthcare-card p-5">
              <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-4">
                Bilateral Thermal Regional Difference (Left vs Right Intensity Units)
              </h3>
              <div className="h-64 w-full">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={progress.filter((p) => p.thermalAsymmetry !== null)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} unit=" u" />
                    <Tooltip
                      contentStyle={{ backgroundColor: '#ffffff', borderRadius: '8px', fontSize: '12px' }}
                    />
                    <Legend wrapperStyle={{ fontSize: '11px' }} />
                    <Line
                      type="monotone"
                      dataKey="thermalAsymmetry"
                      name="Regional Difference"
                      stroke="#dc2626"
                      strokeWidth={2}
                      dot={{ r: 4, fill: '#dc2626' }}
                    />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
