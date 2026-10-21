import type { NextFunction, Request, Response } from 'express';
import type { Repositories } from '../db/repositories/index.js';
import { isStaffVerified, type StaffSessionState } from '../db/repositories/staff.js';
import { ErrorCode } from '../shared/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      staff?: StaffSessionState;
    }
  }
}

/**
 * Loads the staff state for the signed-in session (P6-01). Staff status is read from the
 * database, never trusted from the session payload. Non-staff get 404 so the admin area is
 * not discoverable.
 */
export function loadStaff(repos: Repositories) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const state = req.auth ? await repos.staff.getSessionState(req.auth.session.id) : null;
    if (!state?.isStaff) {
      res.status(404).json({
        error: { code: ErrorCode.NOT_FOUND, message: 'Not found.', details: {} },
      });
      return;
    }
    req.staff = state;
    next();
  };
}

/** Requires an enrolled second factor that this session has passed within the TTL. */
export function requireStaffVerified(req: Request, res: Response, next: NextFunction): void {
  if (!req.staff?.totpEnabledAt) {
    res.status(403).json({
      error: {
        code: ErrorCode.STAFF_TOTP_ENROLMENT_REQUIRED,
        message: 'Set up an authenticator app before using the staff area.',
        details: {},
      },
    });
    return;
  }
  if (!isStaffVerified(req.staff)) {
    res.status(403).json({
      error: {
        code: ErrorCode.STAFF_TOTP_REQUIRED,
        message: 'Enter the code from your authenticator app to continue.',
        details: {},
      },
    });
    return;
  }
  next();
}
