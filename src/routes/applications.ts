import express from 'express';
import { db } from '../prisma/db';
import { authMiddleware } from '../middleware/auth';

const router = express.Router();

router.use(authMiddleware);

// CREATE
router.post('/', async (req, res) => {
  const { company, role, status } = req.body;
  if (!company || !role) {
    return res.status(400).json({ error: 'company and role are required' });
  }
  const application = await db.applications.insert({
    company,
    role,
    status: status || 'Applied',
    userId: req.user.userId,
  });
  res.status(201).json(application);
});

// LIST — cursor pagination
router.get('/', async (req, res) => {
  const { cursor, limit = 10 } = req.query;
  const applications = await db.applications
    .forUser(req.user.userId)
    .newestFirst()
    .cursor(cursor ? { id: Number(cursor) } : undefined)
    .take(Number(limit))
    .all();

  const nextCursor =
    applications.length === Number(limit)
      ? applications[applications.length - 1].id
      : null;
  res.json({ applications, nextCursor });
});

// UPDATE
router.patch('/:id', async (req, res) => {
  const application = await db.applications.byId(Number(req.params.id));
  if (!application) return res.status(404).json({ error: 'Not found' });
  if (application.userId !== req.user.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  const updated = await db.applications
    .where({ id: Number(req.params.id) })
    .update(req.body);
  res.json(updated);
});

// DELETE
router.delete('/:id', async (req, res) => {
  const application = await db.applications.byId(Number(req.params.id));
  if (!application) return res.status(404).json({ error: 'Not found' });
  if (application.userId !== req.user.userId) {
    return res.status(403).json({ error: 'Forbidden' });
  }

  await db.applications.where({ id: Number(req.params.id) }).delete();
  res.status(204).send();
});

export default router;
