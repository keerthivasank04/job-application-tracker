import express, { type Request, type Response } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { db } from '../prisma/db';
import { validateSignup, validateLogin } from '../middleware/validate';
import { authLimiter } from '../middleware/rate-limiter';

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

export default router;
