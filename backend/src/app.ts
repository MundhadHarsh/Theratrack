import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';

import { checkDbHealth } from './config/db';
import { analysisClient } from './services/analysisClient';
import authRoutes from './routes/auth.routes';
import thermalRoutes from './routes/thermal.routes';
import sessionRoutes from './routes/session.routes';
import baselineRoutes, { handleSessionCompare } from './routes/baseline.routes';
import dashboardRoutes from './routes/dashboard.routes';
import exportRoutes from './routes/export.routes';
import demoRoutes from './routes/demo.routes';
import { authMiddleware } from './middleware/auth';

const app = express();

// Security & CORS
const allowedOrigin = process.env.CORS_ORIGIN || 'http://localhost:5173';
app.use(
  cors({
    origin: (origin, callback) => {
      // Allow local development ports
      if (!origin || origin.startsWith('http://localhost') || origin.startsWith('http://127.0.0.1')) {
        callback(null, true);
      } else {
        callback(null, true); // Permissive for local prototype demo
      }
    },
    credentials: true,
  })
);

app.use(cookieParser());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Rate limit for authentication
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100, // 100 auth attempts per 15 min
  message: { error: 'Too many authentication attempts. Please try again later.' },
});

// Mount Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/thermal', thermalRoutes);
app.use('/api/sessions', sessionRoutes);
app.use('/api/baselines', baselineRoutes);
app.use('/api/dashboard', dashboardRoutes);
app.use('/api/sessions', exportRoutes); // /api/sessions/:id/export
app.use('/api/demo', demoRoutes);

// Comparison route directly on sessions endpoint as well: /api/sessions/:id/compare
app.post('/api/sessions/:id/compare', authMiddleware, handleSessionCompare);

// Image Serving Route (with strict path-traversal prevention)
const DATA_DIR = path.resolve(__dirname, '..', '..', 'data');
app.get('/api/images/:folder/:filename', (req: Request, res: Response) => {
  const folder = String(req.params.folder);
  const filename = String(req.params.filename);
  const allowedFolders = ['samples', 'uploads', 'processed'];

  if (!allowedFolders.includes(folder)) {
    res.status(400).json({ error: 'Invalid folder' });
    return;
  }

  // Sanitize filename to prevent directory traversal
  const safeFilename = path.basename(filename);
  const filePath = path.join(DATA_DIR, folder, safeFilename);

  if (!fs.existsSync(filePath)) {
    res.status(404).json({ error: 'Image file not found' });
    return;
  }

  const ext = path.extname(safeFilename).toLowerCase();
  const mimeTypes: Record<string, string> = {
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.bmp': 'image/bmp',
    '.tiff': 'image/tiff',
  };

  res.setHeader('Content-Type', mimeTypes[ext] || 'image/png');
  res.sendFile(filePath);
});

// GET /api/health
app.get('/api/health', async (req: Request, res: Response) => {
  const dbStatus = await checkDbHealth();
  const pythonStatus = await analysisClient.checkHealth();

  const isHealthy = dbStatus.status === 'healthy';

  res.status(isHealthy ? 200 : 503).json({
    status: isHealthy ? 'healthy' : 'degraded',
    service: 'TheraTrack Node.js Backend',
    database: dbStatus,
    pythonAnalysisService: pythonStatus,
    timestamp: new Date().toISOString(),
  });
});

// 404 Handler
app.use((req: Request, res: Response) => {
  res.status(404).json({ error: `Route '${req.method} ${req.path}' not found` });
});

// Global Error Handler
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error('[Unhandled Error]', err);
  res.status(err.status || 500).json({
    error: err.message || 'Internal Server Error',
  });
});

export default app;
