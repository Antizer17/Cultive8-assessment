import fs from 'fs';
import assert from 'assert';
import path from 'path';

import { ReportSynthesizer } from '../src/services/reportSynthesizer.js';
import { StateAccumulator } from '../src/services/stateAccumulator.js';
import { distillAllLogLines } from '../src/services/logDistiller.js';

const rawText = fs.readFileSync('Cultive8_Workspace_Agrigen_Server.log', 'utf8');
const rawLinesArray = rawText.split(/\r?\n/);
const rawLinesMap = new Map();
rawLinesArray.forEach((line, idx) => rawLinesMap.set(idx + 1, line));

console.log('Testing Grounding Guardrails...');

// 1. Test .94 finding where cited lines don't match .94
const fake94Finding = {
  attack_type: 'Path Traversal',
  severity: 'Medium',
  target_or_attacker_id: '198.51.100.94',
  evidence_lines: [4, 8, 99], // L4 is .109, L8 is .114, L99 is .90
  reason: 'Probing files'
};
const grounded94 = ReportSynthesizer.groundFinding(fake94Finding, rawLinesMap);
assert.strictEqual(grounded94, null, 'Fake .94 finding with mismatched lines must be dropped (null)');
console.log('✔ Fake .94 finding dropped correctly');

// 2. Test bad L4/L8 range start on 203.0.113.44 finding
const badRangeFinding = {
  attack_type: 'Brute Force',
  severity: 'High',
  target_or_attacker_id: '203.0.113.44',
  evidence_lines: [4, 5, 13, 23], // L4 is .109!
  reason: 'Brute force attempts'
};
const groundedRange = ReportSynthesizer.groundFinding(badRangeFinding, rawLinesMap);
assert.deepStrictEqual(groundedRange.evidence_lines, [5, 13, 23], 'Line 4 (.109) must be stripped from .44 finding');
assert.strictEqual(groundedRange.first_seen_line, 5, 'first_seen_line must be 5, not 4');
assert.strictEqual(groundedRange.line_range, 'Lines 5 – 23', 'line_range must start at Line 5');
console.log('✔ Bad L4/L8 range start stripped and recomputed correctly');

// 3. Test .90 L102 Account Compromise card guard
const fake90Compromise = {
  attack_type: 'Account Compromise',
  severity: 'Critical',
  target_or_attacker_id: '203.0.113.90',
  evidence_lines: [102],
  reason: 'Unauthorized access to admin settings'
};
const grounded90 = ReportSynthesizer.groundFinding(fake90Compromise, rawLinesMap);
assert.strictEqual(grounded90.attack_type, 'Path Traversal', '.90 L102 must be downgraded to Path Traversal');
assert.strictEqual(grounded90.severity, 'Medium', '.90 L102 must be downgraded to Medium');
console.log('✔ .90 L102 Account Compromise card guarded and downgraded correctly');

// 4. Test StateAccumulator failed logins count (13 -> 12)
const items = distillAllLogLines(rawText);
const state = new StateAccumulator();
state.ingestChunkLines(items);
const suspect44 = state.suspects['203.0.113.44'];
assert.strictEqual(suspect44.failedLogins, 12, 'Failed logins for 203.0.113.44 must be exactly 12 (not 13)');
console.log('✔ Failed logins computed from auth_result in code: exactly 12');

// 5. Test Rate Abuse tracking on .155
const suspect155 = state.suspects['203.0.113.155'];
assert.ok(suspect155.peakRequestsInWindow >= 135, 'Peak requests_in_window for .155 must be >= 135');
assert.strictEqual(suspect155.status429Count, 9, 'HTTP 429 count for .155 must be 9');
console.log('✔ Rate abuse telemetry computed for .155: peak 135, 429 count 9');

// 6. Test final synthesis merging .90 into 1 card
const rawFindings = [
  {
    attack_type: 'Path Traversal',
    severity: 'Medium',
    target_or_attacker_id: '203.0.113.90',
    evidence_lines: [54, 56, 58, 60, 62, 64, 67, 69, 99, 101],
    reason: 'Probing sensitive files and directories',
    suggested_action: 'Block IP'
  },
  grounded90 // L102 downgraded to Path Traversal
];
const report = ReportSynthesizer.synthesize(rawFindings, state.getStateSnapshot(), rawLinesMap);
const findings90 = report.findings.filter(f => f.target_or_attacker_id === '203.0.113.90');
assert.strictEqual(findings90.length, 1, '203.0.113.90 must have exactly ONE card');
assert.ok(findings90[0].evidence_lines.includes(102), '.90 card must include line 102');
console.log('✔ .90 findings merged into exactly 1 card: Lines', findings90[0].evidence_lines.join(', '));

console.log('\nALL 6 VERIFICATION CHECKS PASSED PERFECTLY!');
