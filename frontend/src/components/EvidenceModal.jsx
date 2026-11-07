import React from 'react';
import { X, FileCode, Copy, Check } from 'lucide-react';

export default function EvidenceModal({ finding, onClose }) {
  const [copied, setCopied] = React.useState(false);

  if (!finding) return null;

  const lines = finding.evidence_lines || [];

  const handleCopy = () => {
    const text = `Attack: ${finding.attack_type}\nAttacker IP: ${finding.target_or_attacker_id}\nEvidence Lines: ${lines.join(', ')}\nReason: ${finding.reason}\nAction: ${finding.suggested_action}`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div
        className="w-full max-w-2xl rounded-2xl border border-[#263248] bg-[#0e121a] p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-start justify-between border-b border-[#1e2638] pb-3">
          <div>
            <div className="flex items-center gap-2">
              <FileCode className="h-5 w-5 text-[#38bdf8]" />
              <h3 className="text-base font-bold text-[#f5efe6]">Evidence Inspector</h3>
              <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase font-mono ${
                finding.severity === 'Critical' ? 'bg-rose-500/15 text-rose-300 border border-rose-500/30' :
                finding.severity === 'High' ? 'bg-orange-500/15 text-orange-300 border border-orange-500/30' :
                finding.severity === 'Medium' ? 'bg-[#d4b996]/15 text-[#e5d7c3] border border-[#d4b996]/30' :
                'bg-sky-500/15 text-sky-300 border border-sky-500/30'
              }`}>
                {finding.severity}
              </span>
            </div>
            <p className="text-xs text-[#8896ab] mt-1">
              {finding.attack_type} • Attacker: <span className="font-mono text-[#7dd3fc] font-bold">{finding.target_or_attacker_id}</span>
            </p>
          </div>

          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#8896ab] hover:text-[#f5efe6] hover:bg-[#161c28] transition-colors cursor-pointer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Content */}
        <div className="space-y-3.5 overflow-y-auto pr-1 flex-1">
          <div>
            <h4 className="text-xs font-semibold text-[#d4b996] mb-1.5 font-mono">CITED EVIDENCE LINE NUMBERS ({lines.length}):</h4>
            <div className="flex flex-wrap gap-1.5 font-mono text-xs">
              {lines.map((l) => (
                <span
                  key={l}
                  className="px-2 py-1 rounded-md bg-[#161d2a] border border-[#26354c] text-[#7dd3fc] font-semibold"
                >
                  Line {l}
                </span>
              ))}
            </div>
          </div>

          <div className="rounded-xl border border-[#1e2638] bg-[#090c11] p-3.5 space-y-1.5">
            <h4 className="text-xs font-semibold text-[#8896ab] font-mono">INCIDENT EXPLANATION:</h4>
            <p className="text-xs text-[#c5bcaf] leading-relaxed">{finding.reason}</p>
          </div>

          <div className="rounded-xl border border-[#263a52] bg-[#0d131f] p-3.5 space-y-1.5">
            <h4 className="text-xs font-semibold text-[#38bdf8] font-mono">RECOMMENDED ACTION:</h4>
            <p className="text-xs text-[#d8cdbe] leading-relaxed">{finding.suggested_action}</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-between items-center border-t border-[#1e2638] pt-3">
          <button
            onClick={handleCopy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[#263248] bg-[#161d2a] hover:bg-[#202b3c] text-xs text-[#e5d7c3] transition-colors cursor-pointer font-mono"
          >
            {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5 text-[#8896ab]" />}
            <span>{copied ? 'Copied Details' : 'Copy Incident Summary'}</span>
          </button>

          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#d4b996] hover:bg-[#e2cbaf] text-xs font-bold text-[#0a0c10] transition-colors cursor-pointer font-mono"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
