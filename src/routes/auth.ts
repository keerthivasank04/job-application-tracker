import express, { type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../prisma/db';
import { validateSignup, validateLogin, validateUpdateProfile } from '../middleware/validate';
import { authLimiter } from '../middleware/rate-limiter';
import { authMiddleware as authenticate } from '../middleware/auth';

const router = express.Router();

router.post('/signup', validateSignup, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const existing = await db.orm.User.where({ email: email.toLowerCase().trim() }).first();
    if (existing) {
      return res.status(400).json({ error: 'Email already in use' });
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await db.orm.User.create({
      email: email.toLowerCase().trim(),
      passwordHash,
    });

    res.status(201).json({ id: user.id, email: user.email });
  } catch (error) {
    console.error('Signup error:', error);
    res.status(500).json({ error: 'Internal server error during signup' });
  }
});

router.post('/login', authLimiter, validateLogin, async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;

    const user = await db.orm.User.where({ email: email.toLowerCase().trim() }).first();
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

    const token = jwt.sign({ userId: user.id, email: user.email }, secret, { expiresIn: '2h' });
    res.json({ token });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Internal server error during login' });
  }
});

/**
 * GET /auth/profile
 * Returns the authenticated user's profile fields (excludes passwordHash).
 */
router.get('/profile', authenticate, async (req: Request, res: Response) => {
  try {
    const user = await db.orm.User.where({ id: req.user!.userId }).first();
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const { passwordHash: _, ...profile } = user as any;
    res.json(profile);
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * PATCH /auth/profile
 * Updates the authenticated user's profile (name, linkedinUrl, githubUrl).
 */
router.patch('/profile', authenticate, validateUpdateProfile, async (req: Request, res: Response) => {
  try {
    const { name, linkedinUrl, githubUrl } = req.body;

    const updates: Record<string, unknown> = {};
    if (name !== undefined) updates.name = name.trim();
    if (linkedinUrl !== undefined) updates.linkedinUrl = linkedinUrl;
    if (githubUrl !== undefined) updates.githubUrl = githubUrl;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields provided to update' });
    }

    const updated = await db.orm.User.where({ id: req.user!.userId }).update(updates);
    const { passwordHash: _, ...profile } = updated as any;
    res.json(profile);
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
