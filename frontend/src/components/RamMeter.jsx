import React from 'react';
import { Activity, HardDrive, Cpu, Zap, ShieldCheck, AlertTriangle } from 'lucide-react';

export default function RamMeter({ metrics, lastLatencyMs, totalTokensProcessed }) {
  const backendRam = metrics?.backendRamMB || 0;
  const modelRam = metrics?.modelRamMB || 0;
  const combinedRam = metrics?.combinedAppRamMB || 0;
  const budgetLimit = metrics?.budgetLimitMB || 4096;
  const fallbackThreshold = metrics?.fallbackThresholdMB || 3400;
  const percent = Math.min(100, metrics?.percentOfBudget || 0);
  const isHealthy = metrics?.isHealthy ?? true;

  // Segment widths for stacked bar
  const backendPercent = Math.min(100, (backendRam / budgetLimit) * 100);
  const modelPercent = Math.min(100, (modelRam / budgetLimit) * 100);

  return (
    <div className="rounded-2xl border border-[#202737] bg-[#11151e]/85 p-5 backdrop-blur-sm shadow-xl">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4">
        <div className="flex items-center gap-2">
          <Activity className="h-4 w-4 text-[#38bdf8]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#d8cdbe]">
            System Resource & RAM Budget Monitor
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {isHealthy ? (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-[#0284c7]/15 text-[#7dd3fc] border border-[#0284c7]/30">
              <ShieldCheck className="h-3.5 w-3.5 text-[#38bdf8]" />
              Within 4 GB Budget
            </span>
          ) : (
            <span className="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium bg-rose-500/15 text-rose-300 border border-rose-500/30">
              <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />
              RAM Threshold Warning
            </span>
          )}
        </div>
      </div>

      {/* Progress Bar Container */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-medium">
          <div className="flex items-center gap-3">
            <span className="text-[#9e9282]">Combined App RAM:</span>
            <span className="text-base font-bold text-[#f5efe6] font-mono">{combinedRam} MB</span>
            <span className="text-[#9e9282]/80 font-mono">/ {budgetLimit} MB</span>
          </div>
          <span className="font-mono text-[#38bdf8] font-bold">{percent}%</span>
        </div>

        {/* Stacked Progress Bar */}
        <div className="relative h-4 w-full rounded-full bg-[#161c28] overflow-hidden border border-[#273245] p-0.5">
          <div className="flex h-full rounded-full overflow-hidden">
            {/* Express Backend RAM (Steel Blue) */}
            <div
              style={{ width: `${backendPercent}%` }}
              className="bg-[#38bdf8] transition-all duration-500"
              title={`Express Backend: ${backendRam} MB`}
            />
            {/* Local Model RAM (Warm Beige Sand) */}
            <div
              style={{ width: `${modelPercent}%` }}
              className="bg-[#d4b996] transition-all duration-500"
              title={`Local AI Model: ${modelRam} MB`}
            />
          </div>

          {/* Fallback threshold line marker (85% / 3,400 MB) */}
          <div
            style={{ left: `${(fallbackThreshold / budgetLimit) * 100}%` }}
            className="absolute top-0 bottom-0 w-0.5 bg-rose-500/80 z-10"
            title="Auto-Fallback Threshold (3,400 MB)"
          />
        </div>

        {/* Scale labels */}
        <div className="flex justify-between text-[10px] text-[#9e9282] font-mono">
          <span>0 MB</span>
          <span>1,000 MB</span>
          <span>2,000 MB</span>
          <span className="text-rose-400 font-semibold">3,400 MB (Fallback Trigger)</span>
          <span>4,096 MB (Max Limit)</span>
        </div>
      </div>

      {/* Metrics Breakdown Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4 pt-4 border-t border-[#202737]">
        <div className="rounded-xl border border-[#202737] bg-[#0c0f16]/70 p-3">
          <div className="flex items-center gap-1.5 text-[#9e9282] text-xs mb-1">
            <HardDrive className="h-3.5 w-3.5 text-[#38bdf8]" />
            <span>Backend RSS</span>
          </div>
          <p className="text-sm font-semibold text-[#f5efe6] font-mono">{backendRam} MB</p>
          <p className="text-[10px] text-[#9e9282]">Express + Node working set</p>
        </div>

        <div className="rounded-xl border border-[#202737] bg-[#0c0f16]/70 p-3">
          <div className="flex items-center gap-1.5 text-[#9e9282] text-xs mb-1">
            <Cpu className="h-3.5 w-3.5 text-[#d4b996]" />
            <span>Local Model RAM</span>
          </div>
          <p className="text-sm font-semibold text-[#f5efe6] font-mono">{modelRam} MB</p>
          <p className="text-[10px] text-[#9e9282]">Ollama weights & KV cache</p>
        </div>

        <div className="rounded-xl border border-[#202737] bg-[#0c0f16]/70 p-3">
          <div className="flex items-center gap-1.5 text-[#9e9282] text-xs mb-1">
            <Zap className="h-3.5 w-3.5 text-[#38bdf8]" />
            <span>Execution Speed</span>
          </div>
          <p className="text-sm font-semibold text-[#f5efe6] font-mono">
            {lastLatencyMs ? `${lastLatencyMs} ms` : 'Standby'}
          </p>
          <p className="text-[10px] text-[#9e9282]">Last chunk CPU latency</p>
        </div>

        <div className="rounded-xl border border-[#202737] bg-[#0c0f16]/70 p-3">
          <div className="flex items-center gap-1.5 text-[#9e9282] text-xs mb-1">
            <Activity className="h-3.5 w-3.5 text-[#d4b996]" />
            <span>Tokens Ingested</span>
          </div>
          <p className="text-sm font-semibold text-[#f5efe6] font-mono">
            {totalTokensProcessed ? totalTokensProcessed.toLocaleString() : '0'}
          </p>
          <p className="text-[10px] text-[#9e9282]">Cumulative BPE tokens</p>
        </div>
      </div>
    </div>
  );
}
