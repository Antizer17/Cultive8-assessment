import { OllamaClient } from '../src/services/ollamaClient.js';
import { ReportSynthesizer } from '../src/services/reportSynthesizer.js';
import fs from 'fs';

const rawText = fs.readFileSync('Cultive8_Workspace_Agrigen_Server.log', 'utf8');
const rawLinesArray = rawText.split(/\r?\n/);
const rawLinesMap = new Map();
rawLinesArray.forEach((line, idx) => rawLinesMap.set(idx + 1, line));

const entry = JSON.parse(rawLinesMap.get(217));

async function test() {
  const res = await OllamaClient.analyzeSecurityEvent({
    ip: entry.client_ip,
    lines: [217],
    action: `${entry.method || 'GET'} ${entry.path || ''} -> HTTP ${entry.status}`,
    payload: entry.submitted_text || entry.path,
    error: entry.validation_error || entry.security_rule,
    computedTelemetry: '',
    priorContext: null,
    preferredModel: 'qwen2.5:1.5b'
  });

  console.log('Ollama result findings:', JSON.stringify(res.findings, null, 2));

  const grounded = res.findings.map(f => ReportSynthesizer.groundFinding(f, rawLinesMap)).filter(Boolean);
  console.log('Grounded findings:', JSON.stringify(grounded, null, 2));
}

test().catch(console.error);
