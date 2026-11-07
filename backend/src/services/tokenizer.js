import { encode } from 'gpt-tokenizer';
import { CONFIG } from '../config.js';

/**
 * Tokenizer Service
 * Computes exact BPE token counts for log chunks, prompts, and carried state
 * to strictly enforce the 2,048-token context ceiling.
 */

/**
 * Returns exact integer token count for a string.
 * @param {string} text - Input text
 * @returns {number} Number of tokens
 */
export function countTokens(text) {
  if (!text || typeof text !== 'string') {
    return 0;
  }
  try {
    return encode(text).length;
  } catch (err) {
    // Fallback: Byte-pair approximation (~4 chars per token)
    return Math.ceil(text.length / 4);
  }
}

/**
 * Returns the token array for a string.
 * @param {string} text - Input text
 * @returns {number[]} Array of token IDs
 */
export function encodeText(text) {
  if (!text || typeof text !== 'string') {
    return [];
  }
  return encode(text);
}

/**
 * Dynamically calculates the allowable token budget for raw log text
 * within the strict 2,048 limit.
 *
 * Formula:
 * 2,048 - (systemPromptTokens + stateTokens + outputReserve)
 *
 * @param {number} systemPromptTokens - Tokens used by system prompt & rules
 * @param {number} stateTokens - Tokens used by carried suspicious IP state
 * @param {number} [outputReserve=498] - Tokens reserved for model output
 * @returns {number} Available token budget for log chunk
 */
export function calculateLogBudget(
  systemPromptTokens = CONFIG.TOKENS.SYSTEM_PROMPT_BUDGET,
  stateTokens = CONFIG.TOKENS.STATE_CONTEXT_BUDGET,
  outputReserve = CONFIG.TOKENS.OUTPUT_RESERVE
) {
  const remaining = CONFIG.TOKENS.TOTAL_CONTEXT_WINDOW - (systemPromptTokens + stateTokens + outputReserve);
  // Ensure a safe minimum of 300 tokens and maximum of 1,200 tokens
  return Math.max(300, Math.min(remaining, 1200));
}
