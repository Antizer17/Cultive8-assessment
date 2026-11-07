import React from 'react';
import { Cpu, Clock, Layers, ShieldAlert, CheckCircle, RefreshCw } from 'lucide-react';

export default function ProgressTracker({ progress, job, onResume, isResuming }) {
  const currentChunk = progress?.chunkIndex || job?.completedChunks || 0;
  const totalChunks = progress?.totalChunks || job?.totalChunks || 1;
  const percent = progress?.percentComplete ?? Math.round((currentChunk / totalChunks) * 100);
  const startLine = progress?.startLine || 1;
  const endLine = progress?.endLine || 1;
  const tokensInChunk = progress?.tokensInChunk || 0;
  const latencyMs = progress?.latencyMs || 0;
  const modelUsed = progress?.modelUsed || job?.model || 'qwen2.5:1.5b';
  const findingsCount = progress?.findingsInChunk || job?.rawFindings?.length || 0;

  // Token budget calculations for current chunk
  const systemPromptTokens = 250;
  const stateMemoryTokens = 60;
  const logTokens = tokensInChunk || 850;
  const outputReserveTokens = 498;
  const totalContextUsed = systemPromptTokens + stateMemoryTokens + logTokens + outputReserveTokens;

  return (
    <div className="rounded-2xl border border-[#202737] bg-[#11151e]/85 p-6 backdrop-blur-sm shadow-xl space-y-6">
      {/* Header & Status */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-bold text-[#f5efe6] flex items-center gap-2">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#38bdf8] opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#38bdf8]"></span>
              </span>
              Analyzing: {job?.filename || 'Server Logs'}
            </h2>
            <span className="text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-[#0284c7]/15 text-[#7dd3fc] border border-[#0284c7]/30">
              Chunk-by-Chunk Queue
            </span>
          </div>
          <p className="text-xs text-[#9e9282] mt-1">
            Lines {startLine} – {endLine} currently under inspection by local AI model
          </p>
        </div>

        {/* Engine Badge & Resume */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg border border-[#232b3b] bg-[#12161f] text-xs text-[#d8cdbe] font-mono">
            <Cpu className="h-3.5 w-3.5 text-[#38bdf8]" />
            <span>{modelUsed}</span>
          </div>

          {job?.status === 'PAUSED' || job?.status === 'FAILED' ? (
            <button
              onClick={onResume}
              disabled={isResuming}
              className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-gradient-to-r from-[#d4b996] to-[#38bdf8] hover:opacity-95 text-[#0a0c10] font-bold text-xs shadow transition-all cursor-pointer"
            >
              <RefreshCw className={`h-3 w-3 ${isResuming ? 'animate-spin' : ''}`} />
              <span>Resume Analysis</span>
            </button>
          ) : null}
        </div>
      </div>

      {/* Main Progress Bar */}
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs font-semibold">
          <span className="text-[#d8cdbe]">
            Chunk {currentChunk} of {totalChunks} completed
          </span>
          <span className="font-mono text-[#38bdf8] font-bold">{percent}%</span>
        </div>

        <div className="h-3.5 w-full rounded-full bg-[#161c28] overflow-hidden border border-[#273245] p-0.5">
          <div
            style={{ width: `${percent}%` }}
            className="h-full rounded-full bg-gradient-to-r from-[#0284c7] via-[#38bdf8] to-[#d4b996] transition-all duration-300 shadow-md shadow-sky-950/40"
          />
        </div>
      </div>

      {/* Live Operational Metric Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="rounded-xl border border-[#202737] bg-[#0c0f16]/70 p-3">
          <div className="flex items-center gap-1.5 text-[#9e9282] text-xs mb-1">
            <Layers className="h-3.5 w-3.5 text-[#38bdf8]" />
            <span>Current Slice</span>
          </div>
          <p className="text-sm font-semibold text-[#f5efe6] font-mono">
            Lines {startLine}–{endLine}
          </p>
          <p className="text-[10px] text-[#9e9282]">{endLine - startLine + 1} lines in chunk</p>
        </div>

        <div className="rounded-xl border border-[#202737] bg-[#0c0f16]/70 p-3">
          <div className="flex items-center gap-1.5 text-[#9e9282] text-xs mb-1">
            <Clock className="h-3.5 w-3.5 text-[#d4b996]" />
            <span>Chunk Latency</span>
          </div>
          <p className="text-sm font-semibold text-[#f5efe6] font-mono">
            {latencyMs ? `${latencyMs} ms` : 'Measuring...'}
          </p>
          <p className="text-[10px] text-[#9e9282]">Pure 2 vCPU execution</p>
        </div>

        <div className="rounded-xl border border-[#202737] bg-[#0c0f16]/70 p-3">
          <div className="flex items-center gap-1.5 text-[#9e9282] text-xs mb-1">
            <ShieldAlert className="h-3.5 w-3.5 text-rose-400" />
            <span>Findings in Slice</span>
          </div>
          <p className="text-sm font-semibold text-[#f5efe6] font-mono">
            {findingsCount} {findingsCount === 1 ? 'threat' : 'threats'}
          </p>
          <p className="text-[10px] text-[#9e9282]">Detected in active chunk</p>
        </div>

        <div className="rounded-xl border border-[#202737] bg-[#0c0f16]/70 p-3">
          <div className="flex items-center gap-1.5 text-[#9e9282] text-xs mb-1">
            <CheckCircle className="h-3.5 w-3.5 text-[#38bdf8]" />
            <span>Tokens in Chunk</span>
          </div>
          <p className="text-sm font-semibold text-[#f5efe6] font-mono">
            {tokensInChunk} / 950
          </p>
          <p className="text-[10px] text-[#9e9282]">Strictly &le; 950 token budget</p>
        </div>
      </div>

      {/* Visual Token Budget Gauge for Current Chunk */}
      <div className="rounded-xl border border-[#202737] bg-[#0c0f16]/70 p-4 space-y-3">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-[#d8cdbe] flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-full bg-[#38bdf8]" />
            Context Window Allocation (Strict 2,048 Ceiling)
          </span>
          <span className="font-mono text-[#9e9282]">
            {totalContextUsed} / 2,048 tokens used
          </span>
        </div>

        {/* Stacked Token Allocation Bar */}
        <div className="h-3 w-full rounded-full bg-[#161c28] overflow-hidden flex border border-[#273245]">
          {/* System Prompt (Blue) */}
          <div
            style={{ width: `${(systemPromptTokens / 2048) * 100}%` }}
            className="bg-[#0284c7] transition-all"
            title={`System Prompt: ${systemPromptTokens} tokens`}
          />
          {/* Carried State (Warm Beige) */}
          <div
            style={{ width: `${(stateMemoryTokens / 2048) * 100}%` }}
            className="bg-[#d4b996] transition-all"
            title={`Prior State Memory: ${stateMemoryTokens} tokens`}
          />
          {/* Log Chunk Text (Ice Blue) */}
          <div
            style={{ width: `${(logTokens / 2048) * 100}%` }}
            className="bg-[#38bdf8] transition-all"
            title={`Log Lines: ${logTokens} tokens`}
          />
          {/* Output Reserve (Muted Slate) */}
          <div
            style={{ width: `${(outputReserveTokens / 2048) * 100}%` }}
            className="bg-[#334155] transition-all"
            title={`Model Output Reserve: ${outputReserveTokens} tokens`}
          />
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] font-mono text-[#9e9282]">
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-[#0284c7]" /> System Prompt (250)
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-[#d4b996]" /> Prior State (60)
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-[#38bdf8]" /> Log Slice ({logTokens})
          </span>
          <span className="flex items-center gap-1">
            <span className="h-2 w-2 rounded-sm bg-[#334155]" /> Output Reserve (498)
          </span>
        </div>
      </div>
    </div>
  );
}
