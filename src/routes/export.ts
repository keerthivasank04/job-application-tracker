import express from 'express';
import { db } from '../prisma/db';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.get('/csv', authMiddleware, async (req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.write('id,company,role,status,appliedDate\n');

  for await (const app of db.applications
    .forUser(req.user.userId)
    .newestFirst()
    .all()) {
    res.write(
      `${app.id},${app.company},${app.role},${app.status},${app.appliedDate.toISOString()}\n`
    );
  }
  res.end();
});

export default router;
