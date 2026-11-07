import { CONFIG } from '../config.js';

/**
 * Allowlist Manager Service
 *
 * Separates legitimate operational and infrastructure allowlists (known health monitors,
 * monitoring endpoints, and authorized probe agents) completely from attack detection logic.
 *
 * Configurable via environment variables (e.g. ALLOWLIST_IPS="192.0.2.10,10.0.0.5") or CONFIG.
 */
export class AllowlistManager {
  static trustedIps = new Set(
    Array.isArray(CONFIG.ALLOWLIST?.TRUSTED_IPS)
      ? CONFIG.ALLOWLIST.TRUSTED_IPS
      : (CONFIG.ALLOWLIST?.TRUSTED_IPS || '').split(',').map(s => s.trim()).filter(Boolean)
  );

  static trustedEndpoints = new Set(
    CONFIG.ALLOWLIST?.TRUSTED_ENDPOINTS || ['/health', '/ready', '/live', '/metrics']
  );

  static trustedUserAgents = [
    ...(CONFIG.ALLOWLIST?.TRUSTED_USER_AGENTS || ['HealthMonitor', 'UptimeCheck'])
  ];

  /**
   * Checks whether a client IP is on the configured infrastructure allowlist.
   *
   * @param {string} ip - IPv4 address to evaluate
   * @returns {boolean} True if IP is explicitly allowlisted
   */
  static isIpAllowlisted(ip) {
    if (!ip || typeof ip !== 'string') return false;
    return this.trustedIps.has(ip.trim());
  }

  /**
   * Checks whether a path is an authorized operational health or metric endpoint.
   *
   * @param {string} path - Request URI path
   * @returns {boolean} True if endpoint is a known operational endpoint
   */
  static isEndpointAllowlisted(path) {
    if (!path || typeof path !== 'string') return false;
    const cleanPath = path.split('?')[0].trim();
    return this.trustedEndpoints.has(cleanPath);
  }

  /**
   * Checks whether a User-Agent represents an authorized monitoring agent.
   *
   * @param {string} userAgent - HTTP User-Agent string
   * @returns {boolean} True if user-agent contains a trusted monitoring signature
   */
  static isUserAgentAllowlisted(userAgent) {
    if (!userAgent || typeof userAgent !== 'string') return false;
    return this.trustedUserAgents.some(trusted => userAgent.includes(trusted));
  }

  /**
   * Evaluates if a request entry is a benign operational health/readiness check.
   *
   * @param {Object} entry - Distilled or raw telemetry entry
   * @returns {boolean}
   */
  static isOperationalCheck(entry) {
    if (!entry) return false;
    if (this.isIpAllowlisted(entry.client_ip)) return true;
    if (this.isEndpointAllowlisted(entry.path)) return true;
    if (this.isUserAgentAllowlisted(entry.user_agent)) return true;
    return false;
  }

  /**
   * Adds an IP to the runtime allowlist.
   */
  static addTrustedIp(ip) {
    if (ip && typeof ip === 'string') {
      this.trustedIps.add(ip.trim());
    }
  }

  /**
   * Removes an IP from the runtime allowlist.
   */
  static removeTrustedIp(ip) {
    if (ip && typeof ip === 'string') {
      this.trustedIps.delete(ip.trim());
    }
  }

  /**
   * Returns current active allowlist configuration for diagnostics and audit logging.
   */
  static getAllowlistSnapshot() {
    return {
      trustedIps: Array.from(this.trustedIps),
      trustedEndpoints: Array.from(this.trustedEndpoints),
      trustedUserAgents: [...this.trustedUserAgents]
    };
  }
}
