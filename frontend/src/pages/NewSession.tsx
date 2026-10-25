import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PlayCircle, Camera, CheckSquare, AlertCircle, Info } from 'lucide-react';
import { apiRequest } from '../api/client';
import { MedicalDisclaimer } from '../components/MedicalDisclaimer';

export const NewSession: React.FC = () => {
  const [exerciseType, setExerciseType] = useState('seated_knee_extension');
  const [trackingMode, setTrackingMode] = useState<'automatic_pose' | 'manual'>('automatic_pose');
  const [targetRepetitions, setTargetRepetitions] = useState(10);
  const [targetSets, setTargetSets] = useState(1);
  const [painRating, setPainRating] = useState<number>(2);
  const [sorenessRating, setSorenessRating] = useState<number>(2);
  const [fatigueRating, setFatigueRating] = useState<number>(2);
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const navigate = useNavigate();

  const handleStartSession = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    setError(null);

    try {
      const result = await apiRequest<{ sessionId: string }>('/api/sessions', {
        method: 'POST',
        body: JSON.stringify({
          exerciseType,
          trackingMode,
          targetRepetitions: Number(targetRepetitions),
          targetSets: Number(targetSets),
          painRating: Number(painRating),
          sorenessRating: Number(sorenessRating),
          fatigueRating: Number(fatigueRating),
          notes,
        }),
      });

      // Navigate to ExerciseTracking with session state
      navigate(`/tracking?sessionId=${result.sessionId}&mode=${trackingMode}&exercise=${exerciseType}&targetReps=${targetRepetitions}`);
    } catch (err: any) {
      setError(err.message || 'Failed to initialize session');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">New Exercise Session</h1>
        <p className="text-sm text-slate-500">
          Configure target repetitions and self-reported baseline status before beginning movement tracking.
        </p>
      </div>

      <MedicalDisclaimer />

      {error && (
        <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-lg flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
          <span>{error}</span>
        </div>
      )}

      <form onSubmit={handleStartSession} className="space-y-6">
        {/* Exercise Selection */}
        <div className="healthcare-card p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">1. Exercise Selection</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                exerciseType === 'seated_knee_extension'
                  ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-600/20'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <input
                type="radio"
                name="exerciseType"
                value="seated_knee_extension"
                checked={exerciseType === 'seated_knee_extension'}
                onChange={() => setExerciseType('seated_knee_extension')}
                className="sr-only"
              />
              <div className="font-semibold text-sm text-slate-900">Seated Knee Extension</div>
              <p className="text-xs text-slate-500 mt-1">
                Quadriceps activation and patellar tracking from 90° flexion to ~165°–180° extension.
              </p>
            </label>

            <label
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                exerciseType === 'standing_knee_flexion'
                  ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-600/20'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <input
                type="radio"
                name="exerciseType"
                value="standing_knee_flexion"
                checked={exerciseType === 'standing_knee_flexion'}
                onChange={() => setExerciseType('standing_knee_flexion')}
                className="sr-only"
              />
              <div className="font-semibold text-sm text-slate-900">Standing Knee Flexion</div>
              <p className="text-xs text-slate-500 mt-1">
                Hamstring curl tracking from standing neutral to posterior knee flexion.
              </p>
            </label>
          </div>
        </div>

        {/* Tracking Mode */}
        <div className="healthcare-card p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">2. Movement Tracking Method</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <label
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                trackingMode === 'automatic_pose'
                  ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-600/20'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <input
                type="radio"
                name="trackingMode"
                value="automatic_pose"
                checked={trackingMode === 'automatic_pose'}
                onChange={() => setTrackingMode('automatic_pose')}
                className="sr-only"
              />
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
                <Camera className="w-4 h-4 text-teal-600" />
                <span>Webcam Pose Estimation</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Browser MediaPipe landmark tracking to compute real-time hip-knee-ankle joint angles.
              </p>
            </label>

            <label
              className={`p-4 rounded-xl border cursor-pointer transition-all ${
                trackingMode === 'manual'
                  ? 'border-teal-600 bg-teal-50/50 ring-2 ring-teal-600/20'
                  : 'border-slate-200 hover:border-slate-300 bg-white'
              }`}
            >
              <input
                type="radio"
                name="trackingMode"
                value="manual"
                checked={trackingMode === 'manual'}
                onChange={() => setTrackingMode('manual')}
                className="sr-only"
              />
              <div className="flex items-center gap-2 font-semibold text-sm text-slate-900">
                <CheckSquare className="w-4 h-4 text-teal-600" />
                <span>Manual Telemetry Fallback</span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Record repetitions manually if camera access is restricted or lighting is uncalibrated.
              </p>
            </label>
          </div>
        </div>

        {/* Goals & Sets */}
        <div className="healthcare-card p-6 space-y-4">
          <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">3. Repetition Targets</h2>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Target Repetitions</label>
              <input
                type="number"
                min="1"
                max="50"
                value={targetRepetitions}
                onChange={(e) => setTargetRepetitions(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Target Sets</label>
              <input
                type="number"
                min="1"
                max="10"
                value={targetSets}
                onChange={(e) => setTargetSets(parseInt(e.target.value) || 1)}
                className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
              />
            </div>
          </div>
        </div>

        {/* Pre-Session Patient Scale Ratings */}
        <div className="healthcare-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
              4. Pre-Session Discomfort Ratings (0–10)
            </h2>
            <span className="text-[11px] text-slate-400">0 = None, 10 = Severe</span>
          </div>

          <div className="space-y-4">
            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                <span>Pain Level</span>
                <span className="font-bold text-teal-700">{painRating} / 10</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={painRating}
                onChange={(e) => setPainRating(parseInt(e.target.value))}
                className="w-full accent-teal-600"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                <span>Joint Soreness / Stiffness</span>
                <span className="font-bold text-teal-700">{sorenessRating} / 10</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={sorenessRating}
                onChange={(e) => setSorenessRating(parseInt(e.target.value))}
                className="w-full accent-teal-600"
              />
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                <span>Muscular Fatigue</span>
                <span className="font-bold text-teal-700">{fatigueRating} / 10</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={fatigueRating}
                onChange={(e) => setFatigueRating(parseInt(e.target.value))}
                className="w-full accent-teal-600"
              />
            </div>
          </div>
        </div>

        {/* Clinical / Patient Notes */}
        <div className="healthcare-card p-6 space-y-2">
          <label className="block text-xs font-bold text-slate-900 uppercase tracking-wider">
            5. Clinical Notes & Observations (Optional)
          </label>
          <textarea
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            placeholder="e.g. Mild lateral patellar discomfort reported on first rep warm-up."
            className="w-full px-3 py-2 text-sm rounded-lg border border-slate-300 focus:border-teal-600 focus:ring-1 focus:ring-teal-600"
          ></textarea>
        </div>

        <div className="flex items-center justify-end gap-3 pt-2">
          <button
            type="submit"
            disabled={isSubmitting}
            className="bg-teal-600 hover:bg-teal-700 text-white font-semibold text-sm px-6 py-3 rounded-xl flex items-center gap-2 shadow-sm transition-colors disabled:opacity-60"
          >
            <PlayCircle className="w-5 h-5" />
            <span>{isSubmitting ? 'Starting Session...' : 'Launch Tracking Screen'}</span>
          </button>
        </div>
      </form>
    </div>
  );
};
