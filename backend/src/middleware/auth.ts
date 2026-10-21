import type { NextFunction, Request, Response } from 'express';
import type { Auth, AuthSession, AuthUser } from '../lib/auth.js';
import { ErrorCode } from '../shared/errors.js';
import { MemoryRateLimiter } from '../lib/rate-limiter.js';

/** Spec 11.1: general limit of 300 requests a minute per signed-in user. */
export const USER_RATE_LIMIT = 300;
const userRateLimiter = new MemoryRateLimiter();

/** Tests that make hundreds of requests as one user reset the general limit between batches. */
export function resetUserRateLimit(userId: string): void {
  userRateLimiter.reset(`user:${userId}`);
}

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      auth?: {
        user: AuthUser & { isStaff?: boolean };
        session: AuthSession;
      };
    }
  }
}

export function requireAuth(auth: Auth) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      if (!session) {
        res.status(401).json({
          error: {
            code: ErrorCode.UNAUTHENTICATED,
            message: 'You must be signed in to perform this action.',
            details: {},
          },
        });
        return;
      }
      const key = `user:${session.user.id}`;
      const limit = userRateLimiter.check(key, USER_RATE_LIMIT, 60_000);
      if (!limit.allowed) {
        const retryAfter = Math.max(1, Math.ceil(limit.resetInMs / 1000));
        res.setHeader('Retry-After', String(retryAfter));
        res.status(429).json({
          error: {
            code: ErrorCode.RATE_LIMITED,
            message: 'Too many requests. Please slow down and try again in a moment.',
            details: { retryAfterSeconds: retryAfter },
          },
        });
        return;
      }
      userRateLimiter.record(key, 60_000);
      req.auth = session;
      next();
    } catch (err) {
      next(err);
    }
  };
}

export function optionalAuth(auth: Auth) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await auth.api.getSession({ headers: req.headers });
      if (session) {
        req.auth = session;
      }
      next();
    } catch {
      next();
    }
  };
}
