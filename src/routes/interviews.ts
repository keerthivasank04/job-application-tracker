import express, { type Request, type Response } from 'express';
import { db } from '../prisma/db';
import { authMiddleware } from '../middleware/auth';
import { validateUpdateInterview } from '../middleware/validate';

const router = express.Router();

router.use(authMiddleware);

type AuthorizedResult =
  | { ok: true; interview: any }
  | { ok: false; status: number; error: string };

// Helper: verify interview existence and owner authorization
async function getAuthorizedInterview(interviewId: number, userId: number): Promise<AuthorizedResult> {
  const interview = await db.orm.Interview.where({ id: interviewId }).first();
  if (!interview) {
    return { ok: false, status: 404, error: 'Interview not found' };
  }

  const application = await db.orm.Application.where({ id: interview.applicationId }).first();
  if (!application || application.userId !== userId) {
    return { ok: false, status: 403, error: 'Forbidden' };
  }

  return { ok: true, interview };
}

// GET single interview by ID
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

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
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const result = await getAuthorizedInterview(id, req.user!.userId);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    const { roundName, scheduledDate, meetingLink, interviewer, feedbackNotes, status } = req.body;
    const updateData: Record<string, any> = {};

    if (roundName !== undefined) updateData.roundName = roundName.trim();
    if (scheduledDate !== undefined) updateData.scheduledDate = new Date(scheduledDate);
    if (meetingLink !== undefined) updateData.meetingLink = meetingLink;
    if (interviewer !== undefined) updateData.interviewer = interviewer;
    if (feedbackNotes !== undefined) updateData.feedbackNotes = feedbackNotes;
    if (status !== undefined) updateData.status = status;

    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({ error: 'No fields provided to update' });
    }

    const updated = await db.orm.Interview.where({ id }).update(updateData);
    res.json(updated);
  } catch (error) {
    console.error('Update interview error:', error);
    res.status(500).json({ error: 'Failed to update interview' });
  }
});

// DELETE interview by ID
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const id = Number(req.params.id);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID' });
    }

    const result = await getAuthorizedInterview(id, req.user!.userId);
    if (!result.ok) {
      return res.status(result.status).json({ error: result.error });
    }

    await db.orm.Interview.where({ id }).delete();
    res.status(204).send();
  } catch (error) {
    console.error('Delete interview error:', error);
    res.status(500).json({ error: 'Failed to delete interview' });
  }
});

export default router;
