import type { Request, Response, NextFunction } from 'express';

const API_KEY = process.env.API_KEY;

/**
 * Optional API key auth. When API_KEY env is unset, auth is disabled (dev mode).
 */
export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  if (!API_KEY) {
    next();
    return;
  }

  const headerKey = req.header('x-api-key');
  if (headerKey !== API_KEY) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  next();
}
