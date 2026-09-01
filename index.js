import 'dotenv/config';
import express from 'express';
import authRoutes from './src/routes/auth.ts';
import applicationsRoutes from './src/routes/applications.ts';
import adminRoutes from './src/routes/admin.ts';
import exportRoutes from './src/routes/export.ts';

const app = express();
app.use(express.json());

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok' });
});

// Routes
app.use('/auth', authRoutes);
app.use('/applications', applicationsRoutes);
app.use('/admin', adminRoutes);
app.use('/export', exportRoutes);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

export default app;