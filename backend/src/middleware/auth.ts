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

/**
 * Polls the app makes on its own (notification bell, scan progress) send this header so they
 * do not count as activity and keep an idle session alive.
 */
export const BACKGROUND_REQUEST_HEADER = 'x-background-request';

/**
 * Loads the session and, for real activity, slides its expiry forward. Better Auth returns the
 * refreshed cookie as response headers, which must reach the browser or the cookie's own
 * max-age would still end the session.
 */
async function loadSession(auth: Auth, req: Request, res: Response) {
  const background = req.get(BACKGROUND_REQUEST_HEADER) === '1';
  const { headers, response } = await auth.api.getSession({
    headers: req.headers,
    query: { disableRefresh: background },
    returnHeaders: true,
  });
  const cookies = headers.getSetCookie();
  if (cookies.length > 0) res.append('Set-Cookie', cookies);
  return response;
}

export interface RequireAuthOptions {
  /** Let a session through that still owes its second factor (the 2FA endpoints and /me). */
  allowMfaPending?: boolean;
}

export function requireAuth(auth: Auth, options: RequireAuthOptions = {}) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await loadSession(auth, req, res);
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
      if (session.session.mfaPending && !options.allowMfaPending) {
        res.status(403).json({
          error: {
            code: ErrorCode.MFA_REQUIRED,
            message: 'Two-step verification is required to continue.',
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
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const session = await loadSession(auth, req, res);
      if (session && !session.session.mfaPending) {
        req.auth = session;
      }
      next();
    } catch {
      next();
    }
  };
}
