import express from 'express';
import { AnalysisController } from '../controllers/analysisController.js';
import { uploadMiddleware } from '../middleware/uploadMiddleware.js';

const router = express.Router();

/**
 * Analysis Routes
 *
 * Maps HTTP methods and endpoints strictly to AnalysisController actions.
 */

// Upload a log file and split into token-budgeted chunks
router.post('/upload', uploadMiddleware.single('file'), AnalysisController.uploadFile);

// Start sequential background analysis queue
router.post('/:id/start', AnalysisController.startAnalysis);

// Resume analysis from last completed chunk checkpoint
router.post('/:id/resume', AnalysisController.resumeAnalysis);

// Server-Sent Events (SSE) live progress stream
router.get('/:id/stream', AnalysisController.streamProgress);

// Get current job state and chunk progress
router.get('/:id', AnalysisController.getJobDetails);

// Get finalized synthesized security report
router.get('/:id/report', AnalysisController.getReport);

// List all jobs
router.get('/', AnalysisController.listJobs);

export default router;
