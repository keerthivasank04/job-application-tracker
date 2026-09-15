import express, { type Request, type Response } from 'express';
import { db } from '../prisma/db';
import { authMiddleware } from '../middleware/auth';
import { validateCreateApplication, validateUpdateApplication } from '../middleware/validate';

const router = express.Router();

router.use(authMiddleware);

// CREATE application
router.post('/', validateCreateApplication, async (req: Request, res: Response) => {
  try {
    const { company, role, status, notes, salaryMin, salaryMax, currency, jobLocation, jobPostUrl } = req.body;
    const userId = req.user!.userId;

    const application = await db.orm.Application.create({
      company: company.trim(),
      role: role.trim(),
      status: status || 'Applied',
      notes: notes ?? null,
      salaryMin: salaryMin ?? null,
      salaryMax: salaryMax ?? null,
      currency: currency ?? 'USD',
      jobLocation: jobLocation ?? null,
      jobPostUrl: jobPostUrl ?? null,
      userId,
    });

    res.status(201).json(application);
  } catch (error) {
    console.error('Create application error:', error);
    res.status(500).json({ error: 'Failed to create application' });
  }
});

// LIST applications with cursor pagination & search/filtering
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
    const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const company = req.query.company ? String(req.query.company).toLowerCase() : undefined;

    let query = db.orm.Application.where({ userId });

    if (status) {
      query = query.where({ status });
    }

    let orderedQuery = query.orderBy((app: any) => app.id.desc());

    if (cursor) {
      orderedQuery = orderedQuery.cursor({ id: cursor });
    }

    let applications = await orderedQuery.limit(limit).all();

    // In-memory company filter if queried
    if (company) {
      applications = applications.filter((app: any) =>
        app.company.toLowerCase().includes(company)
      );
    }

    const nextCursor =
      applications.length === limit
        ? applications[applications.length - 1].id
        : null;

    res.json({ applications, nextCursor });
  } catch (error) {
    console.error('List applications error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// GET single application by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const application = await db.orm.Application.where({ id }).first();
    if (!application) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (application.userId !== req.user!.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    res.json(application);
  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({ error: 'Failed to fetch application' });
  }
});

// GET status history for an application
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const application = await db.orm.Application.where({ id }).first();
    if (!application) {
      return res.status(404).json({ error: 'Application not found' });
    }

    if (application.userId !== req.user!.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const history = await db.orm.StatusHistory
      .where({ applicationId: id })
      .orderBy((h: any) => h.changedAt.asc())
      .all();

    res.json(history);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch status history' });
  }
});

// UPDATE application — auto-logs StatusHistory when status changes
router.patch('/:id', validateUpdateApplication, async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const application = await db.orm.Application.where({ id }).first();
    if (!application) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (application.userId !== req.user!.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    const { company, role, status, notes, salaryMin, salaryMax, currency, jobLocation, jobPostUrl } = req.body;
    const updateData: Record<string, any> = {};

    if (company !== undefined) updateData.company = company.trim();
    if (role !== undefined) updateData.role = role.trim();
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = notes;
    if (salaryMin !== undefined) updateData.salaryMin = salaryMin;
    if (salaryMax !== undefined) updateData.salaryMax = salaryMax;
    if (currency !== undefined) updateData.currency = currency;
    if (jobLocation !== undefined) updateData.jobLocation = jobLocation;
    if (jobPostUrl !== undefined) updateData.jobPostUrl = jobPostUrl;

    const updated = await db.orm.Application.where({ id }).update(updateData);

    // When status changes, record the transition in StatusHistory
    if (status !== undefined && status !== application.status) {
      await db.orm.StatusHistory.create({
        applicationId: id,
        fromStatus: application.status,
        toStatus: status,
        notes: notes ?? null,
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Update application error:', error);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

// DELETE application
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const application = await db.orm.Application.where({ id }).first();
    if (!application) {
      return res.status(404).json({ error: 'Not found' });
    }

    if (application.userId !== req.user!.userId) {
      return res.status(403).json({ error: 'Forbidden' });
    }

    await db.orm.Application.where({ id }).delete();
    res.status(204).send();
  } catch (error) {
    console.error('Delete application error:', error);
    res.status(500).json({ error: 'Failed to delete application' });
  }
});

export default router;
