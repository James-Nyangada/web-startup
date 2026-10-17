import { Router, type Request, type Response } from 'express';
import { toNodeHandler } from 'better-auth/node';
import { z } from 'zod';
import type { Env } from '../config/env.js';
import type { Auth } from '../lib/auth.js';
import { validatePassword } from '../lib/passwords.js';
import { authRateLimiter } from '../lib/rate-limiter.js';
import type { TurnstileVerifier } from '../lib/turnstile.js';
import { ErrorCode } from '../shared/errors.js';

export function copyResponseHeaders(webRes: globalThis.Response, res: Response): void {
  webRes.headers.forEach((val, key) => {
    const lower = key.toLowerCase();
    if (lower === 'content-type' || lower === 'content-length') {
      return;
    }
    if (lower === 'set-cookie') {
      const getSetCookie = (
        webRes.headers as unknown as { getSetCookie?: () => string[] }
      ).getSetCookie;
      if (typeof getSetCookie === 'function') {
        const cookies = getSetCookie.call(webRes.headers);
        res.setHeader('Set-Cookie', cookies);
      } else {
        res.setHeader('Set-Cookie', val);
      }
    } else {
      res.setHeader(key, val);
    }
  });
}

const signUpSchema = z.object({
  email: z.string().email(),
  password: z.string(),
  name: z.string().optional(),
  turnstileToken: z.string().optional(),
});

const signInSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

const magicLinkSchema = z.object({
  email: z.string().email(),
});

const resetPasswordSchema = z.object({
  token: z.string().min(1),
  newPassword: z.string(),
});

export function authRouter(
  auth: Auth,
  verifyTurnstile: TurnstileVerifier,
  config: Pick<Env, 'APP_URL'>,
): Router {
  const router = Router();

  // POST /v1/auth/sign-up
  router.post('/sign-up', async (req: Request, res: Response): Promise<void> => {
    const parse = signUpSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Invalid registration parameters.',
          details: { issues: parse.error.issues },
        },
      });
      return;
    }

    const { email, password, name, turnstileToken } = parse.data;

    // Verify Turnstile
    const botOk = await verifyTurnstile(turnstileToken, req.ip);
    if (!botOk) {
      res.status(400).json({
        error: {
          code: ErrorCode.BOT_CHECK_FAILED,
          message: 'Bot protection check failed.',
          details: {},
        },
      });
      return;
    }

    // Password validation: min 10 chars, not common
    const pwCheck = validatePassword(password);
    if (!pwCheck.valid) {
      res.status(400).json({
        error: {
          code: ErrorCode.PASSWORD_TOO_WEAK,
          message: pwCheck.reason ?? 'Password is too weak.',
          details: {},
        },
      });
      return;
    }

    try {
      const webRes = await auth.api.signUpEmail({
        body: {
          email,
          password,
          name: name ?? (email.split('@')[0] || 'User'),
        },
        headers: req.headers,
        asResponse: true,
      });

      if (!webRes.ok) {
        const body = (await webRes.json().catch(() => ({}))) as Record<string, unknown>;
        const message = typeof body.message === 'string' ? body.message : '';
        if (webRes.status === 400 || message.toLowerCase().includes('already exists')) {
          res.status(409).json({
            error: {
              code: ErrorCode.EMAIL_ALREADY_EXISTS,
              message: 'An account with this email already exists. Please sign in instead.',
              details: {},
            },
          });
          return;
        }

        res.status(webRes.status).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: message || 'Registration failed.',
            details: body,
          },
        });
        return;
      }

      copyResponseHeaders(webRes, res);
      const data = (await webRes.json()) as Record<string, unknown>;
      res.status(201).json({
        data: {
          ...data,
          message: 'Account created. Please check your email to verify your address.',
        },
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      if (message.toLowerCase().includes('already exists')) {
        res.status(409).json({
          error: {
            code: ErrorCode.EMAIL_ALREADY_EXISTS,
            message: 'An account with this email already exists. Please sign in instead.',
            details: {},
          },
        });
        return;
      }
      throw err;
    }
  });

  // POST /v1/auth/sign-in
  router.post('/sign-in', async (req: Request, res: Response): Promise<void> => {
    const parse = signInSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Email and password are required.',
          details: { issues: parse.error.issues },
        },
      });
      return;
    }

    const { email, password } = parse.data;
    const rateKey = `sign-in:${email.toLowerCase()}:${req.ip ?? 'unknown'}`;
    const rateCheck = authRateLimiter.check(rateKey, 5, 15 * 60_000);

    if (!rateCheck.allowed) {
      const minutesRemaining = Math.ceil(rateCheck.resetInMs / 60_000);
      res.status(429).json({
        error: {
          code: ErrorCode.RATE_LIMITED,
          message: `Too many sign-in attempts. Please try again in ${minutesRemaining} minutes.`,
          details: { retryAfterSeconds: Math.ceil(rateCheck.resetInMs / 1000) },
        },
      });
      return;
    }

    try {
      const webRes = await auth.api.signInEmail({
        body: { email, password },
        headers: req.headers,
        asResponse: true,
      });

      if (!webRes.ok) {
        authRateLimiter.record(rateKey, 15 * 60_000);
        res.status(401).json({
          error: {
            code: ErrorCode.INVALID_CREDENTIALS,
            message: 'Email or password is incorrect.',
            details: {},
          },
        });
        return;
      }

      authRateLimiter.reset(rateKey);
      copyResponseHeaders(webRes, res);
      const data = await webRes.json();
      res.status(200).json({ data });
    } catch {
      authRateLimiter.record(rateKey, 15 * 60_000);
      res.status(401).json({
        error: {
          code: ErrorCode.INVALID_CREDENTIALS,
          message: 'Email or password is incorrect.',
          details: {},
        },
      });
    }
  });

  // POST /v1/auth/magic-link
  router.post('/magic-link', async (req: Request, res: Response): Promise<void> => {
    const parse = magicLinkSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'A valid email address is required.',
          details: { issues: parse.error.issues },
        },
      });
      return;
    }

    try {
      await auth.api.signInMagicLink({
        body: { email: parse.data.email },
        headers: req.headers,
      });
    } catch {
      // Do not disclose whether email exists
    }

    res.status(200).json({
      data: {
        message: 'If that email address exists in our system, a sign-in link has been sent.',
      },
    });
  });

  // GET /v1/auth/magic-link/verify?token=
  router.get('/magic-link/verify', async (req: Request, res: Response): Promise<void> => {
    const token = req.query.token as string | undefined;
    if (!token) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Missing verification token.',
          details: {},
        },
      });
      return;
    }

    try {
      const webRes = await auth.api.magicLinkVerify({
        query: { token },
        headers: req.headers,
        asResponse: true,
      });

      if (!webRes.ok) {
        res.status(400).json({
          error: {
            code: ErrorCode.INVALID_TOKEN,
            message: 'Invalid or expired magic link.',
            details: {},
          },
        });
        return;
      }

      copyResponseHeaders(webRes, res);
      const data = (await webRes.json()) as Record<string, unknown>;
      res.status(200).json({ data: { verified: true, ...data } });
    } catch {
      res.status(400).json({
        error: {
          code: ErrorCode.INVALID_TOKEN,
          message: 'Invalid or expired magic link.',
          details: {},
        },
      });
    }
  });

  // POST /v1/auth/sign-out
  router.post('/sign-out', async (req: Request, res: Response): Promise<void> => {
    try {
      const webRes = await auth.api.signOut({
        headers: req.headers,
        asResponse: true,
      });
      copyResponseHeaders(webRes, res);
      res.status(200).json({ data: { success: true } });
    } catch {
      res.status(200).json({ data: { success: true } });
    }
  });

  // POST /v1/auth/verify-email
  router.post('/verify-email', async (req: Request, res: Response): Promise<void> => {
    const body = (typeof req.body === 'object' && req.body !== null ? req.body : {}) as Record<string, unknown>;
    const token = typeof body.token === 'string' ? body.token : typeof req.query.token === 'string' ? req.query.token : undefined;
    if (!token) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Missing verification token.',
          details: {},
        },
      });
      return;
    }

    try {
      const webRes = await auth.api.verifyEmail({
        query: { token },
        headers: req.headers,
        asResponse: true,
      });

      if (!webRes.ok) {
        res.status(400).json({
          error: {
            code: ErrorCode.INVALID_TOKEN,
            message: 'Invalid or expired email verification token.',
            details: {},
          },
        });
        return;
      }

      res.status(200).json({
        data: {
          verified: true,
          message: 'Your email address has been verified.',
        },
      });
    } catch {
      res.status(400).json({
        error: {
          code: ErrorCode.INVALID_TOKEN,
          message: 'Invalid or expired email verification token.',
          details: {},
        },
      });
    }
  });

  // POST /v1/auth/forgot-password
  router.post('/forgot-password', async (req: Request, res: Response): Promise<void> => {
    const parse = magicLinkSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'A valid email address is required.',
          details: { issues: parse.error.issues },
        },
      });
      return;
    }

    try {
      await auth.api.requestPasswordReset({
        body: {
          email: parse.data.email,
          redirectTo: `${config.APP_URL}/reset-password`,
        },
        headers: req.headers,
      });
    } catch {
      // Do not disclose whether email exists
    }

    res.status(200).json({
      data: {
        message: 'If that email address exists in our system, a password reset link has been sent.',
      },
    });
  });

  // POST /v1/auth/reset-password
  router.post('/reset-password', async (req: Request, res: Response): Promise<void> => {
    const parse = resetPasswordSchema.safeParse(req.body);
    if (!parse.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Token and new password are required.',
          details: { issues: parse.error.issues },
        },
      });
      return;
    }

    const { token, newPassword } = parse.data;
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
      res.status(400).json({
        error: {
          code: ErrorCode.PASSWORD_TOO_WEAK,
          message: pwCheck.reason ?? 'Password is too weak.',
          details: {},
        },
      });
      return;
    }

    try {
      const webRes = await auth.api.resetPassword({
        body: { token, newPassword },
        headers: req.headers,
        asResponse: true,
      });

      if (!webRes.ok) {
        res.status(400).json({
          error: {
            code: ErrorCode.INVALID_TOKEN,
            message: 'Invalid or expired password reset link.',
            details: {},
          },
        });
        return;
      }

      res.status(200).json({
        data: {
          success: true,
          message: 'Your password has been reset. You can now sign in with your new password.',
        },
      });
    } catch {
      res.status(400).json({
        error: {
          code: ErrorCode.INVALID_TOKEN,
          message: 'Invalid or expired password reset link.',
          details: {},
        },
      });
    }
  });

  // Mount Better Auth's standard handler for OAuth and other built-in flows
  router.use(toNodeHandler(auth));

  return router;
}
