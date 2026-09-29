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

export const VALID_INTERVIEW_STATUSES = ['Scheduled', 'Completed', 'Cancelled'] as const;
export type InterviewStatus = typeof VALID_INTERVIEW_STATUSES[number];

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MAX_TEXT = 5000;
const MAX_SHORT_TEXT = 200;

// ---------------------------------------------------------------------------
// Small reusable checks. Each returns an error message, or null when valid.
// Optional fields accept `undefined` (not provided) and `null` (clear value).
// ---------------------------------------------------------------------------

function optionalString(value: unknown, field: string, max = MAX_SHORT_TEXT): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') return `${field} must be a string`;
  if (value.length > max) return `${field} must be at most ${max} characters`;
  return null;
}

function optionalUrl(value: unknown, field: string): string | null {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') return `${field} must be a string`;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return `${field} must start with http:// or https://`;
    }
  } catch {
    return `${field} must be a valid URL`;
  }
  return null;
}

function optionalSalary(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || !Number.isInteger(value)) {
    return `${field} must be a non-negative whole number`;
  }
  if (value > 2_000_000_000) return `${field} is too large`;
  return null;
}

function optionalCurrency(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' || !/^[A-Za-z]{3}$/.test(value)) {
    return 'currency must be a 3-letter ISO code (e.g. USD, INR, EUR)';
  }
  return null;
}

function optionalDate(value: unknown, field: string): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string' && typeof value !== 'number') return `${field} must be a valid ISO 8601 date string`;
  if (isNaN(new Date(value).getTime())) return `${field} must be a valid ISO 8601 date string`;
  return null;
}

function firstError(...checks: (string | null)[]): string | null {
  return checks.find((c) => c !== null) ?? null;
}

function reject(res: Response, message: string) {
  return res.status(400).json({ error: message });
}

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

/** Validates signup request payload (email format & password length). */
export function validateSignup(req: Request, res: Response, next: NextFunction) {
  const { email, password, name } = req.body ?? {};

  if (!email || typeof email !== 'string' || !EMAIL_PATTERN.test(email.trim())) {
    return reject(res, 'A valid email address is required');
  }

  if (!password || typeof password !== 'string' || password.length < 8) {
    return reject(res, 'Password must be at least 8 characters long');
  }

  if (password.length > 128) {
    return reject(res, 'Password must be at most 128 characters long');
  }

  const nameError = optionalString(name, 'name', 100);
  if (nameError) return reject(res, nameError);

  next();
}

/** Validates login request payload. */
export function validateLogin(req: Request, res: Response, next: NextFunction) {
  const { email, password } = req.body ?? {};

  if (!email || !password || typeof email !== 'string' || typeof password !== 'string') {
    return reject(res, 'Email and password are required');
  }

  next();
}

/** Validates updating a user profile (all fields are optional). */
export function validateUpdateProfile(req: Request, res: Response, next: NextFunction) {
  const { name, linkedinUrl, githubUrl } = req.body ?? {};

  if (name !== undefined && name !== null && (typeof name !== 'string' || name.length > 100)) {
    return reject(res, 'Name must be a string of at most 100 characters');
  }

  const error = firstError(optionalUrl(linkedinUrl, 'linkedinUrl'), optionalUrl(githubUrl, 'githubUrl'));
  if (error) return reject(res, error);

  next();
}

// ---------------------------------------------------------------------------
// Applications
// ---------------------------------------------------------------------------

function validateApplicationFields(body: any): string | null {
  const { status, notes, salaryMin, salaryMax, currency, jobLocation, jobPostUrl, appliedDate } = body;

  if (status !== undefined && !VALID_STATUSES.includes(status as ApplicationStatus)) {
    return `Invalid status '${status}'. Must be one of: ${VALID_STATUSES.join(', ')}`;
  }

  const error = firstError(
    optionalString(notes, 'notes', MAX_TEXT),
    optionalSalary(salaryMin, 'salaryMin'),
    optionalSalary(salaryMax, 'salaryMax'),
    optionalCurrency(currency),
    optionalString(jobLocation, 'jobLocation'),
    optionalUrl(jobPostUrl, 'jobPostUrl'),
    optionalDate(appliedDate, 'appliedDate'),
  );
  if (error) return error;

  if (typeof salaryMin === 'number' && typeof salaryMax === 'number' && salaryMin > salaryMax) {
    return 'salaryMin cannot be greater than salaryMax';
  }

  return null;
}

/**
 * Validates creating a new application.
 * Required: company, role.
 * Optional: status, notes, salaryMin, salaryMax, currency, jobLocation, jobPostUrl, appliedDate.
 */
export function validateCreateApplication(req: Request, res: Response, next: NextFunction) {
  const body = req.body ?? {};
  const { company, role } = body;

  if (!company || typeof company !== 'string' || company.trim().length === 0) {
    return reject(res, 'Company name is required and cannot be empty');
  }

  if (!role || typeof role !== 'string' || role.trim().length === 0) {
    return reject(res, 'Role title is required and cannot be empty');
  }

  const error = firstError(
    optionalString(company, 'company'),
    optionalString(role, 'role'),
    validateApplicationFields(body),
  );
  if (error) return reject(res, error);

  next();
}

/** Validates updating an application (all fields are optional). */
export function validateUpdateApplication(req: Request, res: Response, next: NextFunction) {
  const body = req.body ?? {};
  const { company, role } = body;

  if (company !== undefined && (typeof company !== 'string' || company.trim().length === 0)) {
    return reject(res, 'Company cannot be empty');
  }

  if (role !== undefined && (typeof role !== 'string' || role.trim().length === 0)) {
    return reject(res, 'Role cannot be empty');
  }

  const error = firstError(
    optionalString(company, 'company'),
    optionalString(role, 'role'),
    validateApplicationFields(body),
  );
  if (error) return reject(res, error);

  next();
}

// ---------------------------------------------------------------------------
// Interviews
// ---------------------------------------------------------------------------

function validateInterviewFields(body: any): string | null {
  const { meetingLink, interviewer, feedbackNotes, status, scheduledDate } = body;

  if (status !== undefined && !VALID_INTERVIEW_STATUSES.includes(status as InterviewStatus)) {
    return `Invalid status '${status}'. Must be one of: ${VALID_INTERVIEW_STATUSES.join(', ')}`;
  }

  return firstError(
    optionalUrl(meetingLink, 'meetingLink'),
    optionalString(interviewer, 'interviewer'),
    optionalString(feedbackNotes, 'feedbackNotes', MAX_TEXT),
    optionalDate(scheduledDate, 'scheduledDate'),
  );
}

/**
 * Validates creating an interview round.
 * Required: roundName, scheduledDate.
 * Optional: meetingLink, interviewer, feedbackNotes, status.
 */
export function validateCreateInterview(req: Request, res: Response, next: NextFunction) {
  const body = req.body ?? {};
  const { roundName, scheduledDate } = body;

  if (!roundName || typeof roundName !== 'string' || roundName.trim().length === 0) {
    return reject(res, 'roundName is required and cannot be empty');
  }

  if (!scheduledDate) {
    return reject(res, 'scheduledDate is required');
  }

  const error = firstError(optionalString(roundName, 'roundName'), validateInterviewFields(body));
  if (error) return reject(res, error);

  next();
}

/** Validates updating an interview (all fields are optional). */
export function validateUpdateInterview(req: Request, res: Response, next: NextFunction) {
  const body = req.body ?? {};
  const { roundName, scheduledDate } = body;

  if (roundName !== undefined && (typeof roundName !== 'string' || roundName.trim().length === 0)) {
    return reject(res, 'roundName cannot be empty');
  }

  if (scheduledDate === null) {
    return reject(res, 'scheduledDate cannot be empty');
  }

  const error = firstError(optionalString(roundName, 'roundName'), validateInterviewFields(body));
  if (error) return reject(res, error);

  next();
}
