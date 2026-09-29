/**
 * Serialisation helpers (timestamps + response sanitising).
 *
 * Timestamp columns use Prisma Next's `TimestamptzString` codec, which reads
 * values back in PostgreSQL's text format (e.g. "2026-09-29 05:31:57.33+00").
 * That format is not reliably parsed by every browser, so API responses are
 * normalised to strict ISO 8601 ("2026-09-29T05:31:57.330Z").
 */

const PG_TIMESTAMP_PATTERN = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}:\d{2}(\.\d+)?([+-]\d{2}(:?\d{2})?|Z)$/;

/** Parse a database timestamp (string or Date) into a Date, or null when absent/invalid. */
export function parseTimestamp(value: unknown): Date | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) return isNaN(value.getTime()) ? null : value;
  if (typeof value !== 'string') return null;

  let normalised = value.trim().replace(' ', 'T');
  // PostgreSQL emits short offsets such as "+00" or "+0530"; ISO 8601 requires "+00:00".
  normalised = normalised.replace(/([+-]\d{2})$/, '$1:00').replace(/([+-]\d{2})(\d{2})$/, '$1:$2');
  const date = new Date(normalised);
  return isNaN(date.getTime()) ? null : date;
}

/** Convert a database timestamp into an ISO 8601 string (or null). */
export function toIsoTimestamp(value: unknown): string | null {
  const date = parseTimestamp(value);
  return date ? date.toISOString() : null;
}

/** Convert user input (ISO string / Date) into the string form stored in the database. */
export function toDbTimestamp(value: string | number | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

/**
 * Fields that must never leave the server, even if a route forgets to strip them
 * (password hashes, reset tokens, and absolute file-system paths).
 */
const SENSITIVE_KEYS = new Set(['passwordHash', 'resetPasswordToken', 'resetPasswordExpires', 'resumePath']);

/**
 * JSON replacer for Express: rewrites any PostgreSQL-formatted timestamp string
 * to ISO 8601 so every endpoint returns a consistent, browser-safe date format,
 * and drops sensitive fields as a defence-in-depth measure.
 */
export function isoTimestampReplacer(key: string, value: unknown): unknown {
  if (SENSITIVE_KEYS.has(key)) return undefined;
  if (typeof value === 'string' && PG_TIMESTAMP_PATTERN.test(value)) {
    return toIsoTimestamp(value) ?? value;
  }
  return value;
}
