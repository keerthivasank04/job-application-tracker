import rateLimit from 'express-rate-limit';

const FIFTEEN_MINUTES = 15 * 60 * 1000;
const isTest = process.env.NODE_ENV === 'test';

function envInt(name: string, fallback: number): number {
  const value = Number(process.env[name]);
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

/**
 * Strict rate limiter for credential endpoints (login, forgot/reset password)
 * to slow down brute-force attacks. Only failed attempts are counted, so a user
 * who signs in successfully is never locked out by their own normal usage.
 */
export const authLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: envInt('AUTH_RATE_LIMIT', 10),
  skipSuccessfulRequests: true,
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many failed attempts from this IP. Please try again in 15 minutes.',
  },
});

/**
 * General rate limiter for API endpoints. The dashboard issues several requests
 * per user action, so the default budget is sized for real interactive use.
 */
export const generalLimiter = rateLimit({
  windowMs: FIFTEEN_MINUTES,
  limit: envInt('API_RATE_LIMIT', 1000),
  skip: () => isTest,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests. Please slow down and try again later.',
  },
});
