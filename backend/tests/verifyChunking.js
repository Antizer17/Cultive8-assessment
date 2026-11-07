import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { splitLogsIntoChunks } from '../src/services/logSplitter.js';
import { countTokens } from '../src/services/tokenizer.js';
import { CONFIG } from '../src/config.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const logPath = path.resolve(__dirname, '../../Cultive8_Workspace_Agrigen_Server.log');

console.log('\n======================================================');
console.log('🧪 LOCAL AI LOG ANALYZER: CHUNKING VERIFICATION TEST');
console.log('======================================================\n');

if (!fs.existsSync(logPath)) {
  console.error(`❌ Target log file not found at: ${logPath}`);
  process.exit(1);
}

const rawContent = fs.readFileSync(logPath, 'utf8');
const originalLines = rawContent.split(/\r?\n/);
const maxBudget = CONFIG.TOKENS.MAX_LOG_CHUNK_TOKENS; // 950

console.log(`📄 Input Log File: Cultive8_Workspace_Agrigen_Server.log`);
console.log(`   - Size: ${(rawContent.length / 1024).toFixed(2)} KB`);
console.log(`   - Total Lines: ${originalLines.length}`);
console.log(`   - Total Raw Tokens: ~${countTokens(rawContent)}`);
console.log(`   - Chunk Token Limit: ${maxBudget} tokens\n`);

const startTime = performance.now();
const chunks = splitLogsIntoChunks(rawContent, maxBudget);
const durationMs = (performance.now() - startTime).toFixed(2);

console.log(`⚡ Splitting Execution Time: ${durationMs} ms`);
console.log(`📦 Chunks Generated: ${chunks.length}\n`);

// 1. Line Continuity & Boundary Check
let continuityPassed = true;
let reconstructedLines = [];
let maxChunkTokens = 0;
let minChunkTokens = Infinity;
let totalChunkTokens = 0;

for (let i = 0; i < chunks.length; i++) {
  const c = chunks[i];
  if (c.tokenCount > maxChunkTokens) maxChunkTokens = c.tokenCount;
  if (c.tokenCount < minChunkTokens) minChunkTokens = c.tokenCount;
  totalChunkTokens += c.tokenCount;

  if (i > 0) {
    const prev = chunks[i - 1];
    if (prev.endLine + 1 !== c.startLine) {
      continuityPassed = false;
      console.error(`❌ Continuity gap between Chunk ${prev.chunkIndex} (end ${prev.endLine}) and Chunk ${c.chunkIndex} (start ${c.startLine})`);
    }
  }

  for (const l of c.lines) {
    reconstructedLines.push(l.text);
  }
}

// 2. Character-for-Character Reconstruction Check
let exactMatch = true;
if (reconstructedLines.length !== originalLines.length) {
  exactMatch = false;
} else {
  for (let i = 0; i < originalLines.length; i++) {
    if (originalLines[i] !== reconstructedLines[i]) {
      exactMatch = false;
      break;
    }
  }
}

// 3. Token Budget Ceiling Check
const allWithinBudget = chunks.every(c => c.tokenCount <= maxBudget);

// 4. Attack Anchor Verification (Line 196: Account Takeover)
const compromiseChunk = chunks.find(c => 196 >= c.startLine && 196 <= c.endLine);
const line196Present = compromiseChunk && compromiseChunk.lines.some(l => l.lineNumber === 196);

console.log('📋 ASSERTION RESULTS:');
console.log(` [${continuityPassed ? 'PASS' : 'FAIL'}] 1. Line Continuity (1 to ${originalLines.length}): No gaps or overlaps`);
console.log(` [${exactMatch ? 'PASS' : 'FAIL'}] 2. Data Integrity: 100% exact character-for-character reconstruction`);
console.log(` [${allWithinBudget ? 'PASS' : 'FAIL'}] 3. Token Budget: All chunks <= ${maxBudget} tokens (Max was ${maxChunkTokens}, Min was ${minChunkTokens})`);
console.log(` [${line196Present ? 'PASS' : 'FAIL'}] 4. Target Attack Anchor: Compromise line 196 cleanly located in Chunk #${compromiseChunk?.chunkIndex} (Lines ${compromiseChunk?.startLine}-${compromiseChunk?.endLine})`);

console.log('\n------------------------------------------------------');
if (continuityPassed && exactMatch && allWithinBudget && line196Present) {
  console.log('✅ ALL VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  console.log('------------------------------------------------------\n');
  process.exit(0);
} else {
  console.error('❌ ONE OR MORE VERIFICATION CHECKS FAILED!');
  console.log('------------------------------------------------------\n');
  process.exit(1);
}
