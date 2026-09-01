import express from 'express';
import { db } from '../prisma/db';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.use(authMiddleware);

router.get('/stats', async (req, res) => {
  const stats = await db.users
    .select('id', 'email')
    .include('applications', (apps) =>
      apps.combine({
        totalApplications: apps.count(),
        lastAppliedAt: apps.max((app) => app.appliedDate),
      })
    )
    .all();
  res.json(stats);
});

export default router;
