import React from 'react';
import { AlertCircle } from 'lucide-react';

export const MedicalDisclaimer: React.FC<{ compact?: boolean }> = ({ compact = false }) => {
  if (compact) {
    return (
      <div className="flex items-center gap-2 text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200">
        <AlertCircle className="w-3.5 h-3.5 text-teal-600 shrink-0" />
        <span>Rehabilitation prototype. Estimates do not replace clinical physiotherapy assessment.</span>
      </div>
    );
  }

  return (
    <div className="bg-teal-50/60 border border-teal-200/80 rounded-xl p-3.5 flex items-start gap-3 text-slate-700 text-xs leading-relaxed">
      <AlertCircle className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
      <div>
        <p className="font-semibold text-slate-900 mb-0.5">Medical Safety Notice</p>
        <p>
          TheraTrack is a rehabilitation monitoring prototype, not a diagnostic device. Its measurements are estimates and must not replace a physiotherapist's assessment.
        </p>
      </div>
    </div>
  );
};
