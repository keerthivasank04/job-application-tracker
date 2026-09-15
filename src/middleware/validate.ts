import type { Request, Response, NextFunction } from 'express';

export const VALID_STATUSES = [
  'Applied',
  'Interviewing',
  'Offered',
  'Rejected',
  'Accepted',
  'Withdrawn',
] as const;

export type ApplicationStatus = typeof VALID_STATUSES[number];

/**
 * Validates signup request payload (email format & password length)
 */
export function validateSignup(req: Request, res: Response, next: NextFunction) {
  const { email, password } = req.body;

  if (!email || typeof email !== 'string' || !email.includes('@') || !email.includes('.')) {
    return res.status(400).json({ error: 'A valid email address is required' });
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return res.status(400).json({ error: 'Password must be at least 8 characters long' });
  }

  next();
}

/**
 * Validates login request payload
 */
export function validateLogin(req: Request, res: Response, next: NextFunction) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  next();
}

/**
 * Validates creating a new application.
 * Required: company, role.
 * Optional: status, notes, salaryMin, salaryMax, currency, jobLocation, jobPostUrl.
 */
export function validateCreateApplication(req: Request, res: Response, next: NextFunction) {
  const { company, role, status, salaryMin, salaryMax } = req.body;

  if (!company || typeof company !== 'string' || company.trim().length === 0) {
    return res.status(400).json({ error: 'Company name is required and cannot be empty' });
  }

  if (!role || typeof role !== 'string' || role.trim().length === 0) {
    return res.status(400).json({ error: 'Role title is required and cannot be empty' });
  }

  if (status && !VALID_STATUSES.includes(status as ApplicationStatus)) {
    return res.status(400).json({
      error: `Invalid status '${status}'. Must be one of: ${VALID_STATUSES.join(', ')}`,
    });
  }

  if (salaryMin !== undefined && (typeof salaryMin !== 'number' || salaryMin < 0)) {
    return res.status(400).json({ error: 'salaryMin must be a non-negative number' });
  }

  if (salaryMax !== undefined && (typeof salaryMax !== 'number' || salaryMax < 0)) {
    return res.status(400).json({ error: 'salaryMax must be a non-negative number' });
  }

  if (salaryMin !== undefined && salaryMax !== undefined && salaryMin > salaryMax) {
    return res.status(400).json({ error: 'salaryMin cannot be greater than salaryMax' });
  }

  next();
}

/**
 * Validates updating an application (all fields are optional).
 */
export function validateUpdateApplication(req: Request, res: Response, next: NextFunction) {
  const { company, role, status, salaryMin, salaryMax } = req.body;

  if (company !== undefined && (typeof company !== 'string' || company.trim().length === 0)) {
    return res.status(400).json({ error: 'Company cannot be empty' });
  }

  if (role !== undefined && (typeof role !== 'string' || role.trim().length === 0)) {
    return res.status(400).json({ error: 'Role cannot be empty' });
  }

  if (status !== undefined && !VALID_STATUSES.includes(status as ApplicationStatus)) {
    return res.status(400).json({
      error: `Invalid status '${status}'. Must be one of: ${VALID_STATUSES.join(', ')}`,
    });
  }

  if (salaryMin !== undefined && (typeof salaryMin !== 'number' || salaryMin < 0)) {
    return res.status(400).json({ error: 'salaryMin must be a non-negative number' });
  }

  if (salaryMax !== undefined && (typeof salaryMax !== 'number' || salaryMax < 0)) {
    return res.status(400).json({ error: 'salaryMax must be a non-negative number' });
  }

  if (salaryMin !== undefined && salaryMax !== undefined && salaryMin > salaryMax) {
    return res.status(400).json({ error: 'salaryMin cannot be greater than salaryMax' });
  }

  next();
}

/**
 * Validates updating a user profile (all fields are optional).
 */
export function validateUpdateProfile(req: Request, res: Response, next: NextFunction) {
  const { name, linkedinUrl, githubUrl } = req.body;

  if (name !== undefined && (typeof name !== 'string' || name.trim().length === 0)) {
    return res.status(400).json({ error: 'Name cannot be empty' });
  }

  if (linkedinUrl !== undefined && typeof linkedinUrl !== 'string') {
    return res.status(400).json({ error: 'linkedinUrl must be a string' });
  }

  if (githubUrl !== undefined && typeof githubUrl !== 'string') {
    return res.status(400).json({ error: 'githubUrl must be a string' });
  }

  next();
}
