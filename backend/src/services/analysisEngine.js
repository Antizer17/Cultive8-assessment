import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config.js';
import { JobStore } from './jobStore.js';
import { splitLogsIntoChunks } from './logSplitter.js';
import { OllamaClient } from './ollamaClient.js';
import { StateAccumulator } from './stateAccumulator.js';
import { ReportSynthesizer } from './reportSynthesizer.js';
import { SystemMonitor } from './systemMonitor.js';
import { sseManager } from './sseManager.js';
import { AllowlistManager } from './allowlistManager.js';

/**
 * Analysis Engine Service
 *
 * Coordinates the sequential, stateful execution loop across token-budgeted log chunks.
 * Enforces pure 2 vCPU sequential scheduling to eliminate CPU thrashing and prevent RAM spikes.
 */
export class AnalysisEngine {
  // Set of actively running job IDs
  static activeJobs = new Set();

  /**
   * Checks whether a job is currently executing in the queue.
   */
  static isJobRunning(jobId) {
    return this.activeJobs.has(jobId);
  }

  /**
   * Cancels or stops an in-flight job execution.
   */
  static stopJob(jobId) {
    this.activeJobs.delete(jobId);
  }

  /**
   * Sequential background worker that processes chunks strictly 1 at a time.
   *
   * @param {string} jobId - Unique identifier of the analysis job
   * @param {number} [startFromChunk=1] - Chunk index to start or resume from
   */
  static async processJobQueue(jobId, startFromChunk = 1) {
    if (this.activeJobs.has(jobId)) {
      return; // Already running
    }
    this.activeJobs.add(jobId);

    try {
      const job = await JobStore.getJob(jobId);
      if (!job) return;

      // Load original log file
      const uploadedFilePath = path.join(CONFIG.PATHS.UPLOADS_DIR, job.filename);
      let rawText = '';
      if (fs.existsSync(uploadedFilePath)) {
        rawText = fs.readFileSync(uploadedFilePath, 'utf8');
      } else {
        const rootPath = path.resolve('Cultive8_Workspace_Agrigen_Server.log');
        if (fs.existsSync(rootPath)) {
          rawText = fs.readFileSync(rootPath, 'utf8');
        } else {
          throw new Error(`Original log file not found for job ${jobId}`);
        }
      }

      // Build 1-indexed raw lines map for precision grounding
      const rawLinesArray = rawText.split(/\r?\n/);
      const rawLinesMap = new Map();
      rawLinesArray.forEach((line, idx) => rawLinesMap.set(idx + 1, line));

      const chunks = splitLogsIntoChunks(rawText, CONFIG.TOKENS.MAX_LOG_CHUNK_TOKENS);
      const state = new StateAccumulator(job.workingState);
      let currentModel = job.model || CONFIG.MODELS.PRIMARY;

      sseManager.broadcast(jobId, 'analysis_started', {
        jobId,
        totalChunks: chunks.length,
        startFromChunk,
        activeModel: currentModel
      });

      for (let i = startFromChunk - 1; i < chunks.length; i++) {
        if (!this.activeJobs.has(jobId)) {
          console.log(`Job ${jobId} was paused or stopped.`);
          break;
        }

        const chunk = chunks[i];
        const chunkIndex = chunk.chunkIndex;

        // 1. Check RAM budget guardrails before calling local model
        const metrics = await SystemMonitor.getMetrics(currentModel);
        if (metrics.shouldTriggerFallback && currentModel === CONFIG.MODELS.PRIMARY) {
          console.warn(`[RAM Guard] Combined RAM at ${metrics.combinedAppRamMB} MB (> 3400 MB). Downgrading to 0.5B.`);
          await JobStore.recordModelSwitch(jobId, CONFIG.MODELS.PRIMARY, CONFIG.MODELS.FALLBACK, 'RAM Guardrail: Memory exceeded 3,400 MB');
          currentModel = CONFIG.MODELS.FALLBACK;
          sseManager.broadcast(jobId, 'model_fallback_triggered', {
            jobId,
            fromModel: CONFIG.MODELS.PRIMARY,
            toModel: CONFIG.MODELS.FALLBACK,
            reason: 'RAM Guardrail: System memory exceeded safe threshold'
          });
        }

        // 2. Prepare compact carried state for prompt (strictly <= 350 tokens)
        const carryoverState = state.serializeForPrompt();

        // 3. Ingest chunk telemetry into StateAccumulator
        const newIncidents = state.ingestChunkLines(chunk.lines);

        // 4. Identify candidate security events in current chunk using standard telemetry attributes
        const candidateLines = chunk.lines.filter(l => {
          let entry = null;
          try { entry = JSON.parse(l.rawText); } catch (_) {}
          if (!entry) return false;
          // Whitelist operational checks using separate configurable allowlist
          if (AllowlistManager.isOperationalCheck(entry)) return false;
          // Prompt injection & explicit security rules
          if (entry.validation_error || entry.security_rule || entry.submitted_text) return true;
          // SQL injection in path/query parameters
          if (entry.path && (entry.path.includes('SELECT') || entry.path.includes('UNION') || entry.path.includes('SLEEP') || entry.path.includes('OR%201') || entry.path.includes('1%3D1'))) return true;
          // Path traversal and sensitive file probes
          if (entry.path && (entry.path.includes('..') || entry.path.includes('%2e%2e') || entry.path.includes('/admin/settings') || entry.path.includes('/phpmyadmin') || entry.path.includes('/server-status'))) return true;
          // Rate abuse: HTTP 429 Too Many Requests or high requests_in_window
          if (entry.status === 429 || (entry.requests_in_window && Number(entry.requests_in_window) > 100)) return true;
          // WAF / Gateway flagged 400 events
          if (entry.status === 400 && entry.event_id) return true;
          return false;
        });

        const chunkFindings = [];
        let totalLatencyMs = 0;
        let totalPromptTokens = 0;
        let totalCompletionTokens = 0;

        // Group candidate lines by client IP for unified, high-accuracy context
        const ipCandidateMap = new Map();
        for (const cand of candidateLines) {
          let entry = null;
          try { entry = JSON.parse(cand.rawText); } catch (_) {}
          if (!entry || !entry.client_ip) continue;
          if (!ipCandidateMap.has(entry.client_ip)) {
            ipCandidateMap.set(entry.client_ip, []);
          }
          ipCandidateMap.get(entry.client_ip).push({ cand, entry });
        }

        // Evaluate candidate events with Ollama (isolating context strictly to that specific client IP)
        for (const [candidateIp, items] of ipCandidateMap.entries()) {
          const primaryEntry = items[0].entry;
          const lineNumbers = items.map(it => it.cand.lineNumber);
          const ipSuspect = state.suspects[candidateIp];

          // Format computed telemetry facts (per-IP peak requests_in_window, 429 count, failed logins)
          const computedFacts = [];
          if (ipSuspect?.failedLogins > 0) computedFacts.push(`Failed logins count: ${ipSuspect.failedLogins}`);
          if (ipSuspect?.peakRequestsInWindow > 0) computedFacts.push(`Peak requests_in_window: ${ipSuspect.peakRequestsInWindow}`);
          if (ipSuspect?.status429Count > 0) computedFacts.push(`HTTP 429 Too Many Requests count: ${ipSuspect.status429Count}`);
          const computedTelemetry = computedFacts.join(', ');

          const ipContext = ipSuspect && ipSuspect.failedLogins > 0
            ? `IP ${candidateIp} has ${ipSuspect.failedLogins} prior failed login attempts targeting ${Array.from(ipSuspect.targetedUsernames).join(', ') || 'accounts'}.`
            : null;

          const eventRes = await OllamaClient.analyzeSecurityEvent({
            ip: candidateIp,
            lines: lineNumbers,
            action: `${primaryEntry.method || 'GET'} ${primaryEntry.path || ''} -> HTTP ${primaryEntry.status}`,
            payload: primaryEntry.submitted_text || primaryEntry.path,
            error: primaryEntry.validation_error || primaryEntry.security_rule || (primaryEntry.status === 429 ? 'HTTP 429 Too Many Requests' : null),
            computedTelemetry,
            priorContext: ipContext,
            preferredModel: currentModel
          });

          totalLatencyMs += eventRes.latencyMs || 0;
          totalPromptTokens += eventRes.promptTokens || 0;
          totalCompletionTokens += eventRes.completionTokens || 0;
          if (eventRes.findings && eventRes.findings.length > 0) {
            chunkFindings.push(...eventRes.findings);
          }
        }

        // Evaluate multi-stage incidents (Compromise / Exfiltration) with Ollama
        for (const inc of newIncidents) {
          const suspect = state.suspects[inc.target_or_attacker_id];
          const narrativeRes = await OllamaClient.analyzeSecurityEvent({
            ip: inc.target_or_attacker_id,
            lines: inc.evidence_lines,
            action: inc.attack_type,
            priorContext: `Suspect IP had ${suspect?.failedLogins || 0} failed login attempts prior to this event.`,
            preferredModel: currentModel
          });
          totalLatencyMs += narrativeRes.latencyMs || 0;
          totalPromptTokens += narrativeRes.promptTokens || 0;
          totalCompletionTokens += narrativeRes.completionTokens || 0;
          if (narrativeRes.findings && narrativeRes.findings.length > 0) {
            chunkFindings.push(...narrativeRes.findings);
          } else {
            chunkFindings.push(inc);
          }
        }

        // If no candidate events were in this chunk, do a quick chunk check with Ollama
        if (candidateLines.length === 0 && newIncidents.length === 0) {
          const modelResult = await OllamaClient.analyzeChunk({
            chunkText: chunk.annotatedText,
            carryoverState,
            startLine: chunk.startLine,
            endLine: chunk.endLine,
            preferredModel: currentModel
          });
          totalLatencyMs += modelResult.latencyMs || 0;
          totalPromptTokens += modelResult.promptTokens || 0;
          totalCompletionTokens += modelResult.completionTokens || 0;
          if (modelResult.findings && modelResult.findings.length > 0) {
            chunkFindings.push(...modelResult.findings);
          }
        }

        // Validate & ground all findings against true file line telemetry
        const validatedFindings = chunkFindings
          .map(f => ReportSynthesizer.groundFinding(f, rawLinesMap))
          .filter(Boolean);

        state.ingestModelFindings(validatedFindings);

        // 5. Persist chunk result and updated state to disk
        const savedJob = await JobStore.saveChunkResult({
          jobId,
          chunkIndex,
          findings: validatedFindings,
          updatedState: state.getStateSnapshot(),
          latencyMs: totalLatencyMs,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          modelUsed: currentModel,
          error: null
        });

        // 6. Broadcast live progress to SSE clients
        const latestRam = await SystemMonitor.getMetrics(currentModel);
        sseManager.broadcast(jobId, 'chunk_progress', {
          jobId,
          chunkIndex,
          totalChunks: chunks.length,
          percentComplete: Math.round((chunkIndex / chunks.length) * 100),
          startLine: chunk.startLine,
          endLine: chunk.endLine,
          tokensInChunk: chunk.tokenCount,
          totalTokensProcessed: savedJob.metrics?.totalTokensProcessed || (chunk.tokenCount * chunkIndex),
          latencyMs: totalLatencyMs,
          promptTokens: totalPromptTokens,
          completionTokens: totalCompletionTokens,
          modelUsed: currentModel,
          findingsInChunk: validatedFindings.length,
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
        state.getStateSnapshot(),
        rawLinesMap
      );

      if (finalReport.summary) {
        finalReport.summary.totalTokensProcessed = updatedJob.metrics?.totalTokensProcessed || 0;
      }

      await JobStore.finalizeJob(jobId, finalReport);

      sseManager.broadcast(jobId, 'analysis_completed', {
        jobId,
        status: 'COMPLETED',
        summary: finalReport.summary,
        totalTokensProcessed: updatedJob.metrics?.totalTokensProcessed || 0,
        totalFindings: finalReport.findings.length
      });
    } catch (err) {
      console.error(`Error processing job ${jobId}:`, err);
      await JobStore.failJob(jobId, err.message);
      sseManager.broadcast(jobId, 'analysis_failed', {
        jobId,
        error: err.message
      });
    } finally {
      this.activeJobs.delete(jobId);
    }
  }
}
