import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CONFIG } from '../config.js';
import { JobStore } from '../services/jobStore.js';
import { splitLogsIntoChunks } from '../services/logSplitter.js';
import { countTokens } from '../services/tokenizer.js';
import { AnalysisEngine } from '../services/analysisEngine.js';
import { sseManager } from '../services/sseManager.js';

/**
 * Analysis Controller
 *
 * Handles HTTP requests for file uploads, analysis initiation, resumes,
 * Server-Sent Events streaming, job inspection, and audit report retrieval.
 */
export class AnalysisController {
  /**
   * POST /api/analysis/upload
   * Uploads a log file, validates boundaries, splits into token-budgeted chunks,
   * and creates a new pending job.
   */
  static async uploadFile(req, res) {
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No log file provided. Please upload a .log or .txt file.' });
      }

      const filePath = req.file.path;
      const rawContent = await fs.promises.readFile(filePath, 'utf8');

      if (!rawContent || rawContent.trim().length === 0) {
        await fs.promises.unlink(filePath).catch(() => {});
        return res.status(400).json({ error: 'Uploaded file is empty.' });
      }

      const lines = rawContent.split(/\r?\n/);
      const totalTokens = countTokens(rawContent);
      const chunks = splitLogsIntoChunks(rawContent, CONFIG.TOKENS.MAX_LOG_CHUNK_TOKENS);

      const jobId = `job-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const preferredModel = req.body.model || CONFIG.MODELS.PRIMARY;

      const job = await JobStore.createJob({
        jobId,
        filename: req.file.filename,
        fileSize: req.file.size,
        totalLines: lines.length,
        totalTokens,
        totalChunks: chunks.length,
        model: preferredModel
      });

      return res.status(201).json({
        success: true,
        jobId: job.id,
        filename: req.file.originalname,
        fileSize: job.fileSize,
        totalLines: job.totalLines,
        totalTokens: job.totalTokens,
        totalChunks: job.totalChunks,
        model: job.model,
        status: job.status
      });
    } catch (err) {
      console.error('Upload error in AnalysisController:', err);
      return res.status(500).json({ error: err.message || 'File upload failed.' });
    }
  }

  /**
   * POST /api/analysis/:id/start
   * Starts sequential processing queue for an uploaded job.
   */
  static async startAnalysis(req, res) {
    try {
      const { id } = req.params;
      const job = await JobStore.getJob(id);

      if (!job) {
        return res.status(404).json({ error: `Job not found: ${id}` });
      }

      if (job.status === 'PROCESSING' || AnalysisEngine.isJobRunning(id)) {
        return res.status(400).json({ message: 'Job is already in progress.', jobId: id });
      }

      // Launch sequential processing in background queue
      AnalysisEngine.processJobQueue(id, 1);

      return res.json({
        success: true,
        message: 'Analysis started successfully.',
        jobId: id,
        totalChunks: job.totalChunks
      });
    } catch (err) {
      console.error('Start error in AnalysisController:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/analysis/:id/resume
   * Resumes analysis from the first incomplete chunk.
   */
  static async resumeAnalysis(req, res) {
    try {
      const { id } = req.params;
      const resumeInfo = await JobStore.getResumePoint(id);

      if (!resumeInfo) {
        return res.status(404).json({ error: `Job not found: ${id}` });
      }

      if (!resumeInfo.canResume) {
        return res.status(400).json({ message: 'All chunks have already been processed.', jobId: id });
      }

      AnalysisEngine.processJobQueue(id, resumeInfo.resumeChunkIndex);

      return res.json({
        success: true,
        message: `Resumed analysis from chunk ${resumeInfo.resumeChunkIndex} of ${resumeInfo.totalChunks}.`,
        jobId: id,
        resumeChunkIndex: resumeInfo.resumeChunkIndex,
        completedChunks: resumeInfo.completedChunks,
        totalChunks: resumeInfo.totalChunks
      });
    } catch (err) {
      console.error('Resume error in AnalysisController:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /api/analysis/:id/stream
   * Server-Sent Events (SSE) live progress stream.
   */
  static streamProgress(req, res) {
    const { id } = req.params;

    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'Access-Control-Allow-Origin': '*'
    });
    res.write('\n');

    sseManager.addClient(id, res);
  }

  /**
   * GET /api/analysis/:id
   * Fetches current job details, progress, and findings.
   */
  static async getJobDetails(req, res) {
    try {
      const { id } = req.params;
      const job = await JobStore.getJob(id);

      if (!job) {
        return res.status(404).json({ error: `Job not found: ${id}` });
      }

      return res.json(job);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /api/analysis/:id/report
   * Returns the final synthesized security report.
   */
  static async getReport(req, res) {
    try {
      const { id } = req.params;
      const job = await JobStore.getJob(id);

      if (!job) {
        return res.status(404).json({ error: `Job not found: ${id}` });
      }

      if (job.status !== 'COMPLETED' || !job.finalReport) {
        return res.status(400).json({
          error: 'Final report is not ready yet.',
          status: job.status,
          completedChunks: job.completedChunks,
          totalChunks: job.totalChunks
        });
      }

      return res.json(job.finalReport);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /api/analysis
   * Lists all analysis jobs.
   */
  static async listJobs(req, res) {
    try {
      const jobs = await JobStore.listJobs();
      return res.json(jobs);
    } catch (err) {
      return res.status(500).json({ error: err.message });
    }
  }
}
