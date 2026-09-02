import 'dotenv/config';
import express from 'express';
import authRoutes from './routes/auth';
import applicationsRoutes from './routes/applications';
import adminRoutes from './routes/admin';
import exportRoutes from './routes/export';

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// Mount Routes
app.use('/auth', authRoutes);
app.use('/applications', applicationsRoutes);
app.use('/admin', adminRoutes);
app.use('/export', exportRoutes);

export default app;
