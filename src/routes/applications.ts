import fs from 'fs';
import path from 'path';
import express, { type Request, type Response } from 'express';
import { db } from '../prisma/db';
import { authMiddleware } from '../middleware/auth';
import { uploadResume } from '../middleware/upload';
import {
  VALID_STATUSES,
  validateCreateApplication,
  validateUpdateApplication,
  validateCreateInterview,
} from '../middleware/validate';
import { toDbTimestamp } from '../utils/serialize';

const router = express.Router();

router.use(authMiddleware);

type OwnedResult =
  | { ok: true; application: any }
  | { ok: false; status: number; error: string };

/** Parse `:id`, load the application and verify it belongs to the caller. */
async function getOwnedApplication(req: Request): Promise<OwnedResult> {
  const id = Number(req.params.id);
  if (!Number.isInteger(id) || id <= 0) {
    return { ok: false, status: 400, error: 'Invalid ID' };
  }

  const application = await db.orm.public.Application.where({ id }).first();
  if (!application) {
    return { ok: false, status: 404, error: 'Application not found' };
  }

  if (application.userId !== req.user!.userId) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true, application };
}

/** Trim a string; empty strings become null so optional fields can be cleared. */
function cleanOptional(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

function removeFileQuietly(filePath: string | null | undefined) {
  if (!filePath) return;
  try {
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  } catch (err) {
    console.warn('Could not remove file:', filePath, err);
  }
}

/** Escape LIKE wildcards so user input is matched literally. */
function escapeLike(input: string): string {
  return input.replace(/[\\%_]/g, (ch) => `\\${ch}`);
}

// CREATE application
router.post('/', validateCreateApplication, async (req: Request, res: Response) => {
  try {
    const { company, role, status, notes, salaryMin, salaryMax, currency, jobLocation, jobPostUrl, appliedDate } = req.body;
    const userId = req.user!.userId;

    const data: Record<string, unknown> = {
      company: company.trim(),
      role: role.trim(),
      status: status || 'Applied',
      notes: cleanOptional(notes) ?? null,
      salaryMin: salaryMin ?? null,
      salaryMax: salaryMax ?? null,
      currency: (cleanOptional(currency) ?? 'USD').toUpperCase(),
      jobLocation: cleanOptional(jobLocation) ?? null,
      jobPostUrl: cleanOptional(jobPostUrl) ?? null,
      userId,
    };
    if (appliedDate) data.appliedDate = toDbTimestamp(appliedDate);

    const application = await db.orm.public.Application.create(data);

    res.status(201).json(application);
  } catch (error) {
    console.error('Create application error:', error);
    res.status(500).json({ error: 'Failed to create application' });
  }
});

// LIST applications with cursor pagination & filtering
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const limit = Math.max(1, Math.min(100, Number(req.query.limit) || 10));
    const cursor = req.query.cursor ? Number(req.query.cursor) : undefined;
    const status = req.query.status ? String(req.query.status) : undefined;
    const company = req.query.company ? String(req.query.company).trim() : undefined;

    if (cursor !== undefined && (!Number.isInteger(cursor) || cursor <= 0)) {
      return res.status(400).json({ error: 'cursor must be a positive integer' });
    }

    if (status && !VALID_STATUSES.includes(status as any)) {
      return res.status(400).json({ error: `Invalid status '${status}'` });
    }

    let query = db.orm.public.Application.where({ userId });

    if (status) {
      query = query.where({ status });
    }

    // Filter in SQL (case-insensitive) so pagination stays correct
    if (company) {
      const pattern = `%${escapeLike(company)}%`;
      query = query.where((app: any) => app.company.ilike(pattern));
    }

    let orderedQuery = query.orderBy((app: any) => app.id.desc());

    if (cursor) {
      orderedQuery = orderedQuery.cursor({ id: cursor });
    }

    // Fetch one extra row to know whether another page exists
    const rows = await orderedQuery.limit(limit + 1).all();
    const hasMore = rows.length > limit;
    const applications = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor = hasMore ? applications[applications.length - 1].id : null;

    res.json({ applications, nextCursor });
  } catch (error) {
    console.error('List applications error:', error);
    res.status(500).json({ error: 'Failed to fetch applications' });
  }
});

// GET user application analytics and metrics
router.get('/stats', async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const applications = await db.orm.public.Application.where({ userId }).all();

    const totalApplications = applications.length;
    const byStatus: Record<string, number> = Object.fromEntries(VALID_STATUSES.map((s) => [s, 0]));

    let totalSalarySum = 0;
    let salaryCount = 0;

    for (const app of applications) {
      if (byStatus[app.status] !== undefined) {
        byStatus[app.status]++;
      }

      const salary = app.salaryMax ?? app.salaryMin;
      if (typeof salary === 'number') {
        totalSalarySum += salary;
        salaryCount++;
      }
    }

    const activeApplications = byStatus.Applied + byStatus.Interviewing + byStatus.Offered;
    const interviewCount = byStatus.Interviewing + byStatus.Offered + byStatus.Accepted;
    const offerCount = byStatus.Offered + byStatus.Accepted;
    const pct = (n: number) => (totalApplications > 0 ? Number(((n / totalApplications) * 100).toFixed(1)) : 0);
    const averageSalary = salaryCount > 0 ? Math.round(totalSalarySum / salaryCount) : null;

    res.json({
      totalApplications,
      activeApplications,
      interviewRate: `${pct(interviewCount)}%`,
      offerRate: `${pct(offerCount)}%`,
      averageSalary,
      byStatus,
    });
  } catch (error) {
    console.error('Get application stats error:', error);
    res.status(500).json({ error: 'Failed to generate application statistics' });
  }
});

// GET single application by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const result = await getOwnedApplication(req);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    res.json(result.application);
  } catch (error) {
    console.error('Get application error:', error);
    res.status(500).json({ error: 'Failed to fetch application' });
  }
});

// GET status history for an application
router.get('/:id/history', async (req: Request, res: Response) => {
  try {
    const result = await getOwnedApplication(req);
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    const history = await db.orm.public.StatusHistory
      .where({ applicationId: result.application.id })
      .orderBy((h: any) => h.changedAt.asc())
      .all();

    res.json(history);
  } catch (error) {
    console.error('Get history error:', error);
    res.status(500).json({ error: 'Failed to fetch status history' });
  }
});

// CREATE interview round for an application
router.post('/:id/interviews', validateCreateInterview, async (req: Request, res: Response) => {
  try {
    const result = await getOwnedApplication(req);
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    const { roundName, scheduledDate, meetingLink, interviewer, feedbackNotes, status } = req.body;

    const interview = await db.orm.public.Interview.create({
      applicationId: result.application.id,
      roundName: roundName.trim(),
      scheduledDate: toDbTimestamp(scheduledDate),
      meetingLink: cleanOptional(meetingLink) ?? null,
      interviewer: cleanOptional(interviewer) ?? null,
      feedbackNotes: cleanOptional(feedbackNotes) ?? null,
      status: status || 'Scheduled',
    });

    res.status(201).json(interview);
  } catch (error) {
    console.error('Create interview error:', error);
    res.status(500).json({ error: 'Failed to create interview' });
  }
});

// LIST interview rounds for an application
router.get('/:id/interviews', async (req: Request, res: Response) => {
  try {
    const result = await getOwnedApplication(req);
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    const interviews = await db.orm.public.Interview
      .where({ applicationId: result.application.id })
      .orderBy((i: any) => i.scheduledDate.asc())
      .all();

    res.json(interviews);
  } catch (error) {
    console.error('List interviews error:', error);
    res.status(500).json({ error: 'Failed to fetch interviews' });
  }
});

// UPLOAD resume for an application
router.post('/:id/resume', uploadResume.single('resume'), async (req: Request, res: Response) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Please attach a resume file (.pdf, .doc, .docx under 5MB)' });
    }

    const result = await getOwnedApplication(req);
    if (!result.ok) {
      removeFileQuietly(req.file.path);
      return res.status(result.status).json({ error: result.error });
    }

    // Replace any previously attached resume
    removeFileQuietly(result.application.resumePath);

    const updated = await db.orm.public.Application.where({ id: result.application.id }).update({
      resumePath: req.file.path,
      resumeOriginalName: req.file.originalname,
      resumeMimeType: req.file.mimetype,
      resumeUploadedAt: toDbTimestamp(new Date()),
    });

    res.json(updated);
  } catch (error) {
    console.error('Upload resume error:', error);
    if (req.file) removeFileQuietly(req.file.path);
    res.status(500).json({ error: 'Failed to upload resume file' });
  }
});

// DOWNLOAD resume for an application
router.get('/:id/resume', async (req: Request, res: Response) => {
  try {
    const result = await getOwnedApplication(req);
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    const { resumePath, resumeOriginalName } = result.application;
    if (!resumePath || !fs.existsSync(resumePath)) {
      return res.status(404).json({ error: 'No resume attached to this application' });
    }

    const filename = resumeOriginalName || path.basename(resumePath);
    res.download(path.resolve(resumePath), filename);
  } catch (error) {
    console.error('Download resume error:', error);
    res.status(500).json({ error: 'Failed to download resume file' });
  }
});

// DELETE resume for an application
router.delete('/:id/resume', async (req: Request, res: Response) => {
  try {
    const result = await getOwnedApplication(req);
    if (!result.ok) return res.status(result.status).json({ error: result.error });

    removeFileQuietly(result.application.resumePath);

    const updated = await db.orm.public.Application.where({ id: result.application.id }).update({
      resumePath: null,
      resumeOriginalName: null,
      resumeMimeType: null,
      resumeUploadedAt: null,
    });

    res.json(updated);
  } catch (error) {
    console.error('Delete resume error:', error);
    res.status(500).json({ error: 'Failed to delete resume file' });
  }
});

// UPDATE application — auto-logs StatusHistory when status changes
router.patch('/:id', validateUpdateApplication, async (req: Request, res: Response) => {
  try {
    const result = await getOwnedApplication(req);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    const application = result.application;

    const { company, role, status, notes, salaryMin, salaryMax, currency, jobLocation, jobPostUrl, appliedDate, statusNote } = req.body;
    const updateData: Record<string, any> = {};

    if (company !== undefined) updateData.company = company.trim();
    if (role !== undefined) updateData.role = role.trim();
    if (status !== undefined) updateData.status = status;
    if (notes !== undefined) updateData.notes = cleanOptional(notes);
    if (salaryMin !== undefined) updateData.salaryMin = salaryMin;
    if (salaryMax !== undefined) updateData.salaryMax = salaryMax;
    if (currency !== undefined) updateData.currency = (cleanOptional(currency) ?? 'USD').toUpperCase();
    if (jobLocation !== undefined) updateData.jobLocation = cleanOptional(jobLocation);
    if (jobPostUrl !== undefined) updateData.jobPostUrl = cleanOptional(jobPostUrl);
    if (appliedDate !== undefined && appliedDate !== null) updateData.appliedDate = toDbTimestamp(appliedDate);

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided to update' });
    }

    // Validate the salary range against the values that will actually be stored
    const finalMin = 'salaryMin' in updateData ? updateData.salaryMin : application.salaryMin;
    const finalMax = 'salaryMax' in updateData ? updateData.salaryMax : application.salaryMax;
    if (typeof finalMin === 'number' && typeof finalMax === 'number' && finalMin > finalMax) {
      return res.status(400).json({ error: 'salaryMin cannot be greater than salaryMax' });
    }

    const updated = await db.orm.public.Application.where({ id: application.id }).update(updateData);

    // When status changes, record the transition in StatusHistory
    if (status !== undefined && status !== application.status) {
      await db.orm.public.StatusHistory.create({
        applicationId: application.id,
        fromStatus: application.status,
        toStatus: status,
        notes: cleanOptional(statusNote) ?? null,
      });
    }

    res.json(updated);
  } catch (error) {
    console.error('Update application error:', error);
    res.status(500).json({ error: 'Failed to update application' });
  }
});

// DELETE application (and its interviews, history and resume)
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const result = await getOwnedApplication(req);
    if (!result.ok) return res.status(result.status).json({ error: result.error });
    const id = result.application.id;

    // Child rows must be removed first because of foreign-key constraints
    await db.orm.public.Interview.where({ applicationId: id }).deleteAll();
    await db.orm.public.StatusHistory.where({ applicationId: id }).deleteAll();

    removeFileQuietly(result.application.resumePath);

    await db.orm.public.Application.where({ id }).delete();
    res.status(204).send();
  } catch (error) {
    console.error('Delete application error:', error);
    res.status(500).json({ error: 'Failed to delete application' });
  }
});

export default router;
