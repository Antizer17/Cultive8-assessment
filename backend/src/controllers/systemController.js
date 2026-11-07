import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { SystemMonitor } from '../services/systemMonitor.js';
import { OllamaClient } from '../services/ollamaClient.js';
import { JobStore } from '../services/jobStore.js';
import { splitLogsIntoChunks } from '../services/logSplitter.js';
import { countTokens } from '../services/tokenizer.js';
import { CONFIG } from '../config.js';

/**
 * System Controller
 *
 * Handles HTTP requests for real-time 4 GB RAM telemetry,
 * local Ollama engine health and model discovery, and 1-click dataset quick-load.
 */
export class SystemController {
  /**
   * GET /api/system/metrics
   * Returns real-time RAM usage, 4 GB budget breakdown, and health status.
   */
  static async getMetrics(req, res) {
    try {
      const currentModel = req.query.model || CONFIG.MODELS.PRIMARY;
      const metrics = await SystemMonitor.getMetrics(currentModel);
      return res.json(metrics);
    } catch (err) {
      console.error('Metrics error in SystemController:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * GET /api/system/models
   * Returns local Ollama connectivity status and installed models.
   */
  static async getModels(req, res) {
    try {
      const health = await OllamaClient.checkHealth();
      return res.json({
        ...health,
        primaryModel: CONFIG.MODELS.PRIMARY,
        fallbackModel: CONFIG.MODELS.FALLBACK,
        budgetLimitMB: CONFIG.RAM.BUDGET_MB,
        contextLimit: CONFIG.TOKENS.TOTAL_CONTEXT_WINDOW
      });
    } catch (err) {
      console.error('Models error in SystemController:', err);
      return res.status(500).json({ error: err.message });
    }
  }

  /**
   * POST /api/system/quick-load-target
   * One-click helper: Automatically loads Cultive8_Workspace_Agrigen_Server.log
   * into a new analysis job for fast testing and demonstration.
   */
  static async quickLoadTarget(req, res) {
    try {
      const candidatePaths = [
        path.resolve('Cultive8_Workspace_Agrigen_Server.log'),
        path.resolve('../Cultive8_Workspace_Agrigen_Server.log'),
        path.join(CONFIG.PATHS.DATA_DIR, 'Cultive8_Workspace_Agrigen_Server.log')
      ];

      const targetPath = candidatePaths.find(p => fs.existsSync(p));
      if (!targetPath) {
        return res.status(404).json({ error: 'Target log file Cultive8_Workspace_Agrigen_Server.log not found on server.' });
      }

      const rawContent = await fs.promises.readFile(targetPath, 'utf8');
      const lines = rawContent.split(/\r?\n/);
      const totalTokens = countTokens(rawContent);
      const chunks = splitLogsIntoChunks(rawContent, CONFIG.TOKENS.MAX_LOG_CHUNK_TOKENS);

      // Copy to uploads folder
      const targetFilename = `target_${Date.now()}_Cultive8_Workspace_Agrigen_Server.log`;
      const destPath = path.join(CONFIG.PATHS.UPLOADS_DIR, targetFilename);
      await fs.promises.copyFile(targetPath, destPath);

      const jobId = `job-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
      const preferredModel = req.body.model || CONFIG.MODELS.PRIMARY;

      const job = await JobStore.createJob({
        jobId,
        filename: targetFilename,
        fileSize: rawContent.length,
        totalLines: lines.length,
        totalTokens,
        totalChunks: chunks.length,
        model: preferredModel
      });

      return res.status(201).json({
        success: true,
        jobId: job.id,
        filename: 'Cultive8_Workspace_Agrigen_Server.log',
        fileSize: job.fileSize,
        totalLines: job.totalLines,
        totalTokens: job.totalTokens,
        totalChunks: job.totalChunks,
        model: job.model,
        status: job.status
      });
    } catch (err) {
      console.error('QuickLoad error in SystemController:', err);
      return res.status(500).json({ error: err.message });
    }
  }
}
