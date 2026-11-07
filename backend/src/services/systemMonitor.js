/**
 * System Monitor Service
 * Tracks Node backend process RAM (RSS) and local Ollama model RAM against
 * the 4 GB (4096 MB) server ceiling.
 */

export async function getSystemMetrics() {
  // Placeholder stub: will return RAM & CPU usage
  return {
    backendRamMB: 0,
    modelRamMB: 0,
    combinedRamMB: 0,
    budgetLimitMB: 4096,
    isHealthy: true
  };
}
