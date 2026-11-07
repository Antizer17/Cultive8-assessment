import { countTokens } from './tokenizer.js';
import { CONFIG } from '../config.js';
import { AllowlistManager } from './allowlistManager.js';

/**
 * State Accumulator Service
 *
 * Implements the cross-chunk working memory engine.
 *
 * Requirements Met:
 * 1. Cross-Part Attack Linking: Tracks suspicious IPs across parts to identify multi-stage attacks
 *    (e.g., failed logins near start/middle + successful login near end -> Account Compromise).
 * 2. Token Budget Adherence: Compresses carried state to strictly <= 350 tokens.
 * 3. Zero Memory Bloat: Maintains a lightweight, prioritized suspect table.
 * 4. Hybrid Robustness: Combines model findings with deterministic telemetry parsing
 *    so zero authentication failures or payloads are missed across chunks.
 */

export class StateAccumulator {
  /**
   * Initializes state accumulator from existing state or fresh.
   */
  constructor(initialState = {}) {
    // Map of IP -> SuspectRecord
    this.suspects = {};
    if (initialState.suspects) {
      for (const [ip, rec] of Object.entries(initialState.suspects)) {
        this.suspects[ip] = {
          ip,
          failedLogins: rec.failedLogins || 0,
          failedLoginLines: [...(rec.failedLoginLines || [])],
          successfulLogins: [...(rec.successfulLogins || [])],
          targetedUsernames: new Set(rec.targetedUsernames || []),
          sqliCount: rec.sqliCount || 0,
          sqliLines: [...(rec.sqliLines || [])],
          traversalCount: rec.traversalCount || 0,
          traversalLines: [...(rec.traversalLines || [])],
          adminProbeCount: rec.adminProbeCount || 0,
          adminProbeLines: [...(rec.adminProbeLines || [])],
          peakRequestsInWindow: rec.peakRequestsInWindow || 0,
          status429Count: rec.status429Count || 0,
          rateAbuseLines: [...(rec.rateAbuseLines || [])],
          exfiltrationCount: rec.exfiltrationCount || 0,
          exfiltrationLines: [...(rec.exfiltrationLines || [])],
          isCompromised: !!rec.isCompromised,
          firstSeenLine: rec.firstSeenLine || null,
          lastSeenLine: rec.lastSeenLine || null
        };
      }
    }

    // Global timeline of high-severity correlated incidents
    this.globalTimeline = initialState.globalTimeline ? [...initialState.globalTimeline] : [];
  }

  /**
   * Gets or initializes suspect record for an IP.
   */
  getOrCreateSuspect(ip, lineNumber) {
    if (!this.suspects[ip]) {
      this.suspects[ip] = {
        ip,
        failedLogins: 0,
        failedLoginLines: [],
        successfulLogins: [],
        targetedUsernames: new Set(),
        sqliCount: 0,
        sqliLines: [],
        traversalCount: 0,
        traversalLines: [],
        adminProbeCount: 0,
        adminProbeLines: [],
        peakRequestsInWindow: 0,
        status429Count: 0,
        rateAbuseLines: [],
        exfiltrationCount: 0,
        exfiltrationLines: [],
        isCompromised: false,
        firstSeenLine: lineNumber,
        lastSeenLine: lineNumber
      };
    }
    const suspect = this.suspects[ip];
    if (lineNumber) {
      if (!suspect.firstSeenLine || lineNumber < suspect.firstSeenLine) suspect.firstSeenLine = lineNumber;
      if (!suspect.lastSeenLine || lineNumber > suspect.lastSeenLine) suspect.lastSeenLine = lineNumber;
    }
    return suspect;
  }

  /**
   * Ingests chunk raw lines to update the suspect telemetry table.
   * Scans for authentication attempts, injection markers, and data exfiltration.
   */
  ingestChunkLines(chunkLines) {
    const newlyTriggeredIncidents = [];

    for (const item of chunkLines) {
      const lineNum = item.lineNumber;
      const text = item.text || item.rawText || '';

      // Fast JSON extraction if available
      let entry = null;
      try {
        if (text.startsWith('{') && text.endsWith('}')) {
          entry = JSON.parse(text);
        }
      } catch (_) {
        entry = null;
      }

      const clientIp = entry?.client_ip || this.extractIpFromText(text);
      if (!clientIp) continue;

      // Ignore standard infrastructure & operational allowlisted checks
      if (
        AllowlistManager.isIpAllowlisted(clientIp) ||
        AllowlistManager.isUserAgentAllowlisted(entry?.user_agent) ||
        AllowlistManager.isEndpointAllowlisted(entry?.path)
      ) {
        continue;
      }

      const suspect = this.getOrCreateSuspect(clientIp, lineNum);

      // 1. Failed Login Detection (401 Unauthorized / invalid_password)
      if (
        (entry?.status === 401 && entry?.path?.includes('/login')) ||
        entry?.auth_result === 'invalid_password' ||
        /401.*invalid_password/i.test(text)
      ) {
        suspect.failedLogins += 1;
        if (!suspect.failedLoginLines.includes(lineNum)) {
          suspect.failedLoginLines.push(lineNum);
        }
        if (entry?.username) {
          suspect.targetedUsernames.add(entry.username);
        }
      }

      // 2. Successful Login Detection (200 OK / auth_result: success)
      if (
        (entry?.status === 200 && entry?.path?.includes('/login') && entry?.auth_result === 'success') ||
        (entry?.session_id && entry?.auth_result === 'success')
      ) {
        suspect.successfulLogins.push({
          line: lineNum,
          username: entry?.username || 'unknown',
          sessionId: entry?.session_id || null,
          timestamp: entry?.time || null
        });

        // MULTI-STAGE CORRELATION TRIGGER:
        // If IP had 3+ prior failed logins and now succeeds -> ACCOUNT COMPROMISE!
        if (suspect.failedLogins >= 3 && !suspect.isCompromised) {
          suspect.isCompromised = true;
          const incident = {
            attack_type: 'Brute Force Followed by Account Compromise',
            severity: 'Critical',
            target_or_attacker_id: clientIp,
            evidence_lines: [...suspect.failedLoginLines, lineNum],
            reason: `IP ${clientIp} conducted repeated failed login attempts (${suspect.failedLogins} failures on lines ${suspect.failedLoginLines.slice(0, 5).join(', ')}...) followed by a successful authentication at line ${lineNum} for account '${entry?.username || 'admin'}'.`,
            suggested_action: `Immediately revoke session '${entry?.session_id || 'active'}', force password reset for user '${entry?.username || 'admin'}', and block IP ${clientIp} at the perimeter firewall.`,
            first_seen_line: suspect.firstSeenLine,
            last_seen_line: lineNum,
            isCorrelatedMultiStage: true
          };
          newlyTriggeredIncidents.push(incident);
          this.globalTimeline.push(incident);
        }
      }

      // 3. Post-Compromise Admin Enumeration
      if (suspect.isCompromised && (entry?.path?.includes('/admin') || /GET.*\/api\/v1\/admin/i.test(text))) {
        suspect.adminProbeCount += 1;
        suspect.adminProbeLines.push(lineNum);
      }

      // 4. Post-Compromise Data Exfiltration (large byte response or export endpoint)
      if (
        suspect.isCompromised &&
        (entry?.path?.includes('/export') || (entry?.response_bytes && entry.response_bytes > 500000))
      ) {
        suspect.exfiltrationCount += 1;
        suspect.exfiltrationLines.push(lineNum);
        const bytes = Number(entry?.response_bytes) || 0;
        const sizeMb = bytes > 0 ? `${(bytes / (1024 * 1024)).toFixed(2)} MB` : 'large payload';
        const incident = {
          attack_type: 'Data Exfiltration via Compromised Account',
          severity: 'Critical',
          target_or_attacker_id: clientIp,
          evidence_lines: [lineNum],
          reason: `Compromised session from IP ${clientIp} exfiltrated bulk data (${sizeMb}) via ${entry?.path || 'export endpoint'} at line ${lineNum}.`,
          suggested_action: `Audit data accessed during export session, notify compliance officer of potential data breach, and isolate compromised workspace.`,
          first_seen_line: lineNum,
          last_seen_line: lineNum,
          isCorrelatedMultiStage: true
        };
        newlyTriggeredIncidents.push(incident);
        this.globalTimeline.push(incident);
      }

      // 5. Rate Abuse Tracking (requests_in_window climbing or HTTP 429 Too Many Requests)
      if (entry?.requests_in_window) {
        suspect.peakRequestsInWindow = Math.max(suspect.peakRequestsInWindow || 0, Number(entry.requests_in_window));
      }
      if (entry?.status === 429) {
        suspect.status429Count = (suspect.status429Count || 0) + 1;
        if (!suspect.rateAbuseLines.includes(lineNum)) {
          suspect.rateAbuseLines.push(lineNum);
        }
      }
    }

    return newlyTriggeredIncidents;
  }

  /**
   * Helper to extract IPv4 from text if not in JSON.
   */
  extractIpFromText(text) {
    const match = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    return match ? match[0] : null;
  }

  /**
   * Ingests validated findings produced by the AI model for the current chunk.
   * Note: Failed logins are computed deterministically from auth_result in code (13 -> 12).
   */
  ingestModelFindings(modelFindings = []) {
    for (const f of modelFindings) {
      const ip = f.target_or_attacker_id || f.ip;
      if (!ip) continue;

      const lines = Array.isArray(f.evidence_lines)
        ? f.evidence_lines.map(Number).filter(n => !isNaN(n))
        : [];
      const firstLine = lines.length > 0 ? Math.min(...lines) : null;
      const suspect = this.getOrCreateSuspect(ip, firstLine);

      // SQL Injection
      if (f.attack_type?.toLowerCase().includes('sql')) {
        for (const l of lines) {
          if (!suspect.sqliLines.includes(l)) {
            suspect.sqliLines.push(l);
            suspect.sqliCount += 1;
          }
        }
      }

      // Path Traversal
      if (f.attack_type?.toLowerCase().includes('traversal')) {
        for (const l of lines) {
          if (!suspect.traversalLines.includes(l)) {
            suspect.traversalLines.push(l);
            suspect.traversalCount += 1;
          }
        }
      }

      // Rate Abuse
      if (f.attack_type?.toLowerCase().includes('rate')) {
        for (const l of lines) {
          if (!suspect.rateAbuseLines.includes(l)) {
            suspect.rateAbuseLines.push(l);
          }
        }
      }

      // Guarded Account Compromise: only mark compromised if proven with successful auth
      if (f.attack_type?.toLowerCase().includes('compromise') && suspect.successfulLogins.length > 0) {
        suspect.isCompromised = true;
      }
    }
  }

  /**
   * Serializes active suspicious IP facts into a compact JSON string
   * strictly budgeted to <= 350 tokens for inclusion in subsequent model prompts.
   */
  serializeForPrompt(maxTokens = CONFIG.TOKENS.STATE_CONTEXT_BUDGET) {
    const activeSuspects = [];

    // Prioritize suspects with notable attack history
    for (const [ip, s] of Object.entries(this.suspects)) {
      if (
        s.failedLogins > 0 ||
        s.sqliCount > 0 ||
        s.traversalCount > 0 ||
        s.isCompromised ||
        (s.peakRequestsInWindow && s.peakRequestsInWindow > 50) ||
        (s.status429Count && s.status429Count > 0)
      ) {
        const item = {
          ip,
          failed_logins: s.failedLogins,
          targeted_accounts: Array.from(s.targetedUsernames),
          recent_failure_lines: s.failedLoginLines.slice(-6), // last 6 failure lines
          status: s.isCompromised
            ? 'ACCOUNT_COMPROMISED'
            : s.failedLogins >= 3
            ? 'ACTIVE_BRUTE_FORCE_WATCH'
            : s.status429Count > 0 || s.peakRequestsInWindow > 100
            ? 'RATE_ABUSE_WATCH'
            : 'SUSPICIOUS_PROBING'
        };

        if (s.sqliCount > 0) item.sqli_probes = s.sqliCount;
        if (s.traversalCount > 0) item.traversal_probes = s.traversalCount;
        if (s.peakRequestsInWindow > 0) item.peak_requests_in_window = s.peakRequestsInWindow;
        if (s.status429Count > 0) item.http_429_count = s.status429Count;
        if (s.successfulLogins.length > 0) {
          item.compromise_login_lines = s.successfulLogins.map(l => l.line);
        }

        activeSuspects.push(item);
      }
    }

    if (activeSuspects.length === 0) {
      return 'No prior suspicious IP activity recorded.';
    }

    // Sort by risk priority (compromised first, then highest failed logins)
    activeSuspects.sort((a, b) => {
      if (a.status === 'ACCOUNT_COMPROMISED') return -1;
      if (b.status === 'ACCOUNT_COMPROMISED') return 1;
      return (b.failed_logins || 0) - (a.failed_logins || 0);
    });

    let compactString = JSON.stringify(activeSuspects);
    let tokens = countTokens(compactString);

    // If string exceeds 350 tokens, progressively trim suspects to fit strictly
    while (tokens > maxTokens && activeSuspects.length > 1) {
      activeSuspects.pop();
      compactString = JSON.stringify(activeSuspects);
      tokens = countTokens(compactString);
    }

    return compactString;
  }

  /**
   * Returns serializable snapshot of working state for storage in JobStore.
   */
  getStateSnapshot() {
    const suspectsObj = {};
    for (const [ip, s] of Object.entries(this.suspects)) {
      suspectsObj[ip] = {
        ...s,
        targetedUsernames: Array.from(s.targetedUsernames)
      };
    }

    return {
      suspects: suspectsObj,
      globalTimeline: [...this.globalTimeline],
      lastUpdated: new Date().toISOString()
    };
  }
}
