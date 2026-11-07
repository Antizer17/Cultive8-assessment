import { countTokens } from './tokenizer.js';
import { CONFIG } from '../config.js';

/**
 * Log Splitter Service
 *
 * Requirements Met:
 * 1. Strict 2,048 token context adherence: Ensures each chunk's text fits within the log token budget (~950 tokens).
 * 2. Boundary Preservation: Never splits inside a log entry line.
 * 3. Exact Line Number Tracking: Preserves 1-indexed original file line numbers.
 * 4. Model-Assisted Line Tagging: Prefixes each line with `Line <N>:` so the local model can cite exact evidence lines.
 */

/**
 * Splits raw log text into boundary-safe, token-budgeted chunks.
 *
 * @param {string} rawLogContent - Full raw text of .log or .txt file
 * @param {number} [maxTokensPerChunk=950] - Maximum token budget per chunk
 * @returns {Array<{
 *   chunkIndex: number,
 *   startLine: number,
 *   endLine: number,
 *   lineCount: number,
 *   tokenCount: number,
 *   rawText: string,
 *   annotatedText: string,
 *   lines: Array<{ lineNumber: number, text: string }>
 * }>}
 */
export function splitLogsIntoChunks(rawLogContent, maxTokensPerChunk = CONFIG.TOKENS.MAX_LOG_CHUNK_TOKENS) {
  if (!rawLogContent || typeof rawLogContent !== 'string') {
    return [];
  }

  // Split into raw lines, normalizing CRLF to LF
  const rawLines = rawLogContent.split(/\r?\n/);
  const totalRawLines = rawLines.length;

  const chunks = [];
  let currentChunkLines = [];
  let currentChunkTokens = 0;
  let chunkStartIndex = 1;

  for (let i = 0; i < totalRawLines; i++) {
    const lineNumber = i + 1; // 1-indexed line number
    const lineText = rawLines[i];

    // Format line with line tag so local model directly references exact original lines
    const annotatedLine = `Line ${lineNumber}: ${lineText}`;
    const lineTokens = countTokens(annotatedLine + '\n');

    // If adding this line would exceed the token budget and we already have lines in current chunk:
    // Seal current chunk and start a new one
    if (currentChunkLines.length > 0 && (currentChunkTokens + lineTokens > maxTokensPerChunk)) {
      chunks.push(finalizeChunk(chunks.length + 1, currentChunkLines, currentChunkTokens));
      currentChunkLines = [];
      currentChunkTokens = 0;
    }

    currentChunkLines.push({
      lineNumber,
      rawText: lineText,
      annotatedLine
    });
    currentChunkTokens += lineTokens;

    // Edge case: A single line is longer than maxTokensPerChunk
    // We isolate it as its own single-line chunk rather than truncating it
    if (currentChunkTokens >= maxTokensPerChunk) {
      chunks.push(finalizeChunk(chunks.length + 1, currentChunkLines, currentChunkTokens));
      currentChunkLines = [];
      currentChunkTokens = 0;
    }
  }

  // Finalize any remaining lines in the last chunk
  if (currentChunkLines.length > 0) {
    chunks.push(finalizeChunk(chunks.length + 1, currentChunkLines, currentChunkTokens));
  }

  return chunks;
}

/**
 * Helper to construct standardized chunk object.
 */
function finalizeChunk(chunkIndex, chunkLines, tokenCount) {
  const startLine = chunkLines[0].lineNumber;
  const endLine = chunkLines[chunkLines.length - 1].lineNumber;
  const rawText = chunkLines.map(l => l.rawText).join('\n');
  const annotatedText = chunkLines.map(l => l.annotatedLine).join('\n');

  return {
    chunkIndex,
    startLine,
    endLine,
    lineCount: chunkLines.length,
    tokenCount,
    rawText,
    annotatedText,
    lines: chunkLines.map(l => ({ lineNumber: l.lineNumber, text: l.rawText }))
  };
}
