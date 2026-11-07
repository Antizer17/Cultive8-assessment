import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { CONFIG } from '../config.js';

const execAsync = promisify(exec);

/**
 * System Monitor Service
 *
 * Implements:
 * 1. Live RAM Monitoring: Measures Node.js Express RSS + Ollama local model memory in real-time.
 * 2. 4 GB Budget Guardrail: Verifies total application footprint stays within 4,096 MB.
 * 3. Auto-Fallback Trigger: Detects if memory reaches 3,400 MB (85% threshold) to trigger model downgrade.
 * 4. Cross-Platform Support: Queries Windows tasklist or Linux ps, with heuristic fallback.
 * 5. Caching: 1.5-second TTL cache to prevent CPU thrashing during frequent UI polling.
 */

let cachedMetrics = null;
let lastCheckTime = 0;
const CACHE_TTL_MS = 1500;

export class SystemMonitor {
  /**
   * Retrieves comprehensive memory and system health metrics.
   *
   * @param {string} [currentModel] - Active model name (used for fallback estimate)
   * @returns {Promise<{
   *   backendRamMB: number,
   *   backendHeapMB: number,
   *   modelRamMB: number,
   *   combinedAppRamMB: number,
   *   serverTotalRamMB: number,
   *   serverFreeRamMB: number,
   *   budgetLimitMB: number,
   *   fallbackThresholdMB: number,
   *   percentOfBudget: number,
   *   isHealthy: boolean,
   *   shouldTriggerFallback: boolean,
   *   activeModel: string,
   *   cpuCount: number,
   *   platform: string,
   *   uptimeSeconds: number
   * }>}
   */
  static async getMetrics(currentModel = CONFIG.MODELS.PRIMARY) {
    const now = Date.now();
    if (cachedMetrics && (now - lastCheckTime < CACHE_TTL_MS)) {
      return { ...cachedMetrics, activeModel: currentModel };
    }

    // 1. Backend Memory (Resident Set Size & Heap)
    const memUsage = process.memoryUsage();
    const backendRamMB = Math.round((memUsage.rss / 1024 / 1024) * 10) / 10;
    const backendHeapMB = Math.round((memUsage.heapUsed / 1024 / 1024) * 10) / 10;

    // 2. Local AI Model (Ollama) Memory
    const modelRamMB = await this.queryOllamaMemoryMB(currentModel);

    // 3. Combined Application Footprint (Backend + Local Model)
    const combinedAppRamMB = Math.round((backendRamMB + modelRamMB) * 10) / 10;

    // 4. Server Physical RAM
    const serverTotalRamMB = Math.round(os.totalmem() / 1024 / 1024);
    const serverFreeRamMB = Math.round(os.freemem() / 1024 / 1024);

    // 5. Budget Calculation against 4 GB limit
    const budgetLimitMB = CONFIG.RAM.BUDGET_MB; // 4,096 MB
    const fallbackThresholdMB = CONFIG.RAM.FALLBACK_THRESHOLD_MB; // 3,400 MB
    const percentOfBudget = Math.round((combinedAppRamMB / budgetLimitMB) * 1000) / 10;

    const isHealthy = combinedAppRamMB < fallbackThresholdMB;
    const shouldTriggerFallback = combinedAppRamMB >= fallbackThresholdMB;

    cachedMetrics = {
      backendRamMB,
      backendHeapMB,
      modelRamMB,
      combinedAppRamMB,
      serverTotalRamMB,
      serverFreeRamMB,
      budgetLimitMB,
      fallbackThresholdMB,
      percentOfBudget,
      isHealthy,
      shouldTriggerFallback,
      activeModel: currentModel,
      cpuCount: os.cpus().length,
      platform: os.platform(),
      uptimeSeconds: Math.round(process.uptime()),
      timestamp: new Date().toISOString()
    };

    lastCheckTime = now;
    return cachedMetrics;
  }

  /**
   * Queries the OS for memory working set of Ollama and its inference runners.
   */
  static async queryOllamaMemoryMB(currentModel) {
    const isWindows = os.platform() === 'win32';

    try {
      if (isWindows) {
        // Query tasklist for both ollama parent and llama-server inference runner
        const { stdout: ollamaOut } = await execAsync('tasklist /FO CSV /NH /FI "IMAGENAME eq ollama*"', {
          timeout: 2000
        }).catch(() => ({ stdout: '' }));

        const { stdout: llamaOut } = await execAsync('tasklist /FO CSV /NH /FI "IMAGENAME eq llama*"', {
          timeout: 2000
        }).catch(() => ({ stdout: '' }));

        let totalKb = 0;
        const allLines = `${ollamaOut}\n${llamaOut}`.trim().split(/\r?\n/);
        for (const line of allLines) {
          if (!line || line.includes('No tasks')) continue;
          // Parse CSV: "image.exe","pid","session","session#","40,428 K"
          const parts = line.split('","');
          if (parts.length >= 5) {
            const memStr = parts[4].replace(/[",\sKk]/g, '');
            const kb = parseInt(memStr, 10);
            if (!isNaN(kb)) totalKb += kb;
          }
        }

        if (totalKb > 0) {
          return Math.round((totalKb / 1024) * 10) / 10;
        }
      } else {
        // Linux/macOS ps query
        const { stdout } = await execAsync('ps -eo rss,comm | grep -E "ollama|llama" | awk "{sum+=\\$1} END {print sum}"', {
          timeout: 2000
        });
        const kb = parseInt(stdout.trim(), 10);
        if (!isNaN(kb) && kb > 0) {
          return Math.round((kb / 1024) * 10) / 10;
        }
      }
    } catch (_) {
      // Fall through to heuristic if process query fails
    }

    // Heuristic Model Baseline if OS process table is inaccessible
    if (currentModel?.includes('1.5b')) {
      return 1180.0; // ~1.18 GB for Qwen 2.5 1.5B Q4_K_M
    }
    return 520.0; // ~520 MB for Qwen 2.5 0.5B
  }
}
