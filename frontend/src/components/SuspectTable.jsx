import React from 'react';
import { Eye, ShieldAlert, AlertOctagon, Skull } from 'lucide-react';

export default function SuspectTable({ suspects = {} }) {
  const suspectList = Object.values(suspects);

  if (suspectList.length === 0) {
    return (
      <div className="rounded-2xl border border-[#202737] bg-[#11151e]/60 p-5 text-center text-xs text-[#9e9282]">
        <Eye className="h-6 w-6 mx-auto mb-2 text-[#9e9282]/50" />
        No suspicious IP entities flagged in working memory yet.
      </div>
    );
  }

  // Sort: Compromised first, then by failed logins
  suspectList.sort((a, b) => {
    if (a.isCompromised) return -1;
    if (b.isCompromised) return 1;
    return (b.failedLogins || 0) - (a.failedLogins || 0);
  });

  return (
    <div className="rounded-2xl border border-[#202737] bg-[#11151e]/85 p-5 backdrop-blur-sm shadow-xl space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShieldAlert className="h-4 w-4 text-[#d4b996]" />
          <h2 className="text-sm font-semibold uppercase tracking-wider text-[#d8cdbe]">
            Cross-Chunk Working Memory (Active Suspect Entities)
          </h2>
        </div>
        <span className="text-xs font-mono text-[#9e9282]">
          {suspectList.length} entity tracked
        </span>
      </div>

      <p className="text-xs text-[#9e9282]">
        These facts are carried across chunk boundaries into subsequent model prompts to detect multi-stage distributed attacks.
      </p>

      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs border-collapse">
          <thead>
            <tr className="border-b border-[#202737] text-[#9e9282] font-semibold">
              <th className="py-2.5 px-3">Suspect IP</th>
              <th className="py-2.5 px-3">Current Threat Status</th>
              <th className="py-2.5 px-3">Failed Logins</th>
              <th className="py-2.5 px-3">Targeted Account</th>
              <th className="py-2.5 px-3">Attack Signals</th>
              <th className="py-2.5 px-3">Line Range</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#202737]/60 font-mono">
            {suspectList.map((s) => (
              <tr
                key={s.ip}
                className={`transition-colors ${
                  s.isCompromised
                    ? 'bg-[#3b1219]/25 hover:bg-[#3b1219]/40'
                    : s.failedLogins >= 3
                    ? 'bg-[#2b1f14]/25 hover:bg-[#2b1f14]/40'
                    : 'hover:bg-[#161c28]/60'
                }`}
              >
                {/* IP */}
                <td className="py-3 px-3 font-bold text-[#f5efe6] flex items-center gap-2">
                  {s.isCompromised && <Skull className="h-4 w-4 text-rose-400 animate-pulse" />}
                  <span>{s.ip}</span>
                </td>

                {/* Threat Status Badge */}
                <td className="py-3 px-3">
                  {s.isCompromised ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-rose-500/20 text-rose-300 border border-rose-500/30 animate-pulse">
                      <AlertOctagon className="h-3 w-3" />
                      ACCOUNT COMPROMISED
                    </span>
                  ) : s.failedLogins >= 3 ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-[#d4b996]/20 text-[#e5d7c3] border border-[#d4b996]/30">
                      BRUTE FORCE WATCH
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-medium bg-[#161d2a] text-[#93c5fd] border border-[#27344a]">
                      SUSPICIOUS PROBING
                    </span>
                  )}
                </td>

                {/* Failed Logins */}
                <td className="py-3 px-3">
                  {s.failedLogins > 0 ? (
                    <span className="font-bold text-[#d4b996]">
                      {s.failedLogins} failures
                    </span>
                  ) : (
                    <span className="text-[#9e9282]/60">0</span>
                  )}
                </td>

                {/* Targeted Account */}
                <td className="py-3 px-3">
                  {s.targetedUsernames && s.targetedUsernames.length > 0 ? (
                    <span className="px-1.5 py-0.5 rounded bg-[#161c28] text-[#38bdf8] text-[11px] border border-[#252f42]">
                      {s.targetedUsernames.join(', ')}
                    </span>
                  ) : (
                    <span className="text-[#9e9282]/50">None</span>
                  )}
                </td>

                {/* Attack Signals */}
                <td className="py-3 px-3">
                  <div className="flex flex-wrap gap-1">
                    {s.sqliCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-[#0c1829] text-[#38bdf8] text-[10px] border border-[#1b3a5e]">
                        SQLi ({s.sqliCount})
                      </span>
                    )}
                    {s.traversalCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-[#1e1710] text-[#d4b996] text-[10px] border border-[#3b2d1d]">
                        Traversal ({s.traversalCount})
                      </span>
                    )}
                    {s.exfiltrationCount > 0 && (
                      <span className="px-1.5 py-0.5 rounded bg-rose-950/60 text-rose-300 text-[10px] border border-rose-800/40 font-bold">
                        Exfil ({s.exfiltrationCount})
                      </span>
                    )}
                    {s.sqliCount === 0 && s.traversalCount === 0 && s.exfiltrationCount === 0 && (
                      <span className="text-[#9e9282]/50 text-[11px]">Probing only</span>
                    )}
                  </div>
                </td>

                {/* First and Last Seen Line */}
                <td className="py-3 px-3 text-[#9e9282]">
                  {s.firstSeenLine && s.lastSeenLine ? (
                    <span>
                      Lines {s.firstSeenLine}–{s.lastSeenLine}
                    </span>
                  ) : (
                    <span>Line {s.firstSeenLine || 'N/A'}</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
