import type { NextFunction, Request, Response } from 'express';
import { ErrorCode } from '../shared/errors.js';
import { hasApiKey } from './api-key.js';

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/**
 * CSRF defence for cookie-authenticated writes (spec 11.1): a browser always sends `Origin`
 * on a cross-site POST, so a write whose Origin is not one of ours is refused. Requests
 * without an Origin (server-to-server, curl) and API-key requests carry no ambient cookie
 * authority and pass. SameSite=Lax session cookies are the second layer.
 */
export function originCheck(isTrustedOrigin: (origin: string) => boolean | Promise<boolean>) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const origin = req.get('origin');
    if (SAFE.has(req.method) || !origin || hasApiKey(req) || !req.get('cookie')) {
      next();
      return;
    }
    if (await isTrustedOrigin(origin.replace(/\/$/, ''))) {
      next();
      return;
    }
    res.status(403).json({
      error: {
        code: ErrorCode.FORBIDDEN,
        message: 'This request came from a site we do not recognise.',
        details: { origin },
      },
    });
  };
}
