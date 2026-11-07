import React from 'react';
import { Shield, Cpu, Activity, RotateCcw } from 'lucide-react';

export default function Header({ systemHealth, metrics, activeModel, onReset, currentJob }) {
  const isHealthy = metrics?.isHealthy ?? true;
  const ramMb = metrics?.combinedAppRamMB || 0;
  const limitMb = metrics?.budgetLimitMB || 4096;
  const percent = metrics?.percentOfBudget || 0;

  return (
    <header className="sticky top-0 z-30 border-b border-slate-800 bg-slate-950/80 backdrop-blur-md px-6 py-3.5 transition-all">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-cyan-500 p-0.5 shadow-lg shadow-emerald-500/20">
            <div className="h-full w-full rounded-[10px] bg-slate-950 flex items-center justify-center">
              <Shield className="h-5 w-5 text-emerald-400" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-white">Local AI Security Log Analyzer</h1>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                Offline SOC
              </span>
            </div>
            <p className="text-xs text-slate-400">
              Cross-Chunk Attack Hunter • Strict 2,048 Token Budget • 4 GB RAM Guard
            </p>
          </div>
        </div>

        {/* Live System Status Badges */}
        <div className="flex items-center gap-3">
          {/* Active Model Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-slate-800 bg-slate-900/60 text-xs">
            <Cpu className="h-3.5 w-3.5 text-cyan-400" />
            <span className="text-slate-400">Model:</span>
            <span className="font-medium text-slate-200">
              {activeModel || 'qwen2.5:1.5b'}
            </span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
            </span>
          </div>

          {/* Real-Time RAM Budget Pill */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors ${
            isHealthy
              ? 'border-emerald-500/30 bg-emerald-950/30 text-emerald-300'
              : 'border-rose-500/40 bg-rose-950/40 text-rose-300'
          }`}>
            <Activity className="h-3.5 w-3.5" />
            <span>RAM:</span>
            <span className="font-semibold">{ramMb} MB</span>
            <span className="text-slate-400">/ {limitMb} MB</span>
            <span className="text-[11px] font-mono px-1.5 py-0.2 rounded bg-black/30">
              {percent}%
            </span>
          </div>

          {/* Reset / New Analysis Button */}
          {currentJob && (
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-700 bg-slate-800 hover:bg-slate-700 text-xs text-slate-200 transition-colors shadow-sm cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5 text-slate-400" />
              <span>New Analysis</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
