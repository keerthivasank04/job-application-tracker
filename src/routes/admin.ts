import express, { type Request, type Response } from 'express';
import { db } from '../prisma/db';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.use(authMiddleware);

router.get('/stats', async (req: Request, res: Response) => {
  try {
    const stats = await db.orm.User
      .select('id', 'email')
      .include('applications', (apps: any) =>
        apps.combine({
          totalApplications: apps.count(),
          lastAppliedAt: apps.max('appliedDate'),
        })
      )
      .all();

    res.json(stats);
  } catch (error) {
    console.error('Admin stats error:', error);
    res.status(500).json({ error: 'Failed to fetch admin stats' });
  }
});

export default router;
