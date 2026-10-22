import express from 'express';
import cors from 'cors';
import mongoose from 'mongoose';
import { config } from './config.js';
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFound } from './middleware/errors.js';
import authRoutes from './routes/auth.js';
import workspaceRoutes from './routes/workspaces.js';
import paperRoutes from './routes/papers.js';
import { resumePendingJobs } from './services/processingQueue.js';

const app = express();
app.use(cors({ origin: config.clientOrigin }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', async (_req, res) => {
  let ai = 'down';
  try {
    const r = await fetch(`${config.aiServiceUrl}/health`, { signal: AbortSignal.timeout(3000) });
    ai = r.ok ? 'up' : 'down';
  } catch { /* AI service not running */ }
  res.json({ api: 'up', db: mongoose.connection.readyState === 1 ? 'up' : 'down', ai });
});

app.use('/api/auth', authRoutes);
app.use('/api/workspaces', requireAuth, workspaceRoutes);
app.use('/api/papers', requireAuth, paperRoutes);
app.use(notFound);
app.use(errorHandler);

async function start() {
  await mongoose.connect(config.mongoUri);
  console.log('Connected to MongoDB');
  app.listen(config.port, () => console.log(`API listening on http://localhost:${config.port}`));
  await resumePendingJobs();
}

start().catch((err) => {
  console.error('Failed to start server:', err.message);
  process.exit(1);
});
