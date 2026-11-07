/**
 * State Accumulator Service
 * Maintains rolling working memory of suspicious IPs, failed logins, scanning paths,
 * and tracks cross-chunk multi-stage attacks (e.g. brute force + compromise).
 */

export class StateAccumulator {
  constructor(initialState = {}) {
    this.suspects = initialState.suspects || {};
    this.history = initialState.history || [];
  }

  // Placeholder stub: will update state and format compact carryover context
  serializeForPrompt() {
    return JSON.stringify(this.suspects);
  }
}
