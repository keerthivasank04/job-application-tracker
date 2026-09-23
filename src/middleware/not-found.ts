import type { Request, Response } from 'express';

/**
 * 404 Not Found handler for undefined routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: `Route ${req.method} ${req.originalUrl} not found`,
    statusCode: 404,
  });
}
