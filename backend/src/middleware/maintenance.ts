import type { NextFunction, Request, Response } from 'express';
import { ErrorCode } from '../shared/errors.js';

/** Paths that keep working during maintenance: monitoring and Caddy's TLS check. */
const ALWAYS_OPEN = ['/health', '/internal/'];

/**
 * MAINTENANCE_MODE=true (P6-12): every API request except health checks gets 503 with
 * Retry-After, and the web app shows its maintenance page. Paddle retries webhooks that
 * get a non-2xx, so none are lost.
 */
export function maintenanceMode(enabled: boolean, retryAfterSeconds = 600) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!enabled || ALWAYS_OPEN.some((p) => req.path === p || req.path.startsWith(p))) {
      next();
      return;
    }
    res.setHeader('Retry-After', String(retryAfterSeconds));
    res.status(503).json({
      error: {
        code: ErrorCode.MAINTENANCE,
        message: 'We are doing scheduled maintenance. Please try again in a few minutes.',
        details: { retryAfterSeconds },
      },
    });
  };
}
