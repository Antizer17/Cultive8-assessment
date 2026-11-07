/**
 * Server-Sent Events (SSE) Manager
 *
 * Manages active SSE subscriber connections per jobId,
 * heartbeat intervals, and event broadcasting across the analysis lifecycle.
 */
class SseManager {
  constructor() {
    // Map of jobId -> Set of Express response objects
    this.clients = new Map();
  }

  /**
   * Registers a new SSE client for a specific job.
   */
  addClient(jobId, res) {
    if (!this.clients.has(jobId)) {
      this.clients.set(jobId, new Set());
    }
    this.clients.get(jobId).add(res);

    // Initial connection acknowledgement
    res.write(`event: connected\ndata: ${JSON.stringify({ jobId, time: new Date().toISOString() })}\n\n`);

    res.on('close', () => {
      this.removeClient(jobId, res);
    });
  }

  /**
   * Unregisters a disconnected SSE client.
   */
  removeClient(jobId, res) {
    const jobClients = this.clients.get(jobId);
    if (jobClients) {
      jobClients.delete(res);
      if (jobClients.size === 0) {
        this.clients.delete(jobId);
      }
    }
  }

  /**
   * Broadcasts an SSE event to all connected subscribers for a job.
   */
  broadcast(jobId, eventType, data) {
    const jobClients = this.clients.get(jobId);
    if (jobClients && jobClients.size > 0) {
      const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
      for (const res of jobClients) {
        try {
          res.write(message);
        } catch (_) {
          // Handled on socket close
        }
      }
    }
  }

  /**
   * Checks if any clients are currently listening for a job.
   */
  hasSubscribers(jobId) {
    const jobClients = this.clients.get(jobId);
    return !!(jobClients && jobClients.size > 0);
  }
}

export const sseManager = new SseManager();
