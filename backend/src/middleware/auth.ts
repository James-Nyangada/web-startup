import type { NextFunction, Request, Response } from 'express';
import type { Auth, AuthSession, AuthUser } from '../lib/auth.js';
import { ErrorCode } from '../shared/errors.js';

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
