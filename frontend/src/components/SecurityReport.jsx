import React, { useState } from 'react';
import {
  ShieldAlert,
  AlertOctagon,
  AlertTriangle,
  Info,
  Download,
  Printer,
  ChevronRight,
  ExternalLink,
  Flame,
  Clock,
  Layers
} from 'lucide-react';

export default function SecurityReport({ report, onSelectEvidence }) {
  const [selectedSeverity, setSelectedSeverity] = useState('ALL');

  if (!report) {
    return null;
  }

  const { summary, findings = [], timeline = [], attacker_summary = [] } = report;
  const breakdown = summary?.severity_breakdown || { Critical: 0, High: 0, Medium: 0, Low: 0 };

  const filteredFindings = selectedSeverity === 'ALL'
    ? findings
    : findings.filter(f => f.severity.toUpperCase() === selectedSeverity);

  const handleDownloadJson = () => {
    const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(report, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute('href', dataStr);
    downloadAnchor.setAttribute('download', `Security_Audit_Report_${Date.now()}.json`);
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
  };

  const handlePrint = () => {
    window.print();
  };

  return (
    <div className="space-y-6">
      {/* Executive Verdict Banner */}
      <div className={`rounded-2xl border p-6 shadow-2xl relative overflow-hidden transition-all ${
        breakdown.Critical > 0
          ? 'border-rose-500/40 bg-gradient-to-r from-[#1c1218]/90 via-[#11151e] to-[#0c1017] shadow-rose-950/20'
          : breakdown.High > 0
          ? 'border-orange-500/40 bg-gradient-to-r from-[#1d1510]/90 via-[#11151e] to-[#0c1017] shadow-orange-950/20'
          : 'border-sky-500/40 bg-gradient-to-r from-[#0d1624]/90 via-[#11151e] to-[#0c1017] shadow-sky-950/20'
      }`}>
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span className={`px-2.5 py-0.5 rounded text-[10px] font-bold tracking-wider uppercase font-mono ${
                breakdown.Critical > 0
                  ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                  : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
              }`}>
                EXECUTIVE SECURITY AUDIT REPORT
              </span>
              <span className="text-xs text-[#8896ab] font-mono">
                Generated {new Date(report.generated_at).toLocaleTimeString()}
              </span>
            </div>

            <h2 className="text-xl font-bold text-[#f5efe6] flex items-center gap-2">
              {breakdown.Critical > 0 && <Flame className="h-6 w-6 text-rose-400 animate-pulse" />}
              {summary?.overall_verdict || 'Analysis Complete'}
            </h2>

            <p className="text-xs text-[#b8ab99] max-w-3xl leading-relaxed">
              Analyzed all server log chunks with local AI models. Consolidated {findings.length} security incident(s) across {summary?.unique_attacker_ips || 0} unique hostile IP(s).
            </p>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2.5 shrink-0">
            <button
              onClick={handleDownloadJson}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#263248] bg-[#161c28] hover:bg-[#1e2738] text-xs font-semibold text-[#e5d7c3] transition-all hover:scale-[1.02] cursor-pointer shadow-sm"
            >
              <Download className="h-3.5 w-3.5 text-[#38bdf8]" />
              <span>Export JSON</span>
            </button>

            <button
              onClick={handlePrint}
              className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-[#263248] bg-[#161c28] hover:bg-[#1e2738] text-xs font-semibold text-[#e5d7c3] transition-all hover:scale-[1.02] cursor-pointer shadow-sm"
            >
              <Printer className="h-3.5 w-3.5 text-[#d4b996]" />
              <span>Print Audit</span>
            </button>
          </div>
        </div>
      </div>

      {/* Severity Breakdown Metric Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Critical */}
        <div
          onClick={() => setSelectedSeverity(selectedSeverity === 'CRITICAL' ? 'ALL' : 'CRITICAL')}
          className={`rounded-2xl border p-4 cursor-pointer transition-all ${
            selectedSeverity === 'CRITICAL'
              ? 'border-rose-500 bg-[#1f1319] ring-2 ring-rose-500/30'
              : 'border-[#1e2638] bg-[#11151e] hover:border-rose-500/40'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#8896ab] mb-1">
            <span className="font-semibold text-rose-400 flex items-center gap-1.5">
              <AlertOctagon className="h-4 w-4" />
              Critical
            </span>
            <span className="text-[10px] font-mono">Immediate Action</span>
          </div>
          <p className="text-2xl font-bold font-mono text-[#f5efe6]">{breakdown.Critical}</p>
          <p className="text-[10px] text-[#8896ab] mt-1">Account takeovers & exfiltration</p>
        </div>

        {/* High */}
        <div
          onClick={() => setSelectedSeverity(selectedSeverity === 'HIGH' ? 'ALL' : 'HIGH')}
          className={`rounded-2xl border p-4 cursor-pointer transition-all ${
            selectedSeverity === 'HIGH'
              ? 'border-orange-500 bg-[#1e1511] ring-2 ring-orange-500/30'
              : 'border-[#1e2638] bg-[#11151e] hover:border-orange-500/40'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#8896ab] mb-1">
            <span className="font-semibold text-orange-400 flex items-center gap-1.5">
              <ShieldAlert className="h-4 w-4" />
              High
            </span>
            <span className="text-[10px] font-mono">Direct Exploits</span>
          </div>
          <p className="text-2xl font-bold font-mono text-[#f5efe6]">{breakdown.High}</p>
          <p className="text-[10px] text-[#8896ab] mt-1">SQLi & directory traversal</p>
        </div>

        {/* Medium */}
        <div
          onClick={() => setSelectedSeverity(selectedSeverity === 'MEDIUM' ? 'ALL' : 'MEDIUM')}
          className={`rounded-2xl border p-4 cursor-pointer transition-all ${
            selectedSeverity === 'MEDIUM'
              ? 'border-[#d4b996] bg-[#1a1715] ring-2 ring-[#d4b996]/30'
              : 'border-[#1e2638] bg-[#11151e] hover:border-[#d4b996]/40'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#8896ab] mb-1">
            <span className="font-semibold text-[#d4b996] flex items-center gap-1.5">
              <AlertTriangle className="h-4 w-4" />
              Medium
            </span>
            <span className="text-[10px] font-mono">Recon / Probes</span>
          </div>
          <p className="text-2xl font-bold font-mono text-[#f5efe6]">{breakdown.Medium}</p>
          <p className="text-[10px] text-[#8896ab] mt-1">Brute force & scanners</p>
        </div>

        {/* Low */}
        <div
          onClick={() => setSelectedSeverity(selectedSeverity === 'LOW' ? 'ALL' : 'LOW')}
          className={`rounded-2xl border p-4 cursor-pointer transition-all ${
            selectedSeverity === 'LOW'
              ? 'border-sky-500 bg-[#0d1624] ring-2 ring-sky-500/30'
              : 'border-[#1e2638] bg-[#11151e] hover:border-sky-500/40'
          }`}
        >
          <div className="flex items-center justify-between text-xs text-[#8896ab] mb-1">
            <span className="font-semibold text-[#38bdf8] flex items-center gap-1.5">
              <Info className="h-4 w-4" />
              Low
            </span>
            <span className="text-[10px] font-mono">Informational</span>
          </div>
          <p className="text-2xl font-bold font-mono text-[#f5efe6]">{breakdown.Low}</p>
          <p className="text-[10px] text-[#8896ab] mt-1">Anomalous requests</p>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center justify-between border-b border-[#1e2638] pb-2">
        <div className="flex items-center gap-2">
          {['ALL', 'CRITICAL', 'HIGH', 'MEDIUM', 'LOW'].map((tab) => (
            <button
              key={tab}
              onClick={() => setSelectedSeverity(tab)}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer font-mono ${
                selectedSeverity === tab
                  ? 'bg-[#1e2638] text-[#f5efe6] shadow-sm border border-[#2e3d57]'
                  : 'text-[#8896ab] hover:text-[#f5efe6] hover:bg-[#141a26]'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <span className="text-xs text-[#8896ab] font-mono">
          Showing {filteredFindings.length} of {findings.length} findings
        </span>
      </div>

      {/* Consolidated Finding Cards */}
      <div className="space-y-4">
        {filteredFindings.map((finding, idx) => (
          <div
            key={idx}
            className={`rounded-2xl border p-5 transition-all hover:border-[#2d3a52] bg-[#11151e] backdrop-blur-sm space-y-3.5 ${
              finding.severity === 'Critical'
                ? 'border-rose-500/30 bg-gradient-to-r from-[#1c1218]/40 via-[#11151e] to-[#11151e]'
                : finding.severity === 'High'
                ? 'border-orange-500/30 bg-gradient-to-r from-[#1c1510]/40 via-[#11151e] to-[#11151e]'
                : 'border-[#1e2638]'
            }`}
          >
            {/* Top Row: Attack Type, Severity, Attacker IP */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2.5">
                <span className={`px-2.5 py-1 rounded-md text-xs font-bold uppercase tracking-wider font-mono ${
                  finding.severity === 'Critical'
                    ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30'
                    : finding.severity === 'High'
                    ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30'
                    : finding.severity === 'Medium'
                    ? 'bg-[#d4b996]/15 text-[#e5d7c3] border border-[#d4b996]/30'
                    : 'bg-sky-500/15 text-sky-300 border border-sky-500/30'
                }`}>
                  {finding.severity}
                </span>

                <h3 className="text-base font-bold text-[#f5efe6]">{finding.attack_type}</h3>

                {finding.isCorrelatedMultiStage && (
                  <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-violet-500/15 text-violet-300 border border-violet-500/30 flex items-center gap-1 font-mono">
                    <Layers className="h-3 w-3" />
                    Cross-Chunk Correlated
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2 font-mono text-xs">
                <span className="text-[#8896ab]">Attacker IP:</span>
                <span className="px-2 py-0.5 rounded bg-[#090c10] border border-[#222d42] text-[#7dd3fc] font-bold">
                  {finding.target_or_attacker_id}
                </span>
              </div>
            </div>

            {/* Middle Row: Reason */}
            <p className="text-xs text-[#c5bcaf] leading-relaxed">
              {finding.reason}
            </p>

            {/* Evidence Line Numbers & Inspector */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[#1a2232]">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-[#8896ab] font-semibold mr-1">
                  Evidence ({finding.evidence_lines?.length || 0} lines):
                </span>
                {(finding.evidence_lines || []).slice(0, 10).map((line) => (
                  <button
                    key={line}
                    onClick={() => onSelectEvidence(finding)}
                    className="px-2 py-0.5 rounded bg-[#161d2b] hover:bg-[#202c40] border border-[#25334a] text-[#7dd3fc] font-mono text-[11px] transition-colors cursor-pointer"
                  >
                    Line {line}
                  </button>
                ))}
                {(finding.evidence_lines?.length || 0) > 10 && (
                  <span className="text-[11px] text-[#8896ab] font-mono">
                    +{finding.evidence_lines.length - 10} more
                  </span>
                )}
              </div>

              <button
                onClick={() => onSelectEvidence(finding)}
                className="flex items-center gap-1 text-xs text-[#d4b996] hover:text-[#f5efe6] font-semibold transition-colors cursor-pointer"
              >
                <span>Inspect Evidence Details</span>
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Suggested Action Box */}
            <div className="rounded-xl border border-[#263a52] bg-[#0d131f] p-3 flex items-start gap-2.5">
              <span className="text-xs font-bold uppercase tracking-wider text-[#38bdf8] shrink-0 font-mono">
                Action:
              </span>
              <p className="text-xs text-[#d8cdbe] leading-relaxed">
                {finding.suggested_action}
              </p>
            </div>
          </div>
        ))}
      </div>

      {/* Chronological Attack Timeline */}
      {timeline.length > 0 && (
        <div className="rounded-2xl border border-[#1e2638] bg-[#11151e] p-6 backdrop-blur-sm shadow-xl space-y-4">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#38bdf8]" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-[#d4b996] font-mono">
              Chronological Incident Timeline (Start to Finish)
            </h3>
          </div>

          <div className="relative border-l-2 border-[#1e2638] ml-3 pl-6 space-y-6">
            {timeline.map((evt, idx) => (
              <div key={idx} className="relative group">
                {/* Dot */}
                <div className={`absolute -left-[31px] top-1 h-3.5 w-3.5 rounded-full border-2 border-[#11151e] ${
                  evt.severity === 'Critical' ? 'bg-rose-500 ring-4 ring-rose-500/20' :
                  evt.severity === 'High' ? 'bg-orange-500 ring-4 ring-orange-500/20' :
                  evt.severity === 'Medium' ? 'bg-[#d4b996]' : 'bg-[#38bdf8]'
                }`} />

                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-mono text-xs font-bold text-[#38bdf8]">
                      {evt.line_range}
                    </span>
                    <span className="text-[#8896ab]">•</span>
                    <span className="text-xs font-bold text-[#f5efe6]">
                      {evt.attack_type}
                    </span>
                    <span className="text-[#8896ab]">•</span>
                    <span className="font-mono text-xs text-[#8896ab]">
                      IP: {evt.ip}
                    </span>
                  </div>
                  <p className="text-xs text-[#c5bcaf]">{evt.summary}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
