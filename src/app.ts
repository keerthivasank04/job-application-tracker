import 'dotenv/config';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import { generalLimiter } from './middleware/rate-limiter';
import { setupSwagger } from './docs/swagger';
import authRoutes from './routes/auth';
import applicationsRoutes from './routes/applications';
import adminRoutes from './routes/admin';
import exportRoutes from './routes/export';

const app = express();

// Security HTTP headers
app.use(helmet());

// Cross-Origin Resource Sharing
app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
  methods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// Body parsing
app.use(express.json({ limit: '100kb' }));

// Global rate limiter for API requests
app.use(generalLimiter);

// Interactive OpenAPI / Swagger Documentation
setupSwagger(app);

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Mount Application Routes
app.use('/auth', authRoutes);
app.use('/applications', applicationsRoutes);
app.use('/admin', adminRoutes);
app.use('/export', exportRoutes);

export default app;
