import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const backendRoot = path.resolve(__dirname, '..');


export const CONFIG = {
  // Server Port & Host
  PORT: process.env.PORT || 5000,
  HOST: '0.0.0.0',

  // RAM Budget Guardrails (4 GB server ceiling)
  RAM: {
    BUDGET_MB: 4096,               // Hard limit: 4,096 MB
    FALLBACK_THRESHOLD_MB: 3400,  // 85% of budget: triggers auto-fallback to 0.5B
    WARNING_THRESHOLD_MB: 3000    // 73% of budget: warning flag
  },

  // Token Window Allocation (Strict 2,048 limit)
  TOKENS: {
    TOTAL_CONTEXT_WINDOW: 2048,
    SYSTEM_PROMPT_BUDGET: 250,   // Schema + anti-injection instructions
    STATE_CONTEXT_BUDGET: 350,   // Active suspicious IPs & prior events
    OUTPUT_RESERVE: 498,         // Room for model JSON response
    MAX_LOG_CHUNK_TOKENS: 950    // 2048 - (250 + 350 + 498) = 950
  },

  // Local AI Model Configurations (Ollama CPU Inference)
  MODELS: {
    PRIMARY: 'qwen2.5:1.5b',     // Deep reasoning, ~1.2 GB RAM footprint
    FALLBACK: 'qwen2.5:0.5b',    // Ultra-light, ~550 MB RAM footprint
    OLLAMA_BASE_URL: process.env.OLLAMA_URL || 'http://localhost:11434',
    TIMEOUT_MS: 30000,           // 30-second watchdog for 2 vCPU execution
    TEMPERATURE: 0.0,            // Strict temperature 0 for zero hallucination
    REPEAT_PENALTY: 1.15,        // Prevent looping summaries
    MAX_RETRIES: 2               // Max retries per chunk before fallback
  },

  // Storage & Persistence Directories (Zero external DB)
  PATHS: {
    DATA_DIR: path.join(backendRoot, 'data'),
    JOBS_DIR: path.join(backendRoot, 'data', 'jobs'),
    UPLOADS_DIR: path.join(backendRoot, 'data', 'uploads')
  },

  // Configurable Security Allowlist (Operations & Infrastructure Exclusions)
  ALLOWLIST: {
    // Configurable via ALLOWLIST_IPS env var (e.g. registered ops-config health monitors)
    TRUSTED_IPS: process.env.ALLOWLIST_IPS
      ? process.env.ALLOWLIST_IPS.split(',').map(s => s.trim())
      : ['192.0.2.10'], // Registered ops-config health monitor
    TRUSTED_ENDPOINTS: ['/health', '/ready', '/live', '/metrics'],
    TRUSTED_USER_AGENTS: ['HealthMonitor', 'UptimeCheck']
  }
};
