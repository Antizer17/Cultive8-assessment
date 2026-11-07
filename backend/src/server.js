import express from 'express';
import cors from 'cors';
import { CONFIG } from './config.js';
import analysisRoutes from './routes/analysisRoutes.js';
import systemRoutes from './routes/systemRoutes.js';

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/analysis', analysisRoutes);
app.use('/api/system', systemRoutes);

// Placeholder stub: will bind server and initialize workers
console.log(`Backend stub initialized on port ${CONFIG.PORT}`);
