import express from 'express';
import multer from 'multer';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { CONFIG } from '../config.js';
import { JobStore } from '../services/jobStore.js';
import { splitLogsIntoChunks } from '../services/logSplitter.js';
import { countTokens } from '../services/tokenizer.js';
import { OllamaClient } from '../services/ollamaClient.js';
import { StateAccumulator } from '../services/stateAccumulator.js';
import { ReportSynthesizer } from '../services/reportSynthesizer.js';
import { SystemMonitor } from '../services/systemMonitor.js';

const router = express.Router();

// Ensure upload directory exists
if (!fs.existsSync(CONFIG.PATHS.UPLOADS_DIR)) {
  fs.mkdirSync(CONFIG.PATHS.UPLOADS_DIR, { recursive: true });
}

// Multer storage configuration for log files
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, CONFIG.PATHS.UPLOADS_DIR),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    const cleanName = path.basename(file.originalname, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
    cb(null, `${Date.now()}_${cleanName}${ext}`);
  }
});

// File filter: accept only .log and .txt files
const upload = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB max
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext === '.log' || ext === '.txt') {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only .log and .txt files are accepted.'));
    }
  }
});

// Map of active SSE client connections per jobId: jobId -> Set of res objects
const sseClients = new Map();

// Helper to broadcast SSE event to all connected clients for a job
function broadcastSse(jobId, eventType, data) {
  const clients = sseClients.get(jobId);
  if (clients && clients.size > 0) {
    const message = `event: ${eventType}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of clients) {
      try {
        res.write(message);
      } catch (_) {
        // Handled on close
      }
    }
  }
}

// Map of active worker loops to support graceful cancellation if needed
const activeJobs = new Map();

/**
 * Sequential background worker that processes chunks strictly 1 at a time
 * to keep RAM and 2 vCPU usage safely within limits.
 */
async function processJobQueue(jobId, startFromChunk = 1) {
  if (activeJobs.has(jobId)) {
    return; // Already running
  }
  activeJobs.set(jobId, true);

  try {
    const job = await JobStore.getJob(jobId);
    if (!job) return;

    // Load original file and split into chunks
    const uploadedFilePath = path.join(CONFIG.PATHS.UPLOADS_DIR, job.filename);
    let rawText = '';
    if (fs.existsSync(uploadedFilePath)) {
      rawText = fs.readFileSync(uploadedFilePath, 'utf8');
    } else {
      // Check project root fallback
      const rootPath = path.resolve('Cultive8_Workspace_Agrigen_Server.log');
      if (fs.existsSync(rootPath)) {
        rawText = fs.readFileSync(rootPath, 'utf8');
      } else {
        throw new Error(`Original log file not found for job ${jobId}`);
      }
    }

    const chunks = splitLogsIntoChunks(rawText, CONFIG.TOKENS.MAX_LOG_CHUNK_TOKENS);
    const state = new StateAccumulator(job.workingState);
    let currentModel = job.model || CONFIG.MODELS.PRIMARY;

    broadcastSse(jobId, 'analysis_started', {
      jobId,
      totalChunks: chunks.length,
      startFromChunk,
      activeModel: currentModel
    });

    for (let i = startFromChunk - 1; i < chunks.length; i++) {
      if (!activeJobs.get(jobId)) {
        console.log(`Job ${jobId} was paused or stopped.`);
        break;
      }

      const chunk = chunks[i];
      const chunkIndex = chunk.chunkIndex;

      // 1. Check RAM budget guardrails before calling model
      const metrics = await SystemMonitor.getMetrics(currentModel);
      if (metrics.shouldTriggerFallback && currentModel === CONFIG.MODELS.PRIMARY) {
        console.warn(`[RAM Guard] Combined RAM at ${metrics.combinedAppRamMB} MB (> 3400 MB). Downgrading to 0.5B.`);
        await JobStore.recordModelSwitch(jobId, CONFIG.MODELS.PRIMARY, CONFIG.MODELS.FALLBACK, 'RAM Guardrail: Memory exceeded 3,400 MB');
        currentModel = CONFIG.MODELS.FALLBACK;
        broadcastSse(jobId, 'model_fallback_triggered', {
          jobId,
          fromModel: CONFIG.MODELS.PRIMARY,
          toModel: CONFIG.MODELS.FALLBACK,
          reason: 'RAM Guardrail: System memory exceeded safe threshold'
        });
      }

      // 2. Prepare compact carried state for prompt (strictly <= 350 tokens)
      const carryoverState = state.serializeForPrompt();

      // 3. Execute model inference for current chunk
      const modelResult = await OllamaClient.analyzeChunk({
        chunkText: chunk.annotatedText,
        carryoverState,
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        preferredModel: currentModel
      });

      // Update model if fallback occurred during inference
      if (modelResult.wasFallback && currentModel !== CONFIG.MODELS.FALLBACK) {
        currentModel = CONFIG.MODELS.FALLBACK;
        await JobStore.recordModelSwitch(jobId, CONFIG.MODELS.PRIMARY, CONFIG.MODELS.FALLBACK, 'Inference Watchdog: Timeout or process error');
        broadcastSse(jobId, 'model_fallback_triggered', {
          jobId,
          fromModel: CONFIG.MODELS.PRIMARY,
          toModel: CONFIG.MODELS.FALLBACK,
          reason: 'Inference Watchdog: Primary model timed out or encountered an error'
        });
      }

      // 4. Ingest chunk telemetry & model findings into StateAccumulator
      const newIncidents = state.ingestChunkLines(chunk.lines);
      state.ingestModelFindings(modelResult.findings);

      // Combine model findings with any real-time multi-stage incidents
      const combinedChunkFindings = [...newIncidents, ...modelResult.findings];

      // 5. Persist chunk result and updated state to disk
      await JobStore.saveChunkResult({
        jobId,
        chunkIndex,
        findings: combinedChunkFindings,
        updatedState: state.getStateSnapshot(),
        latencyMs: modelResult.latencyMs,
        promptTokens: modelResult.promptTokens,
        completionTokens: modelResult.completionTokens,
        modelUsed: modelResult.modelUsed,
        error: modelResult.error || null
      });

      // 6. Broadcast live progress to SSE clients
      const latestRam = await SystemMonitor.getMetrics(currentModel);
      broadcastSse(jobId, 'chunk_progress', {
        jobId,
        chunkIndex,
        totalChunks: chunks.length,
        percentComplete: Math.round((chunkIndex / chunks.length) * 100),
        startLine: chunk.startLine,
        endLine: chunk.endLine,
        tokensInChunk: chunk.tokenCount,
        latencyMs: modelResult.latencyMs,
        promptTokens: modelResult.promptTokens,
        completionTokens: modelResult.completionTokens,
        modelUsed: modelResult.modelUsed,
        findingsInChunk: combinedChunkFindings.length,
        ramMetrics: {
          combinedAppRamMB: latestRam.combinedAppRamMB,
          percentOfBudget: latestRam.percentOfBudget,
          isHealthy: latestRam.isHealthy
        },
        activeSuspects: Object.keys(state.suspects).length
      });
    }

    // All chunks finished: Execute Final Synthesis & Deduplication Pass
    const updatedJob = await JobStore.getJob(jobId);
    const finalReport = ReportSynthesizer.synthesize(
      updatedJob.rawFindings || [],
      state.getStateSnapshot()
    );

    await JobStore.finalizeJob(jobId, finalReport);

    broadcastSse(jobId, 'analysis_completed', {
      jobId,
      status: 'COMPLETED',
      summary: finalReport.summary,
      totalFindings: finalReport.findings.length
    });
  } catch (err) {
    console.error(`Error processing job ${jobId}:`, err);
    await JobStore.failJob(jobId, err.message);
    broadcastSse(jobId, 'analysis_failed', {
      jobId,
      error: err.message
    });
  } finally {
    activeJobs.delete(jobId);
  }
}

/**
 * POST /api/analysis/upload
 * Uploads a log file, validates boundaries, splits into token-budgeted chunks,
 * and creates a new pending job.
 */
router.post('/upload', upload.single('file'), async (req, res) => {
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

    res.status(201).json({
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
    console.error('Upload error:', err);
    res.status(500).json({ error: err.message || 'File upload failed.' });
  }
});

/**
 * POST /api/analysis/:id/start
 * Starts sequential processing queue for an uploaded job.
 */
router.post('/:id/start', async (req, res) => {
  const { id } = req.params;
  const job = await JobStore.getJob(id);

  if (!job) {
    return res.status(404).json({ error: `Job not found: ${id}` });
  }

  if (job.status === 'PROCESSING') {
    return res.status(400).json({ message: 'Job is already in progress.', jobId: id });
  }

  // Start sequential processing in background
  processJobQueue(id, 1);

  res.json({
    success: true,
    message: 'Analysis started successfully.',
    jobId: id,
    totalChunks: job.totalChunks
  });
});

/**
 * POST /api/analysis/:id/resume
 * Resumes analysis from the first incomplete chunk.
 */
router.post('/:id/resume', async (req, res) => {
  const { id } = req.params;
  const resumeInfo = await JobStore.getResumePoint(id);

  if (!resumeInfo) {
    return res.status(404).json({ error: `Job not found: ${id}` });
  }

  if (!resumeInfo.canResume) {
    return res.status(400).json({ message: 'All chunks have already been processed.', jobId: id });
  }

  processJobQueue(id, resumeInfo.resumeChunkIndex);

  res.json({
    success: true,
    message: `Resumed analysis from chunk ${resumeInfo.resumeChunkIndex} of ${resumeInfo.totalChunks}.`,
    jobId: id,
    resumeChunkIndex: resumeInfo.resumeChunkIndex,
    completedChunks: resumeInfo.completedChunks,
    totalChunks: resumeInfo.totalChunks
  });
});

/**
 * GET /api/analysis/:id/stream
 * Server-Sent Events (SSE) live progress stream.
 */
router.get('/:id/stream', (req, res) => {
  const { id } = req.params;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  res.write('\n');

  if (!sseClients.has(id)) {
    sseClients.set(id, new Set());
  }
  sseClients.get(id).add(res);

  // Send initial connection event
  res.write(`event: connected\ndata: ${JSON.stringify({ jobId: id, time: new Date().toISOString() })}\n\n`);

  req.on('close', () => {
    const clients = sseClients.get(id);
    if (clients) {
      clients.delete(res);
      if (clients.size === 0) {
        sseClients.delete(id);
      }
    }
  });
});

/**
 * GET /api/analysis/:id
 * Fetches current job details, progress, and findings.
 */
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  const job = await JobStore.getJob(id);

  if (!job) {
    return res.status(404).json({ error: `Job not found: ${id}` });
  }

  res.json(job);
});

/**
 * GET /api/analysis/:id/report
 * Returns the final synthesized security report.
 */
router.get('/:id/report', async (req, res) => {
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

  res.json(job.finalReport);
});

/**
 * GET /api/analysis
 * Lists all analysis jobs.
 */
router.get('/', async (req, res) => {
  const jobs = await JobStore.listJobs();
  res.json(jobs);
});

export default router;
