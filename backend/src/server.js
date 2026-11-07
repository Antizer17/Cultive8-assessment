import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { CONFIG } from './config.js';
import analysisRoutes from './routes/analysisRoutes.js';
import systemRoutes from './routes/systemRoutes.js';
import { OllamaClient } from './services/ollamaClient.js';
import { SystemMonitor } from './services/systemMonitor.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// Middlewares
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// API Routes
app.use('/api/analysis', analysisRoutes);
app.use('/api/system', systemRoutes);

// Optional: Serve frontend production build if present
const frontendDist = path.resolve(__dirname, '../../frontend/dist');
if (fs.existsSync(frontendDist)) {
  app.use(express.static(frontendDist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api')) return next();
    res.sendFile(path.join(frontendDist, 'index.html'));
  });
}

// Global 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({ error: `API route not found: ${req.method} ${req.baseUrl}` });
});

// Global Error Handler (Fault tolerance: never crash Express)
app.use((err, req, res, next) => {
  console.error('Unhandled Server Error:', err);
  res.status(500).json({
    error: err.message || 'Internal Server Error',
    timestamp: new Date().toISOString()
  });
});

// Start Server
const server = app.listen(CONFIG.PORT, CONFIG.HOST, async () => {
  console.log(`\n======================================================`);
  console.log(`🚀 Local AI Security Log Analyzer Backend`);
  console.log(`📡 Listening on: http://localhost:${CONFIG.PORT}`);
  console.log(`🛡️ RAM Ceiling: ${CONFIG.RAM.BUDGET_MB} MB | Context Window: ${CONFIG.TOKENS.TOTAL_CONTEXT_WINDOW} tokens`);
  console.log(`======================================================\n`);

  // Check Ollama status on startup
  const health = await OllamaClient.checkHealth();
  if (health.online) {
    console.log(`✅ Local AI Engine (Ollama): ONLINE`);
    console.log(`   - Available models: ${health.models.join(', ') || 'none'}`);
    console.log(`   - Primary Model (${CONFIG.MODELS.PRIMARY}): ${health.hasPrimary ? 'Ready ✅' : 'Not installed ⚠️'}`);
    console.log(`   - Fallback Model (${CONFIG.MODELS.FALLBACK}): ${health.hasFallback ? 'Ready ✅' : 'Not installed ⚠️'}`);
  } else {
    console.warn(`⚠️ Ollama not reachable at ${CONFIG.MODELS.OLLAMA_BASE_URL}. Ensure 'ollama serve' is running.`);
  }

  // Display initial system RAM baseline
  const metrics = await SystemMonitor.getMetrics();
  console.log(`📊 Initial RAM: Backend ${metrics.backendRamMB} MB | Model ~${metrics.modelRamMB} MB | Budget ${metrics.percentOfBudget}% used\n`);
});

// Graceful termination
process.on('SIGINT', () => {
  console.log('\nGracefully shutting down backend server...');
  server.close(() => process.exit(0));
});

export default app;
