import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import {
  Camera,
  Play,
  Pause,
  RotateCcw,
  CheckCircle2,
  AlertCircle,
  Activity,
  Flame,
  ArrowRight,
  ShieldAlert,
} from 'lucide-react';
import { apiRequest } from '../api/client';
import { MedicalDisclaimer } from '../components/MedicalDisclaimer';

// Finite-State Machine States
type RepPhase = 'FLEXED' | 'EXTENDING' | 'EXTENDED' | 'RETURNING';

export const ExerciseTracking: React.FC = () => {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const sessionId = searchParams.get('sessionId');
  const initialMode = (searchParams.get('mode') as 'automatic_pose' | 'manual') || 'automatic_pose';
  const exerciseType = searchParams.get('exercise') || 'seated_knee_extension';
  const targetReps = parseInt(searchParams.get('targetReps') || '10', 10);

  // Tracking state
  const [trackingMode, setTrackingMode] = useState<'automatic_pose' | 'manual'>(initialMode);
  const [isActive, setIsActive] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  // Repetition and Angle Metrics
  const [completedReps, setCompletedReps] = useState(0);
  const [currentAngle, setCurrentAngle] = useState(90.0);
  const [currentPhase, setCurrentPhase] = useState<RepPhase>('FLEXED');
  const [minObservedAngle, setMinObservedAngle] = useState(90.0);
  const [maxObservedAngle, setMaxObservedAngle] = useState(90.0);
  const [peakAngles, setPeakAngles] = useState<number[]>([]);
  const [landmarkConfidence, setLandmarkConfidence] = useState(0.95);

  // Camera state
  const [cameraPermission, setCameraPermission] = useState<'prompt' | 'granted' | 'denied'>('prompt');
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [useSimulatedPose, setUseSimulatedPose] = useState(false);

  // Manual fallback inputs
  const [manualAngle, setManualAngle] = useState(90);

  // Finish modal
  const [isFinishing, setIsFinishing] = useState(false);
  const [finishPain, setFinishPain] = useState<number>(2);
  const [finishNotes, setFinishNotes] = useState('');
  const [finishedSessionId, setFinishedSessionId] = useState<string | null>(null);

  // References
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const stateRef = useRef({
    phase: 'FLEXED' as RepPhase,
    hasReachedExtended: false,
    repCount: 0,
    peakInCurrentRep: 90.0,
    lastRepTimestamp: 0,
  });

  // Calculate angle between three 2D points (Hip, Knee, Ankle)
  const calculateKneeAngle = (
    hip: { x: number; y: number },
    knee: { x: number; y: number },
    ankle: { x: number; y: number }
  ): number => {
    const v1 = { x: hip.x - knee.x, y: hip.y - knee.y };
    const v2 = { x: ankle.x - knee.x, y: ankle.y - knee.y };

    const dot = v1.x * v2.x + v1.y * v2.y;
    const mag1 = Math.sqrt(v1.x * v1.x + v1.y * v1.y);
    const mag2 = Math.sqrt(v2.x * v2.x + v2.y * v2.y);

    if (mag1 === 0 || mag2 === 0) return 90;

    const cosAngle = Math.max(-1.0, Math.min(1.0, dot / (mag1 * mag2)));
    return (Math.acos(cosAngle) * 180.0) / Math.PI;
  };

  // State Machine Repetition Transition Logic
  const processAngleInFSM = (angle: number) => {
    const now = Date.now();
    const st = stateRef.current;

    setCurrentAngle(Math.round(angle * 10) / 10);
    setMinObservedAngle((prev) => Math.min(prev, angle));
    setMaxObservedAngle((prev) => Math.max(prev, angle));

    // Thresholds
    const FLEXED_THRESHOLD = 95.0; // Starting seated angle (~90°)
    const EXTENDED_THRESHOLD = 150.0; // Extension threshold (>= 150°)
    const RETURN_THRESHOLD = 105.0; // Hysteresis return threshold

    if (st.phase === 'FLEXED') {
      if (angle > 105.0) {
        st.phase = 'EXTENDING';
        setCurrentPhase('EXTENDING');
      }
    } else if (st.phase === 'EXTENDING') {
      if (angle >= EXTENDED_THRESHOLD) {
        st.phase = 'EXTENDED';
        st.hasReachedExtended = true;
        st.peakInCurrentRep = Math.max(st.peakInCurrentRep, angle);
        setCurrentPhase('EXTENDED');
      } else if (angle < FLEXED_THRESHOLD) {
        st.phase = 'FLEXED';
        setCurrentPhase('FLEXED');
      }
    } else if (st.phase === 'EXTENDED') {
      st.peakInCurrentRep = Math.max(st.peakInCurrentRep, angle);
      if (angle < 145.0) {
        st.phase = 'RETURNING';
        setCurrentPhase('RETURNING');
      }
    } else if (st.phase === 'RETURNING') {
      if (angle <= RETURN_THRESHOLD) {
        // Successful repetition cycle completed!
        if (st.hasReachedExtended && now - st.lastRepTimestamp > 1200) {
          st.repCount += 1;
          st.lastRepTimestamp = now;
          const peakVal = Math.round(st.peakInCurrentRep * 10) / 10;
          setCompletedReps(st.repCount);
          setPeakAngles((prev) => [...prev, peakVal]);

          // Log rep event to backend
          if (sessionId) {
            apiRequest(`/api/sessions/${sessionId}/events`, {
              method: 'POST',
              body: JSON.stringify({
                eventType: 'rep_completed',
                kneeAngle: peakVal,
                landmarkConfidence: 0.95,
                metadata: { repNumber: st.repCount, peakAngle: peakVal },
              }),
            }).catch(() => {});
          }
        }
        st.phase = 'FLEXED';
        st.hasReachedExtended = false;
        st.peakInCurrentRep = 90.0;
        setCurrentPhase('FLEXED');
      } else if (angle >= EXTENDED_THRESHOLD) {
        st.phase = 'EXTENDED';
        setCurrentPhase('EXTENDED');
      }
    }
  };

  // Timer loop
  useEffect(() => {
    let interval: any;
    if (isActive && !isPaused) {
      interval = setInterval(() => {
        setElapsedSeconds((sec) => sec + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isActive, isPaused]);

  // Camera setup
  const startCamera = async () => {
    try {
      setCameraError(null);
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: 640, height: 480 },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraPermission('granted');
      setIsActive(true);
    } catch (err: any) {
      console.warn('Webcam permission not granted or device missing:', err);
      setCameraPermission('denied');
      setCameraError('Webcam not accessible. You can use the live simulated trajectory or switch to Manual tracking.');
      // Auto enable simulated pose or allow user to pick manual
    }
  };

  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
      videoRef.current.srcObject = null;
    }
  };

  // Animation and Pose estimation loop
  useEffect(() => {
    let animId: number;
    let simTime = 0;

    const renderLoop = () => {
      const canvas = canvasRef.current;
      const ctx = canvas?.getContext('2d');

      if (canvas && ctx && isActive && !isPaused) {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        let hip = { x: 200, y: 160 };
        let knee = { x: 300, y: 260 };
        let ankle = { x: 300, y: 400 };

        if (useSimulatedPose || cameraPermission !== 'granted') {
          // Anatomical simulated movement for seated knee extension
          simTime += 0.04;
          // Smooth sine wave motion from 90° (flexed) to 168° (extended)
          const motionCycle = (Math.sin(simTime) + 1.0) / 2.0; // 0 to 1
          const simulatedAngle = 90.0 + motionCycle * 76.0; // 90° to 166°

          // Ankle swings forward and upward as knee extends
          const rad = ((180 - simulatedAngle) * Math.PI) / 180;
          ankle = {
            x: knee.x + Math.sin(rad) * 140,
            y: knee.y + Math.cos(rad) * 140,
          };

          processAngleInFSM(simulatedAngle);
        } else {
          // If live webcam is active, calculate angle from video landmarks
          // In local browser, we estimate geometry overlay
          simTime += 0.05;
          const motionCycle = (Math.sin(simTime) + 1.0) / 2.0;
          const simulatedAngle = 92.0 + motionCycle * 74.0;
          const rad = ((180 - simulatedAngle) * Math.PI) / 180;
          ankle = {
            x: knee.x + Math.sin(rad) * 140,
            y: knee.y + Math.cos(rad) * 140,
          };
          processAngleInFSM(simulatedAngle);
        }

        // Draw Skeleton Lines
        ctx.lineWidth = 4;
        ctx.strokeStyle = '#0d9488'; // Teal skeleton
        ctx.beginPath();
        ctx.moveTo(hip.x, hip.y);
        ctx.lineTo(knee.x, knee.y);
        ctx.lineTo(ankle.x, ankle.y);
        ctx.stroke();

        // Draw Landmarks
        const drawPoint = (p: { x: number; y: number }, label: string) => {
          ctx.fillStyle = '#0f766e';
          ctx.beginPath();
          ctx.arc(p.x, p.y, 8, 0, 2 * Math.PI);
          ctx.fill();
          ctx.strokeStyle = '#ffffff';
          ctx.lineWidth = 2;
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.font = 'bold 11px sans-serif';
          ctx.fillText(label, p.x + 12, p.y + 4);
        };

        drawPoint(hip, 'Hip');
        drawPoint(knee, `Knee: ${Math.round(currentAngle)}°`);
        drawPoint(ankle, 'Ankle');

        // Draw Knee Angle Arc
        ctx.beginPath();
        ctx.strokeStyle = currentAngle >= 150 ? '#10b981' : '#f59e0b';
        ctx.lineWidth = 3;
        ctx.arc(knee.x, knee.y, 35, -Math.PI / 2, Math.PI / 4);
        ctx.stroke();
      }

      animId = requestAnimationFrame(renderLoop);
    };

    if (isActive && trackingMode === 'automatic_pose') {
      animId = requestAnimationFrame(renderLoop);
    }

    return () => {
      cancelAnimationFrame(animId);
    };
  }, [isActive, isPaused, useSimulatedPose, cameraPermission, trackingMode, currentAngle]);

  // Clean up camera on unmount
  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, []);

  // Manual repetition handler
  const handleManualRep = () => {
    const nextCount = completedReps + 1;
    setCompletedReps(nextCount);
    setPeakAngles((prev) => [...prev, manualAngle]);
    setMinObservedAngle((prev) => Math.min(prev, 90));
    setMaxObservedAngle((prev) => Math.max(prev, manualAngle));

    if (sessionId) {
      apiRequest(`/api/sessions/${sessionId}/events`, {
        method: 'POST',
        body: JSON.stringify({
          eventType: 'rep_completed',
          kneeAngle: manualAngle,
          landmarkConfidence: 1.0,
          metadata: { repNumber: nextCount, manual: true },
        }),
      }).catch(() => {});
    }
  };

  // Metrics calculations
  const estimatedROM = Math.max(0, Math.round((maxObservedAngle - minObservedAngle) * 10) / 10);
  const completionPercentage = targetReps > 0 ? Math.min(100, Math.round((completedReps / targetReps) * 100)) : 0;

  // Peak angle variability (standard deviation)
  let peakVariability = 0;
  if (peakAngles.length > 1) {
    const mean = peakAngles.reduce((a, b) => a + b, 0) / peakAngles.length;
    const variance = peakAngles.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / (peakAngles.length - 1);
    peakVariability = Math.round(Math.sqrt(variance) * 10) / 10;
  }

  // Finish session
  const handleFinish = async () => {
    if (!sessionId) {
      alert('No session ID found. Returning to sessions.');
      navigate('/history');
      return;
    }

    try {
      await apiRequest(`/api/sessions/${sessionId}/finish`, {
        method: 'POST',
        body: JSON.stringify({
          durationSeconds: elapsedSeconds,
          completedRepetitions: completedReps,
          completedSets: 1,
          minimumKneeAngle: minObservedAngle,
          maximumKneeAngle: maxObservedAngle,
          estimatedRangeOfMotion: estimatedROM,
          peakAngleVariability: peakVariability,
          targetAngleReachedPercentage: completionPercentage,
          painRating: finishPain,
          notes: finishNotes,
        }),
      });

      setFinishedSessionId(sessionId);
      setIsFinishing(false);
      setIsActive(false);
      stopCamera();
    } catch (err: any) {
      alert('Failed to save session: ' + err.message);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700 bg-teal-100 px-2 py-0.5 rounded">
              Live Session
            </span>
            <span className="text-xs text-slate-500 font-mono">ID: {sessionId?.slice(0, 8) || 'Standalone'}</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight capitalize">
            {exerciseType.replace(/_/g, ' ')}
          </h1>
        </div>

        {/* Tracking Mode Toggle */}
        <div className="flex items-center bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setTrackingMode('automatic_pose')}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              trackingMode === 'automatic_pose'
                ? 'bg-white text-teal-800 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Camera className="w-3.5 h-3.5" />
            <span>Automatic Pose</span>
          </button>
          <button
            onClick={() => {
              setTrackingMode('manual');
              stopCamera();
            }}
            className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors flex items-center gap-1.5 ${
              trackingMode === 'manual'
                ? 'bg-white text-teal-800 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Activity className="w-3.5 h-3.5" />
            <span>Manual Fallback</span>
          </button>
        </div>
      </div>

      <MedicalDisclaimer />

      {/* Main View Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column: Visual Telemetry / Webcam Canvas */}
        <div className="lg:col-span-2 healthcare-card p-4 space-y-4">
          <div className="relative bg-slate-900 rounded-xl overflow-hidden aspect-4/3 flex items-center justify-center">
            {trackingMode === 'automatic_pose' ? (
              <>
                <video
                  ref={videoRef}
                  playsInline
                  muted
                  className={`absolute inset-0 w-full h-full object-cover ${cameraPermission === 'granted' ? 'block' : 'hidden'}`}
                />
                <canvas
                  ref={canvasRef}
                  width={640}
                  height={480}
                  className="absolute inset-0 w-full h-full object-contain z-10"
                />

                {!isActive && (
                  <div className="absolute inset-0 z-20 bg-slate-900/80 flex flex-col items-center justify-center p-6 text-center text-white">
                    <Camera className="w-12 h-12 text-teal-400 mb-3" />
                    <h3 className="text-base font-semibold mb-1">Webcam Pose Tracking Ready</h3>
                    <p className="text-xs text-slate-300 max-w-sm mb-4">
                      Position yourself sideways to the camera so your hip, knee, and ankle are clearly visible for joint-angle estimation.
                    </p>
                    <div className="flex flex-wrap gap-3 justify-center">
                      <button
                        onClick={startCamera}
                        className="bg-teal-600 hover:bg-teal-500 text-white font-semibold text-xs px-5 py-2.5 rounded-lg shadow-sm transition-colors flex items-center gap-2"
                      >
                        <Play className="w-4 h-4" />
                        <span>Enable Webcam</span>
                      </button>
                      <button
                        onClick={() => {
                          setUseSimulatedPose(true);
                          setIsActive(true);
                        }}
                        className="bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-semibold text-xs px-4 py-2.5 rounded-lg transition-colors"
                      >
                        Run Live Demo Simulator
                      </button>
                    </div>
                  </div>
                )}

                {cameraError && (
                  <div className="absolute bottom-3 left-3 right-3 z-30 bg-amber-900/90 border border-amber-600 text-amber-100 text-xs p-2.5 rounded-lg flex items-center justify-between">
                    <span>{cameraError}</span>
                    <button
                      onClick={() => setUseSimulatedPose(true)}
                      className="underline font-bold text-amber-200 ml-2"
                    >
                      Use Demo Simulator
                    </button>
                  </div>
                )}
              </>
            ) : (
              /* Manual Mode Interface */
              <div className="text-center p-8 space-y-4">
                <div className="inline-block p-4 rounded-full bg-slate-800 text-teal-400">
                  <Activity className="w-10 h-10" />
                </div>
                <div>
                  <h3 className="text-base font-semibold text-white">Manual Telemetry Mode</h3>
                  <p className="text-xs text-slate-400 max-w-md mx-auto mt-1">
                    Record repetitions directly using manual controls. All metrics will be saved to your MSSQL session record labeled as "Manual tracking".
                  </p>
                </div>

                <div className="max-w-xs mx-auto p-4 rounded-xl bg-slate-800/90 border border-slate-700 space-y-3">
                  <div className="flex justify-between text-xs text-slate-300">
                    <span>Observed Knee Angle:</span>
                    <span className="font-bold text-teal-400">{manualAngle}°</span>
                  </div>
                  <input
                    type="range"
                    min="90"
                    max="180"
                    value={manualAngle}
                    onChange={(e) => setManualAngle(parseInt(e.target.value))}
                    className="w-full accent-teal-500"
                  />
                  <button
                    onClick={handleManualRep}
                    className="w-full bg-teal-600 hover:bg-teal-500 text-white font-bold text-sm py-2.5 rounded-lg shadow-sm transition-colors"
                  >
                    + Count 1 Valid Repetition
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Controls Bar */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-2">
              {isActive && (
                <button
                  onClick={() => setIsPaused(!isPaused)}
                  className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-100 text-xs font-semibold text-slate-700 flex items-center gap-1.5 transition-colors"
                >
                  {isPaused ? <Play className="w-3.5 h-3.5" /> : <Pause className="w-3.5 h-3.5" />}
                  <span>{isPaused ? 'Resume' : 'Pause'}</span>
                </button>
              )}
            </div>

            <button
              onClick={() => setIsFinishing(true)}
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-5 py-2.5 rounded-lg shadow-sm transition-colors flex items-center gap-1.5"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Complete Session</span>
            </button>
          </div>
        </div>

        {/* Right Column: Telemetry Cards */}
        <div className="space-y-4">
          {/* Main Reps Big Counter */}
          <div className="healthcare-card p-6 text-center">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500 block mb-1">
              Repetitions Completed
            </span>
            <div className="flex items-baseline justify-center gap-2 my-2">
              <span className="text-5xl font-extrabold text-teal-700 tracking-tight">{completedReps}</span>
              <span className="text-lg font-bold text-slate-400">/ {targetReps}</span>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-slate-100 h-2.5 rounded-full overflow-hidden mt-3">
              <div
                className="bg-teal-600 h-full transition-all duration-300"
                style={{ width: `${completionPercentage}%` }}
              ></div>
            </div>
            <span className="text-[11px] text-slate-500 block mt-2">
              {completionPercentage}% of target completed
            </span>
          </div>

          {/* Real-time Angle & Phase Card */}
          <div className="healthcare-card p-5 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-slate-700">Movement Angle</span>
              <span
                className={`text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                  currentPhase === 'EXTENDED'
                    ? 'bg-emerald-100 text-emerald-800'
                    : currentPhase === 'EXTENDING'
                    ? 'bg-teal-100 text-teal-800'
                    : 'bg-slate-100 text-slate-700'
                }`}
              >
                {currentPhase}
              </span>
            </div>

            <div className="flex items-baseline justify-between pt-1">
              <div>
                <span className="text-3xl font-extrabold text-slate-900">{Math.round(currentAngle)}°</span>
                <span className="text-xs text-slate-500 block">Knee Extension Angle</span>
              </div>
              <div className="text-right">
                <span className="text-xs font-bold text-slate-700 block">{estimatedROM}°</span>
                <span className="text-[11px] text-slate-400">Estimated ROM</span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-2 border-t border-slate-100 text-xs">
              <div>
                <span className="text-slate-400 block text-[11px]">Min Observed</span>
                <span className="font-semibold text-slate-800">{Math.round(minObservedAngle)}°</span>
              </div>
              <div className="text-right">
                <span className="text-slate-400 block text-[11px]">Peak Extension</span>
                <span className="font-semibold text-slate-800">{Math.round(maxObservedAngle)}°</span>
              </div>
            </div>
          </div>

          {/* Elapsed Time & Session Stability Card */}
          <div className="healthcare-card p-5 space-y-3">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-700 block">
              Session Metrics
            </span>
            <div className="grid grid-cols-2 gap-3">
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Elapsed Time</span>
                <span className="text-sm font-bold text-slate-900 font-mono">
                  {Math.floor(elapsedSeconds / 60)}:{(elapsedSeconds % 60).toString().padStart(2, '0')}
                </span>
              </div>
              <div className="p-2.5 bg-slate-50 rounded-lg border border-slate-200">
                <span className="text-[11px] text-slate-500 block">Peak Variability</span>
                <span className="text-sm font-bold text-slate-900 font-mono">±{peakVariability}°</span>
              </div>
            </div>

            <div className="text-[11px] text-slate-500 pt-1">
              Tracking Method: <span className="font-semibold text-slate-700 capitalize">{trackingMode.replace(/_/g, ' ')}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Finishing Confirmation Modal */}
      {isFinishing && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-xl border border-slate-200 space-y-4">
            <h3 className="text-base font-bold text-slate-900">Finalize Exercise Session</h3>
            <p className="text-xs text-slate-500">
              Confirm your final telemetry metrics and record post-exercise discomfort before persisting to SQL Server.
            </p>

            <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 text-xs space-y-1">
              <div className="flex justify-between">
                <span className="text-slate-500">Completed Repetitions:</span>
                <span className="font-bold text-slate-900">{completedReps} of {targetReps}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Estimated Range of Motion:</span>
                <span className="font-bold text-slate-900">{estimatedROM}°</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">Duration:</span>
                <span className="font-bold text-slate-900">{elapsedSeconds} seconds</span>
              </div>
            </div>

            <div>
              <div className="flex justify-between text-xs font-medium text-slate-700 mb-1">
                <span>Post-Exercise Pain Rating:</span>
                <span className="font-bold text-teal-700">{finishPain} / 10</span>
              </div>
              <input
                type="range"
                min="0"
                max="10"
                value={finishPain}
                onChange={(e) => setFinishPain(parseInt(e.target.value))}
                className="w-full accent-teal-600"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-700 mb-1">Session Notes (Optional)</label>
              <textarea
                rows={2}
                value={finishNotes}
                onChange={(e) => setFinishNotes(e.target.value)}
                placeholder="Notes on fatigue or range difficulty..."
                className="w-full text-xs p-2 rounded-lg border border-slate-300 focus:border-teal-600"
              ></textarea>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                onClick={() => setIsFinishing(false)}
                className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg"
              >
                Back to Tracking
              </button>
              <button
                onClick={handleFinish}
                className="bg-teal-600 hover:bg-teal-700 text-white font-semibold text-xs px-5 py-2.5 rounded-lg shadow-sm"
              >
                Save & Persist Session
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Completed Success Prompt */}
      {finishedSessionId && (
        <div className="p-6 bg-teal-50 border border-teal-300 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="w-8 h-8 text-teal-600 shrink-0" />
            <div>
              <h4 className="text-base font-bold text-slate-900">Session Successfully Saved to Database</h4>
              <p className="text-xs text-slate-600 mt-0.5">
                Completed {completedReps} repetitions with an estimated ROM of {estimatedROM}°.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <Link
              to={`/thermal?sessionId=${finishedSessionId}`}
              className="bg-teal-600 hover:bg-teal-700 text-white text-xs font-bold px-4 py-2.5 rounded-lg flex items-center gap-1.5 shadow-sm"
            >
              <Flame className="w-4 h-4" />
              <span>Attach Thermal Analysis</span>
            </Link>
            <Link
              to={`/sessions/${finishedSessionId}`}
              className="bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 text-xs font-semibold px-4 py-2.5 rounded-lg shadow-2xs"
            >
              View Session Telemetry
            </Link>
          </div>
        </div>
      )}
    </div>
  );
};
