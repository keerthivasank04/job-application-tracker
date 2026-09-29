import express, { type Request, type Response } from 'express';
import { db } from '../prisma/db';
import { authMiddleware } from '../middleware/auth';
import { toIsoTimestamp } from '../utils/serialize';

const router = express.Router();

const COLUMNS = [
  'id',
  'company',
  'role',
  'status',
  'jobLocation',
  'salaryMin',
  'salaryMax',
  'currency',
  'jobPostUrl',
  'appliedDate',
  'notes',
] as const;

/** RFC 4180 field escaping; also neutralises spreadsheet formula injection. */
function escapeCsv(value: unknown): string {
  if (value === null || value === undefined) return '';
  let str = String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return /[",\r\n]/.test(str) || str !== String(value) ? `"${str.replace(/"/g, '""')}"` : str;
}

router.get('/csv', authMiddleware, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const applications = await db.orm.public.Application
      .where({ userId })
      .orderBy((a: any) => a.appliedDate.desc())
      .all();

    const date = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="applications-${date}.csv"`);

    res.write(`${COLUMNS.join(',')}\r\n`);
    for (const app of applications) {
      const row = COLUMNS.map((col) =>
        escapeCsv(col === 'appliedDate' ? toIsoTimestamp(app.appliedDate) : (app as any)[col])
      );
      res.write(`${row.join(',')}\r\n`);
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
