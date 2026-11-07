import express from 'express';
import { SystemController } from '../controllers/systemController.js';

const router = express.Router();

/**
 * System Routes
 *
 * Maps HTTP methods and endpoints strictly to SystemController actions.
 */

// Real-time RAM metrics and 4 GB budget breakdown
router.get('/metrics', SystemController.getMetrics);

// Local Ollama connectivity and installed models
router.get('/models', SystemController.getModels);

// 1-Click quick load helper for target dataset
router.post('/quick-load-target', SystemController.quickLoadTarget);

export default router;
