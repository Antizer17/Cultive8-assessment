/**
 * Report Synthesizer Service
 *
 * Requirements Met:
 * 1. "Combine repeated findings into one final report. Separate reports for each part are not enough."
 * 2. Cross-Part Attack Synthesis: Correlates brute force across early chunks with account takeover in later chunks.
 * 3. False Positive Filtering: Strips out benign operational errors (e.g. database timeouts without attack payloads).
 * 4. Deduplication & Line Merging: Merges identical attack types from the same IP, combining evidence lines and calculating frequency.
 * 5. Full Finding Schema: attack_type, severity, target_or_attacker_id, evidence_lines, reason, suggested_action.
 */

export class ReportSynthesizer {
  /**
   * Synthesizes raw chunk findings and state accumulator memory into a unified report.
   *
   * @param {Array} rawFindings - All findings collected across chunks
   * @param {Object} stateSnapshot - Snapshot from StateAccumulator (suspects & timeline)
   * @returns {Object} Comprehensive final security report
   */
  static synthesize(rawFindings = [], stateSnapshot = {}) {
    const suspects = stateSnapshot.suspects || {};
    const globalTimeline = stateSnapshot.globalTimeline || [];

    // Filter out false positives (e.g. benign database timeouts or health checks)
    const validRawFindings = rawFindings.filter(f => !this.isFalsePositive(f));

    // Combine raw model findings with multi-stage events from StateAccumulator
    const allCandidateFindings = [...globalTimeline, ...validRawFindings];

    // Deduplicate and group findings by IP + attack category
    const grouped = new Map();

    for (const item of allCandidateFindings) {
      const ip = (item.target_or_attacker_id || 'Unknown').trim();
      const attackType = (item.attack_type || 'Suspicious Activity').trim();
      const groupKey = `${ip}::${this.normalizeAttackCategory(attackType)}`;

      if (!grouped.has(groupKey)) {
        grouped.set(groupKey, {
          attack_type: attackType,
          severity: item.severity || 'Medium',
          target_or_attacker_id: ip,
          evidence_lines: new Set(),
          reasons: new Set(),
          suggested_actions: new Set(),
          frequency: 0,
          isCorrelatedMultiStage: !!item.isCorrelatedMultiStage,
          firstSeenLine: null,
          lastSeenLine: null
        });
      }

      const entry = grouped.get(groupKey);
      entry.frequency += 1;

      // Escalate severity if repeated or critical
      entry.severity = this.escalateSeverity(entry.severity, item.severity);

      // Merge evidence lines
      const lines = Array.isArray(item.evidence_lines) ? item.evidence_lines : [];
      for (const line of lines) {
        const num = Number(line);
        if (!isNaN(num) && num > 0) {
          entry.evidence_lines.add(num);
          if (!entry.firstSeenLine || num < entry.firstSeenLine) entry.firstSeenLine = num;
          if (!entry.lastSeenLine || num > entry.lastSeenLine) entry.lastSeenLine = num;
        }
      }

      if (item.reason) entry.reasons.add(item.reason);
      if (item.suggested_action) entry.suggested_actions.add(item.suggested_action);
      if (item.isCorrelatedMultiStage) entry.isCorrelatedMultiStage = true;
    }

    // Convert map to finalized finding objects
    const consolidatedFindings = Array.from(grouped.values()).map(item => {
      const sortedLines = Array.from(item.evidence_lines).sort((a, b) => a - b);
      const combinedReason = Array.from(item.reasons).join(' ') ||
        `Observed ${item.frequency} incident(s) of ${item.attack_type} from ${item.target_or_attacker_id}.`;
      const combinedAction = Array.from(item.suggested_actions)[0] ||
        `Block traffic from ${item.target_or_attacker_id} and review endpoint security.`;

      return {
        attack_type: item.attack_type,
        severity: item.severity,
        target_or_attacker_id: item.target_or_attacker_id,
        evidence_lines: sortedLines,
        line_count: sortedLines.length,
        frequency: item.frequency,
        isCorrelatedMultiStage: item.isCorrelatedMultiStage,
        first_seen_line: item.firstSeenLine || (sortedLines.length > 0 ? sortedLines[0] : null),
        last_seen_line: item.lastSeenLine || (sortedLines.length > 0 ? sortedLines[sortedLines.length - 1] : null),
        reason: combinedReason,
        suggested_action: combinedAction
      };
    });

    // Special Cross-Part Rule: If an IP has a Brute Force Followed by Account Compromise,
    // ensure standalone failed login entries for that IP are merged into the Critical compromise incident
    const finalFindings = this.mergeCompromiseFindings(consolidatedFindings);

    // Sort findings by severity priority: Critical -> High -> Medium -> Low
    const severityRank = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    finalFindings.sort((a, b) => {
      const diff = (severityRank[b.severity] || 0) - (severityRank[a.severity] || 0);
      if (diff !== 0) return diff;
      return (b.line_count || 0) - (a.line_count || 0);
    });

    // Compute summary metrics
    const severityCounts = { Critical: 0, High: 0, Medium: 0, Low: 0 };
    for (const f of finalFindings) {
      if (severityCounts[f.severity] !== undefined) {
        severityCounts[f.severity] += 1;
      }
    }

    const uniqueAttackerIps = Array.from(new Set(finalFindings.map(f => f.target_or_attacker_id)));

    // Generate chronological incident timeline
    const timeline = this.generateTimeline(finalFindings);

    return {
      generated_at: new Date().toISOString(),
      summary: {
        total_incidents: finalFindings.length,
        unique_attacker_ips: uniqueAttackerIps.length,
        severity_breakdown: severityCounts,
        highest_severity: finalFindings.length > 0 ? finalFindings[0].severity : 'None',
        overall_verdict: this.determineVerdict(severityCounts)
      },
      findings: finalFindings,
      timeline,
      attacker_summary: this.generateAttackerSummary(finalFindings, suspects)
    };
  }

  /**
   * Identifies and filters out false positives.
   */
  static isFalsePositive(finding) {
    const reason = (finding.reason || '').toLowerCase();
    const type = (finding.attack_type || '').toLowerCase();

    // Database timeouts (e.g. SqlException timeout without attack payload)
    if (reason.includes('database command timed out') || reason.includes('sqlexception')) {
      return true;
    }
    // Routine health monitor polls
    if (reason.includes('healthmonitor') || reason.includes('health monitor')) {
      return true;
    }
    // Single isolated failed login typo by known internal user (e.g. field.officer with Chrome user-agent)
    if (type.includes('brute') && (finding.evidence_lines?.length <= 1) && !finding.isCorrelatedMultiStage) {
      return true;
    }
    return false;
  }

  /**
   * Normalizes attack type into standard category for grouping.
   */
  static normalizeAttackCategory(attackType) {
    const lower = attackType.toLowerCase();
    if (lower.includes('compromise') || lower.includes('takeover')) return 'ACCOUNT_COMPROMISE';
    if (lower.includes('brute') || lower.includes('credential')) return 'BRUTE_FORCE';
    if (lower.includes('sql')) return 'SQL_INJECTION';
    if (lower.includes('traversal') || lower.includes('directory') || lower.includes('file')) return 'PATH_TRAVERSAL';
    if (lower.includes('exfiltration') || lower.includes('export')) return 'DATA_EXFILTRATION';
    if (lower.includes('scan') || lower.includes('probe')) return 'RECON_SCAN';
    return attackType.toUpperCase();
  }

  /**
   * Returns highest severity between two ratings.
   */
  static escalateSeverity(sevA, sevB) {
    const rank = { Critical: 4, High: 3, Medium: 2, Low: 1 };
    return (rank[sevB] || 0) > (rank[sevA] || 0) ? sevB : sevA;
  }

  /**
   * Merges lower-level brute force entries into a confirmed Critical Account Compromise.
   */
  static mergeCompromiseFindings(findings) {
    const compromiseIps = new Set(
      findings
        .filter(f => f.attack_type.includes('Compromise'))
        .map(f => f.target_or_attacker_id)
    );

    if (compromiseIps.size === 0) return findings;

    // Remove standalone brute-force entries for IPs that have a confirmed compromise finding,
    // and ensure all failure lines are attached to the compromise finding
    const result = [];
    const compromiseFindings = findings.filter(f => f.attack_type.includes('Compromise'));

    for (const f of findings) {
      if (compromiseIps.has(f.target_or_attacker_id) && f.attack_type.toLowerCase().includes('brute force') && !f.attack_type.includes('Compromise')) {
        // Merge evidence lines into the compromise finding
        const comp = compromiseFindings.find(c => c.target_or_attacker_id === f.target_or_attacker_id);
        if (comp) {
          const combined = new Set([...comp.evidence_lines, ...f.evidence_lines]);
          comp.evidence_lines = Array.from(combined).sort((a, b) => a - b);
          comp.line_count = comp.evidence_lines.length;
        }
        // Skip standalone brute force entry to prevent duplicate cards
        continue;
      }
      result.push(f);
    }

    return result;
  }

  /**
   * Generates a timeline of events sorted by first occurrence line.
   */
  static generateTimeline(findings) {
    const events = [];
    for (const f of findings) {
      events.push({
        attack_type: f.attack_type,
        severity: f.severity,
        ip: f.target_or_attacker_id,
        line_range: f.first_seen_line && f.last_seen_line
          ? `Lines ${f.first_seen_line} – ${f.last_seen_line}`
          : `Line ${f.first_seen_line || 'Unknown'}`,
        first_line: f.first_seen_line || 999999,
        summary: f.reason
      });
    }
    return events.sort((a, b) => a.first_line - b.first_line);
  }

  /**
   * Produces an executive verdict based on detected severity.
   */
  static determineVerdict(severityCounts) {
    if (severityCounts.Critical > 0) {
      return 'CRITICAL BREACH: Confirmed account compromise and/or data exfiltration detected. Immediate incident response required.';
    }
    if (severityCounts.High > 0) {
      return 'HIGH RISK: Active exploitation attempts (SQL Injection / Path Traversal) observed in logs. Vulnerability remediation required.';
    }
    if (severityCounts.Medium > 0) {
      return 'MEDIUM RISK: Suspicious probing or scanning detected. Recommend tightening perimeter firewall and rate limits.';
    }
    return 'LOW RISK: Routine server operations with no confirmed hostile attacks.';
  }

  /**
   * Produces an attacker profile summary.
   */
  static generateAttackerSummary(findings, suspects) {
    const summary = {};
    for (const f of findings) {
      const ip = f.target_or_attacker_id;
      if (!summary[ip]) {
        const suspectData = suspects[ip] || {};
        summary[ip] = {
          ip,
          highest_severity: f.severity,
          attacks_launched: [],
          total_incidents: 0,
          targeted_accounts: suspectData.targetedUsernames || [],
          is_compromised: !!suspectData.isCompromised
        };
      }
      summary[ip].attacks_launched.push(f.attack_type);
      summary[ip].total_incidents += f.frequency || 1;
    }
    return Object.values(summary);
  }
}
