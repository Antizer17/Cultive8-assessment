/**
 * Frontend API Service
 * Handles REST requests and Server-Sent Events (SSE) streaming connections.
 */

const BASE_URL = '/api';

export const api = {
  /**
   * Fetches real-time system RAM and 4 GB budget metrics.
   */
  async getSystemMetrics(model) {
    const url = model ? `${BASE_URL}/system/metrics?model=${encodeURIComponent(model)}` : `${BASE_URL}/system/metrics`;
    const res = await fetch(url);
    if (!res.ok) throw new Error(`Metrics error: ${res.statusText}`);
    return res.json();
  },

  /**
   * Fetches local model engine status and installed Ollama models.
   */
  async getSystemModels() {
    const res = await fetch(`${BASE_URL}/system/models`);
    if (!res.ok) throw new Error(`Models error: ${res.statusText}`);
    return res.json();
  },

  /**
   * 1-Click quick load for the official Cultive8 log file.
   */
  async quickLoadTarget(model) {
    const res = await fetch(`${BASE_URL}/system/quick-load-target`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ model })
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Quick load failed: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Uploads a .log or .txt file via multipart form-data.
   */
  async uploadFile(file, model) {
    const formData = new FormData();
    formData.append('file', file);
    if (model) formData.append('model', model);

    const res = await fetch(`${BASE_URL}/analysis/upload`, {
      method: 'POST',
      body: formData
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Upload failed: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Starts sequential chunk analysis for an uploaded job.
   */
  async startAnalysis(jobId) {
    const res = await fetch(`${BASE_URL}/analysis/${jobId}/start`, {
      method: 'POST'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Start analysis failed: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Resumes an interrupted job from its first incomplete chunk.
   */
  async resumeAnalysis(jobId) {
    const res = await fetch(`${BASE_URL}/analysis/${jobId}/resume`, {
      method: 'POST'
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error || `Resume analysis failed: ${res.statusText}`);
    }
    return res.json();
  },

  /**
   * Fetches current job status and chunk execution records.
   */
  async getJob(jobId) {
    const res = await fetch(`${BASE_URL}/analysis/${jobId}`);
    if (!res.ok) throw new Error(`Job fetch error: ${res.statusText}`);
    return res.json();
  },

  /**
   * Fetches final synthesized security report.
   */
  async getReport(jobId) {
    const res = await fetch(`${BASE_URL}/analysis/${jobId}/report`);
    if (!res.ok) throw new Error(`Report fetch error: ${res.statusText}`);
    return res.json();
  },

  /**
   * Lists past analysis jobs.
   */
  async listJobs() {
    const res = await fetch(`${BASE_URL}/analysis`);
    if (!res.ok) throw new Error(`List jobs error: ${res.statusText}`);
    return res.json();
  },

  /**
   * Connects to Server-Sent Events (SSE) live progress stream.
   *
   * @param {string} jobId
   * @param {Object} handlers - { onProgress, onCompleted, onFailed, onFallback, onConnected }
   * @returns {EventSource} Active EventSource instance
   */
  connectStream(jobId, handlers = {}) {
    const eventSource = new EventSource(`${BASE_URL}/analysis/${jobId}/stream`);

    eventSource.addEventListener('connected', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (handlers.onConnected) handlers.onConnected(data);
      } catch (_) {}
    });

    eventSource.addEventListener('chunk_progress', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (handlers.onProgress) handlers.onProgress(data);
      } catch (_) {}
    });

    eventSource.addEventListener('analysis_completed', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (handlers.onCompleted) handlers.onCompleted(data);
      } catch (_) {}
    });

    eventSource.addEventListener('analysis_failed', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (handlers.onFailed) handlers.onFailed(data);
      } catch (_) {}
    });

    eventSource.addEventListener('model_fallback_triggered', (e) => {
      try {
        const data = JSON.parse(e.data);
        if (handlers.onFallback) handlers.onFallback(data);
      } catch (_) {}
    });

    eventSource.onerror = (err) => {
      if (handlers.onError) handlers.onError(err);
    };

    return eventSource;
  }
};
