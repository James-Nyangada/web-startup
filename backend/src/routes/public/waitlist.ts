import { Router } from 'express';
import { z } from 'zod';
import type { Repositories } from '../../db/repositories/index.js';
import { AppError } from '../../lib/app-error.js';
import type { TurnstileVerifier } from '../../lib/turnstile.js';
import { ErrorCode } from '../../shared/errors.js';

export const waitlistBody = z.object({
  // Trim before validating so pasted addresses with stray spaces are accepted.
  email: z
    .string({ error: 'Enter a valid email address.' })
    .trim()
    .toLowerCase()
    .pipe(z.email({ error: 'Enter a valid email address.' }).max(254)),
  consent: z.boolean({ error: 'consent must be true or false.' }),
  source: z.string().trim().max(100).optional(),
  turnstileToken: z.string().max(2048).optional(),
});

export function waitlistRouter(repos: Repositories, verifyTurnstile: TurnstileVerifier): Router {
  const router = Router();

  router.post('/waitlist', async (req, res) => {
    const input = waitlistBody.parse(req.body);

    if (!(await verifyTurnstile(input.turnstileToken, req.ip))) {
      throw new AppError(400, ErrorCode.BOT_CHECK_FAILED, 'Bot check failed. Please try again.');
    }

    await repos.waitlist.join({ email: input.email, consent: input.consent, source: input.source });

    // Same response whether or not the email was already listed, so the endpoint
    // cannot be used to discover who signed up.
    res.status(201).json({ data: { status: 'joined' } });
  });

  return router;
}
