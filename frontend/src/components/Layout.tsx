import React from 'react';
import { Outlet } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { MedicalDisclaimer } from './MedicalDisclaimer';

export const Layout: React.FC = () => {
  return (
    <div className="flex min-h-screen bg-slate-50">
      <Sidebar />
      <main className="flex-1 flex flex-col min-w-0 overflow-y-auto">
        <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between sticky top-0 z-20">
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-teal-100 text-teal-800">
              Prototype v1.0
            </span>
            <span className="text-xs text-slate-500">Knee Rehabilitation & Thermal Monitoring</span>
          </div>
          <MedicalDisclaimer compact />
        </header>
        <div className="p-6 md:p-8 flex-1 max-w-7xl mx-auto w-full">
          <Outlet />
        </div>
      </main>
    </div>
  );
};
