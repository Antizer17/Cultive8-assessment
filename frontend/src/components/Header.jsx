import React from 'react';
import { Shield, Cpu, Activity, RotateCcw } from 'lucide-react';

export default function Header({ systemHealth, metrics, activeModel, onReset, currentJob }) {
  const isHealthy = metrics?.isHealthy ?? true;
  const ramMb = metrics?.combinedAppRamMB || 0;
  const limitMb = metrics?.budgetLimitMB || 4096;
  const percent = metrics?.percentOfBudget || 0;

  return (
    <header className="sticky top-0 z-30 border-b border-[#202737] bg-[#0a0c10]/85 backdrop-blur-md px-6 py-3.5 transition-all">
      <div className="max-w-7xl mx-auto flex flex-wrap items-center justify-between gap-4">
        {/* Brand & Subtitle */}
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-[#d4b996] via-[#38bdf8] to-[#60a5fa] p-0.5 shadow-lg shadow-sky-950/40">
            <div className="h-full w-full rounded-[10px] bg-[#0e1219] flex items-center justify-center">
              <Shield className="h-5 w-5 text-[#e5d7c3]" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-lg font-bold tracking-tight text-[#f5efe6]">Local AI Security Log Analyzer</h1>
              <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#d4b996]/15 text-[#e5d7c3] border border-[#d4b996]/30">
                Offline SOC
              </span>
            </div>
            <p className="text-xs text-[#9e9282]">
              Cross-Chunk Attack Hunter • Strict 2,048 Token Budget • 4 GB RAM Guard
            </p>
          </div>
        </div>

        {/* Live System Status Badges */}
        <div className="flex items-center gap-3">
          {/* Active Model Pill */}
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[#232b3b] bg-[#12161f]/80 text-xs shadow-sm">
            <Cpu className="h-3.5 w-3.5 text-[#38bdf8]" />
            <span className="text-[#9e9282]">Model:</span>
            <span className="font-medium text-[#f5efe6]">
              {activeModel || 'qwen2.5:1.5b'}
            </span>
            <span className="flex h-2 w-2 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#38bdf8] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-[#38bdf8]"></span>
            </span>
          </div>

          {/* Real-Time RAM Budget Pill */}
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-colors shadow-sm ${
            isHealthy
              ? 'border-[#0284c7]/40 bg-[#0c1829]/60 text-[#7dd3fc]'
              : 'border-rose-500/40 bg-rose-950/40 text-rose-300'
          }`}>
            <Activity className="h-3.5 w-3.5 text-[#38bdf8]" />
            <span>RAM:</span>
            <span className="font-semibold text-[#f5efe6]">{ramMb} MB</span>
            <span className="text-[#9e9282]">/ {limitMb} MB</span>
            <span className="text-[11px] font-mono px-1.5 py-0.5 rounded bg-[#0a0c10]/60 text-[#d8cdbe] border border-[#202737]">
              {percent}%
            </span>
          </div>

          {/* Reset / New Analysis Button */}
          {currentJob && (
            <button
              onClick={onReset}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#2b3548] bg-[#151c28] hover:bg-[#1d2738] text-xs text-[#e7decb] transition-colors shadow-sm cursor-pointer"
            >
              <RotateCcw className="h-3.5 w-3.5 text-[#9e9282]" />
              <span>New Analysis</span>
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
