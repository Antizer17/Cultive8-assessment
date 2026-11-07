import fs from 'fs/promises';
import fsSync from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';

/**
 * Job Store Service
 *
 * Implements an embedded, atomic, file-backed persistence layer.
 * 
 * Guarantees:
 * 1. Zero external database overhead (0 MB extra RAM).
 * 2. Crash-proof atomic writes (writes to .tmp then renames).
 * 3. Instant resume: If stopped or restarted, it resumes from the exact uncompleted chunk.
 * 4. Memory protection: Flushes state and findings to disk after each chunk.
 */

// Ensure jobs directory exists at startup
if (!fsSync.existsSync(CONFIG.PATHS.JOBS_DIR)) {
  fsSync.mkdirSync(CONFIG.PATHS.JOBS_DIR, { recursive: true });
}

export class JobStore {
  /**
   * Generates file path for a given job ID.
   */
  static getJobFilePath(jobId) {
    return path.join(CONFIG.PATHS.JOBS_DIR, `${jobId}.json`);
  }

  /**
   * Initializes a new job and writes it to disk.
   */
  static async createJob({
    jobId,
    filename,
    fileSize,
    totalLines,
    totalTokens,
    totalChunks,
    model = CONFIG.MODELS.PRIMARY
  }) {
    const jobData = {
      id: jobId,
      filename,
      fileSize,
      totalLines,
      totalTokens,
      totalChunks,
      model,
      status: 'PENDING', // 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED' | 'PAUSED'
      currentChunkIndex: 0,
      completedChunks: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      finishedAt: null,
      workingState: {
        suspects: {},
        globalTimeline: []
      },
      chunkRecords: [],
      rawFindings: [],
      finalReport: null,
      metrics: {
        totalLatencyMs: 0,
        totalTokensProcessed: 0,
        modelSwitches: []
      },
      error: null
    };

    await this.writeAtomic(jobId, jobData);
    return jobData;
  }

  /**
   * Retrieves full job record from disk.
   */
  static async getJob(jobId) {
    const filePath = this.getJobFilePath(jobId);
    try {
      const data = await fs.readFile(filePath, 'utf8');
      return JSON.parse(data);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return null;
      }
      throw err;
    }
  }

  /**
   * Atomically saves findings and updated working state after each chunk call.
   */
  static async saveChunkResult({
    jobId,
    chunkIndex,
    findings = [],
    updatedState = null,
    latencyMs = 0,
    promptTokens = 0,
    completionTokens = 0,
    modelUsed = CONFIG.MODELS.PRIMARY,
    error = null
  }) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.status = 'PROCESSING';
    job.currentChunkIndex = chunkIndex;
    job.updatedAt = new Date().toISOString();

    // Record chunk execution metrics
    const chunkRecord = {
      chunkIndex,
      status: error ? 'FAILED' : 'COMPLETED',
      findingsCount: findings.length,
      latencyMs,
      promptTokens,
      completionTokens,
      totalTokens: promptTokens + completionTokens,
      modelUsed,
      timestamp: new Date().toISOString(),
      error: error ? String(error) : null
    };
    job.chunkRecords.push(chunkRecord);

    if (!error) {
      job.completedChunks += 1;
      // Append raw findings
      job.rawFindings.push(...findings);
      // Update carried state memory
      if (updatedState) {
        job.workingState = updatedState;
      }
      job.metrics.totalLatencyMs += latencyMs;
      job.metrics.totalTokensProcessed += (promptTokens + completionTokens);
    }

    await this.writeAtomic(jobId, job);
    return job;
  }

  /**
   * Records an autonomous model switch event (e.g. 1.5B -> 0.5B fallback).
   */
  static async recordModelSwitch(jobId, fromModel, toModel, reason) {
    const job = await this.getJob(jobId);
    if (!job) return;

    job.metrics.modelSwitches.push({
      fromModel,
      toModel,
      reason,
      timestamp: new Date().toISOString()
    });
    job.model = toModel;
    await this.writeAtomic(jobId, job);
  }

  /**
   * Finalizes a job with synthesized security report.
   */
  static async finalizeJob(jobId, finalReport) {
    const job = await this.getJob(jobId);
    if (!job) {
      throw new Error(`Job not found: ${jobId}`);
    }

    job.status = 'COMPLETED';
    job.finalReport = finalReport;
    job.finishedAt = new Date().toISOString();
    job.updatedAt = new Date().toISOString();

    await this.writeAtomic(jobId, job);
    return job;
  }

  /**
   * Marks a job as failed with error details.
   */
  static async failJob(jobId, errorMessage) {
    const job = await this.getJob(jobId);
    if (!job) return;

    job.status = 'FAILED';
    job.error = errorMessage;
    job.updatedAt = new Date().toISOString();
    await this.writeAtomic(jobId, job);
  }

  /**
   * Determines exact resume point for interrupted jobs.
   */
  static async getResumePoint(jobId) {
    const job = await this.getJob(jobId);
    if (!job) return null;

    // Completed chunk indices
    const completedIndices = new Set(
      job.chunkRecords
        .filter(r => r.status === 'COMPLETED')
        .map(r => r.chunkIndex)
    );

    // Find first chunk index (1-indexed) not yet completed
    let resumeChunkIndex = 1;
    for (let i = 1; i <= job.totalChunks; i++) {
      if (!completedIndices.has(i)) {
        resumeChunkIndex = i;
        break;
      }
    }

    return {
      canResume: resumeChunkIndex <= job.totalChunks,
      resumeChunkIndex,
      completedChunks: completedIndices.size,
      totalChunks: job.totalChunks,
      workingState: job.workingState,
      completedFindings: job.rawFindings
    };
  }

  /**
   * Lists all jobs with summary info.
   */
  static async listJobs() {
    try {
      const files = await fs.readdir(CONFIG.PATHS.JOBS_DIR);
      const jobs = [];

      for (const file of files) {
        if (!file.endsWith('.json')) continue;
        try {
          const content = await fs.readFile(path.join(CONFIG.PATHS.JOBS_DIR, file), 'utf8');
          const job = JSON.parse(content);
          jobs.push({
            id: job.id,
            filename: job.filename,
            status: job.status,
            totalChunks: job.totalChunks,
            completedChunks: job.completedChunks,
            findingsCount: job.rawFindings?.length || 0,
            model: job.model,
            createdAt: job.createdAt,
            finishedAt: job.finishedAt
          });
        } catch (_) {
          // Ignore corrupt file
        }
      }

      // Sort newest first
      return jobs.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    } catch (err) {
      return [];
    }
  }

  /**
   * Atomic file writer: Writes to temp file first, then renames.
   * Prevents half-written / corrupted files during process termination.
   */
  static async writeAtomic(jobId, data) {
    const targetPath = this.getJobFilePath(jobId);
    const tempPath = `${targetPath}.${Date.now()}.tmp`;
    const jsonString = JSON.stringify(data, null, 2);

    await fs.writeFile(tempPath, jsonString, 'utf8');
    await fs.rename(tempPath, targetPath);
  }
}
