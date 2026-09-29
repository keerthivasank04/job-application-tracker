import fs from 'fs';
import crypto from 'crypto';
import express, { type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../prisma/db';
import { validateSignup, validateLogin, validateUpdateProfile } from '../middleware/validate';
import { authLimiter } from '../middleware/rate-limiter';
import { authMiddleware as authenticate } from '../middleware/auth';
import { EmailService } from '../services/email';
import { parseTimestamp, toDbTimestamp } from '../utils/serialize';

const router = express.Router();

// REGISTER
router.post('/signup', validateSignup, async (req: Request, res: Response) => {
  try {
    const { email, password, name } = req.body;

    const existing = await db.orm.public.User.where({ email: email.toLowerCase().trim() }).first();
    if (existing) {
      return res.status(409).json({ error: 'An account with this email already exists' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.orm.public.User.create({
      email: email.toLowerCase().trim(),
      passwordHash,
      name: typeof name === 'string' && name.trim() ? name.trim() : null,
    });

    res.status(201).json({ id: user.id, email: user.email, name: user.name });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error during signup' });
  }
});

// LOGIN
router.post('/login', authLimiter, validateLogin, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await db.orm.public.User.where({ email: email.toLowerCase().trim() }).first();
    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ error: 'JWT_SECRET is not configured' });
    }

    const expiresIn = (process.env.JWT_EXPIRES_IN || '2h') as jwt.SignOptions['expiresIn'];
    const token = jwt.sign({ userId: user.id, email: user.email }, secret, { expiresIn });
    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

// GET PROFILE
router.get('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await db.orm.public.User.where({ id: req.user!.userId }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { passwordHash: _, resetPasswordToken: __, resetPasswordExpires: ___, ...profile } = user as any;
    res.json(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// UPDATE PROFILE
router.patch('/profile', authenticate, validateUpdateProfile, async (req: Request, res: Response) => {
  try {
    const { name, linkedinUrl, githubUrl } = req.body;

    const updates: Record<string, unknown> = {};
    const clean = (v: unknown) => (v === null || String(v).trim() === '' ? null : String(v).trim());
    if (name !== undefined) updates.name = clean(name);
    if (linkedinUrl !== undefined) updates.linkedinUrl = clean(linkedinUrl);
    if (githubUrl !== undefined) updates.githubUrl = clean(githubUrl);

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided to update' });
    }

    updates.updatedAt = toDbTimestamp(new Date());
    const updated = await db.orm.public.User.where({ id: req.user!.userId }).update(updates);
    if (!updated) {
      return res.status(404).json({ error: 'User not found' });
    }
    const { passwordHash: _, resetPasswordToken: __, resetPasswordExpires: ___, ...profile } = updated as any;
    res.json(profile);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// CHANGE PASSWORD (AUTHENTICATED)
router.post('/change-password', authenticate, async (req: Request, res: Response) => {
  try {
    const { currentPassword, newPassword } = req.body;

    if (!currentPassword || !newPassword) {
      return res.status(400).json({ error: 'Both currentPassword and newPassword are required' });
    }

    if (typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ error: 'New password must be between 8 and 128 characters long' });
    }

    const user = await db.orm.public.User.where({ id: req.user!.userId }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      return res.status(400).json({ error: 'Current password is incorrect' });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await db.orm.public.User.where({ id: req.user!.userId }).update({
      passwordHash: newPasswordHash,
      updatedAt: toDbTimestamp(new Date()),
    });

    res.json({ message: 'Password changed successfully' });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// FORGOT PASSWORD
router.post('/forgot-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { email } = req.body;
    if (!email || typeof email !== 'string') {
      return res.status(400).json({ error: 'Valid email is required' });
    }

    const user = await db.orm.public.User.where({ email: email.toLowerCase().trim() }).first();
    let devResetToken: string | undefined;

    if (user) {
      const rawToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(rawToken).digest('hex');
      const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour expiration

      await db.orm.public.User.where({ id: user.id }).update({
        resetPasswordToken: hashedToken,
        resetPasswordExpires: toDbTimestamp(expires),
      });

      await EmailService.sendPasswordReset({
        toEmail: user.email,
        candidateName: user.name ?? undefined,
        resetToken: rawToken,
      });

      // No real email transport is configured, so outside production the token is
      // returned to the client to keep the reset flow usable during development.
      if (process.env.NODE_ENV !== 'production') devResetToken = rawToken;
    }

    // Always respond with success to prevent user enumeration
    res.json({
      message: 'If an account exists with this email, a password reset link has been dispatched.',
      ...(devResetToken ? { devResetToken } : {}),
    });
  } catch (error) {
    console.error('Forgot password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// RESET PASSWORD
router.post('/reset-password', authLimiter, async (req: Request, res: Response) => {
  try {
    const { token, newPassword } = req.body;

    if (!token || typeof token !== 'string') {
      return res.status(400).json({ error: 'Reset token is required' });
    }

    if (!newPassword || typeof newPassword !== 'string' || newPassword.length < 8 || newPassword.length > 128) {
      return res.status(400).json({ error: 'New password must be between 8 and 128 characters long' });
    }

    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    const user = await db.orm.public.User.where({ resetPasswordToken: hashedToken }).first();

    const expiresAt = parseTimestamp(user?.resetPasswordExpires);
    if (!user || !expiresAt || expiresAt.getTime() < Date.now()) {
      return res.status(400).json({ error: 'Invalid or expired password reset token' });
    }

    const newPasswordHash = await bcrypt.hash(newPassword, 10);
    await db.orm.public.User.where({ id: user.id }).update({
      passwordHash: newPasswordHash,
      resetPasswordToken: null,
      resetPasswordExpires: null,
      updatedAt: toDbTimestamp(new Date()),
    });

    res.json({ message: 'Password has been successfully reset. You may now log in.' });
  } catch (error) {
    console.error('Reset password error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE ACCOUNT (CASCADING DELETION)
router.delete('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const userId = req.user!.userId;
    const user = await db.orm.public.User.where({ id: userId }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    // Fetch user applications
    const applications = await db.orm.public.Application.where({ userId }).all();

    for (const app of applications) {
      await db.orm.public.Interview.where({ applicationId: app.id }).deleteAll();
      await db.orm.public.StatusHistory.where({ applicationId: app.id }).deleteAll();

      // Clean up resume file from disk
      if (app.resumePath && fs.existsSync(app.resumePath)) {
        try {
          fs.unlinkSync(app.resumePath);
        } catch (err) {
          console.warn('Could not remove resume file:', err);
        }
      }
    }

    await db.orm.public.Application.where({ userId }).deleteAll();

    // Delete user
    await db.orm.public.User.where({ id: userId }).delete();

    res.status(204).send();
  } catch (error) {
    console.error('Delete account error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
