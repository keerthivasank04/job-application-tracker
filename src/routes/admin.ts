import express, { type Request, type Response, type NextFunction } from 'express';
import { db } from '../prisma/db';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.use(authMiddleware);

/**
 * Admin access is granted to the comma-separated email list in ADMIN_EMAILS.
 * Without it, no one can read cross-user metrics (previously any logged-in user could).
 */
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const admins = (process.env.ADMIN_EMAILS || '')
    .split(',')
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);

  const email = req.user?.email?.toLowerCase();
  if (!email || !admins.includes(email)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

router.get('/stats', requireAdmin, async (_req: Request, res: Response) => {
  try {
    const stats = await db.orm.public.User
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
