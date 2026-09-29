import express, { type Request, type Response } from 'express';
import { db } from '../prisma/db';
import { authMiddleware } from '../middleware/auth';
import { validateUpdateInterview } from '../middleware/validate';
import { parseTimestamp, toDbTimestamp } from '../utils/serialize';

const router = express.Router();

router.use(authMiddleware);

type AuthorizedResult =
  | { ok: true; interview: any }
  | { ok: false; status: number; error: string };

// Helper: verify interview existence and owner authorization
async function getAuthorizedInterview(interviewId: number, userId: number): Promise<AuthorizedResult> {
  const interview = await db.orm.public.Interview.where({ id: interviewId }).first();
  if (!interview) {
    return { ok: false, status: 404, error: 'Interview not found' };
  }

  const application = await db.orm.public.Application.where({ id: interview.applicationId }).first();
  if (!application || application.userId !== userId) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true, interview };
}

function parseId(raw: string): number | null {
  const id = Number(raw);
  return Number.isInteger(id) && id > 0 ? id : null;
}

function cleanOptional(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
}

// LIST all interviews across the caller's applications.
// ?upcoming=true limits results to scheduled rounds that have not happened yet.
router.get('/', async (req: Request, res: Response) => {
  try {
    const upcomingOnly = String(req.query.upcoming ?? '').toLowerCase() === 'true';

    const applications = await db.orm.public.Application
      .where({ userId: req.user!.userId })
      .include('interviews')
      .all();

    const now = Date.now();
    const interviews = applications
      .flatMap((app: any) =>
        (app.interviews ?? []).map((interview: any) => ({
          ...interview,
          company: app.company,
          role: app.role,
        }))
      )
      .filter((interview: any) => {
        if (!upcomingOnly) return true;
        const when = parseTimestamp(interview.scheduledDate)?.getTime() ?? 0;
        return interview.status === 'Scheduled' && when >= now;
      })
      .sort(
        (a: any, b: any) =>
          (parseTimestamp(a.scheduledDate)?.getTime() ?? 0) - (parseTimestamp(b.scheduledDate)?.getTime() ?? 0)
      );

    res.json(interviews);
  } catch (error) {
    console.error('List all interviews error:', error);
    res.status(500).json({ error: 'Failed to fetch interviews' });
  }
});

// GET single interview by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id as string);
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const result = await getAuthorizedInterview(id, req.user!.userId);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    res.json(result.interview);
  } catch (error) {
    console.error('Get interview error:', error);
    res.status(500).json({ error: 'Failed to fetch interview' });
  }
});

// UPDATE interview by ID
router.patch('/:id', validateUpdateInterview, async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id as string);
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const result = await getAuthorizedInterview(id, req.user!.userId);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    const { roundName, scheduledDate, meetingLink, interviewer, feedbackNotes, status } = req.body;
    const updateData: Record<string, any> = {};

    if (roundName !== undefined) updateData.roundName = roundName.trim();
    if (scheduledDate !== undefined) updateData.scheduledDate = toDbTimestamp(scheduledDate);
    if (meetingLink !== undefined) updateData.meetingLink = cleanOptional(meetingLink);
    if (interviewer !== undefined) updateData.interviewer = cleanOptional(interviewer);
    if (feedbackNotes !== undefined) updateData.feedbackNotes = cleanOptional(feedbackNotes);
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    updateData.updatedAt = toDbTimestamp(new Date());

    const updated = await db.orm.public.Interview.where({ id }).update(updateData);
    res.json(updated);
  } catch (error) {
    console.error('Update interview error:', error);
    res.status(500).json({ error: 'Failed to update interview' });
  }
});

// DELETE interview by ID
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = parseId(req.params.id as string);
    if (!id) return res.status(400).json({ error: 'Invalid ID' });

    const result = await getAuthorizedInterview(id, req.user!.userId);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    await db.orm.public.Interview.where({ id }).delete();
    res.status(204).send();
  } catch (error) {
    console.error('Delete interview error:', error);
    res.status(500).json({ error: 'Failed to delete interview' });
  }
});

export default router;
