import 'dotenv/config';
import path from 'path';
import express, { type Request, type Response, type NextFunction } from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { db } from './prisma/db';
import { generalLimiter } from './middleware/rate-limiter';
import { notFoundHandler } from './middleware/not-found';
import { errorHandler } from './middleware/error-handler';
import { setupSwagger } from './docs/swagger';
import authRoutes from './routes/auth';
import applicationsRoutes from './routes/applications';
import adminRoutes from './routes/admin';
import exportRoutes from './routes/export';
import interviewRoutes from './routes/interviews';

const app = express();

// Security HTTP headers (CSP disabled so the embedded SPA can load Tailwind CDN and fonts)
app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);

// Cross-Origin Resource Sharing
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '100kb' }));

// Serve frontend static dashboard files from public/ directory
app.use(express.static(path.resolve('public')));

// Request performance logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    if (req.originalUrl !== '/health' && !req.originalUrl.startsWith('/api-docs')) {
      const duration = Date.now() - start;
      console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`);
    }
  });
  next();
});

// Global rate limiter for API requests
app.use(generalLimiter);

// Interactive OpenAPI / Swagger Documentation
setupSwagger(app);

// Readiness and liveness health check endpoint
app.get('/health', async (_req: Request, res: Response) => {
  let dbStatus = 'connected';
  try {
    // Fast lightweight verification of database connectivity
    await db.orm.User.where({ id: 0 }).first();
  } catch {
    dbStatus = 'disconnected';
  }

  const payload = {
    status: dbStatus === 'connected' ? 'ok' : 'degraded',
    uptime: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
    database: dbStatus,
    memory: {
      rss: `${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`,
    },
  };

  const statusCode = dbStatus === 'connected' ? 200 : 503;
  res.status(statusCode).json(payload);
});

// Root route: Serve frontend application
app.get('/', (_req: Request, res: Response) => {
  res.sendFile(path.resolve('public', 'index.html'));
});

// Mount Application Routes
app.use('/auth', authRoutes);
app.use('/applications', applicationsRoutes);
app.use('/admin', adminRoutes);
app.use('/export', exportRoutes);
app.use('/interviews', interviewRoutes);

// Catch-all 404 for undefined routes
app.use(notFoundHandler);

// Centralized error handler
app.use(errorHandler);

export default app;
