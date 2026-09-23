import type { Request, Response, NextFunction } from 'express';
import { AppError } from '../errors/app-error';
import multer from 'multer';

/**
 * Centralized error-handling middleware.
 * Intercepts all synchronous and asynchronous errors forwarded via next(err).
 */
export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Operational application errors (NotFoundError, ValidationError, etc.)
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      error: err.message,
      statusCode: err.statusCode,
    });
    return;
  }

  // Multer file upload errors
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      res.status(400).json({
        error: 'File size exceeds the 5MB limit',
        statusCode: 400,
      });
      return;
    }
    res.status(400).json({
      error: `Upload error: ${err.message}`,
      statusCode: 400,
    });
    return;
  }

  // Handle custom fileFilter errors from Multer
  if (err instanceof Error && err.message.includes('permitted')) {
    res.status(400).json({
      error: err.message,
      statusCode: 400,
    });
    return;
  }

  // JSON syntax errors in request body
  if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      error: 'Malformed JSON payload in request body',
      statusCode: 400,
    });
    return;
  }

  // Unhandled / server errors
  console.error('Unhandled server error:', err);
  res.status(500).json({
    error: 'Internal server error',
    statusCode: 500,
  });
}
