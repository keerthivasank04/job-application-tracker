import express, { type Request, type Response } from 'express';
import { db } from '../prisma/db';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.get('/csv', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', 'attachment; filename="applications.csv"');
    res.write('id,company,role,status,appliedDate\n');

    for await (const app of db.orm.Application
      .where({ userId })
      .orderBy((a: any) => a.appliedDate.desc())
      .all()) {
      const dateStr = app.appliedDate ? app.appliedDate.toISOString() : '';
      const escapeCsv = (val: string) => `"${(val || '').replace(/"/g, '""')}"`;
      res.write(
        `${app.id},${escapeCsv(app.company)},${escapeCsv(app.role)},${escapeCsv(app.status)},${dateStr}\n`
      );
    }
    res.end();
  } catch (error) {
    console.error('Export CSV error:', error);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Failed to export CSV' });
    } else {
      res.end();
    }
  }
});

export default router;
