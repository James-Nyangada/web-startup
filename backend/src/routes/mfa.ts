import crypto from 'node:crypto';
import { Router, type Request, type Response } from 'express';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import { AppError } from '../lib/app-error.js';
import type { Auth } from '../lib/auth.js';
import { MFA_TRUST_WINDOW_MS } from '../lib/auth.js';
import { decrypt, encrypt } from '../lib/encryption.js';
import { MemoryRateLimiter } from '../lib/rate-limiter.js';
import { generateTotpSecret, totpUri, verifyTotp } from '../lib/totp.js';
import { requireAuth } from '../middleware/auth.js';
import { ErrorCode } from '../shared/errors.js';

const ATTEMPTS = 5;
const ATTEMPT_WINDOW_MS = 15 * 60 * 1000;
const CHALLENGE_TTL_MS = 5 * 60 * 1000;
const RECOVERY_CODE_COUNT = 10;
const attemptLimiter = new MemoryRateLimiter();

const codeSchema = z.object({ code: z.string().min(6).max(32) });

const hashRecoveryCode = (code: string) =>
  crypto
    .createHash('sha256')
    .update(code.replace(/[\s-]/g, '').toLowerCase())
    .digest('hex');

/** Ten codes like "a1b2c-3d4e5"; each works once if the authenticator is lost. */
function generateRecoveryCodes(): string[] {
  return Array.from({ length: RECOVERY_CODE_COUNT }, () => {
    const raw = crypto.randomBytes(5).toString('hex');
    return `${raw.slice(0, 5)}-${raw.slice(5)}`;
  });
}

export interface MfaRouterOptions {
  appUrl: string;
  issuer?: string;
}

/** Two-step verification: authenticator app (TOTP), recovery codes and passkeys. */
export function mfaRouter(auth: Auth, repos: Repositories, options: MfaRouterOptions): Router {
  const router = Router();
  const appOrigin = new URL(options.appUrl).origin;
  const rpID = new URL(options.appUrl).hostname;
  const rpName = options.issuer ?? 'EveryVisitor';
  const issuer = options.issuer ?? 'EveryVisitor';

  // The verify endpoints must work for a session that still owes its second factor.
  router.use(requireAuth(auth, { allowMfaPending: true }));

  const needFullSession = (req: Request) => {
    if (req.auth!.session.mfaPending) {
      throw new AppError(403, ErrorCode.MFA_REQUIRED, 'Verify your sign-in first.');
    }
  };

  const throttle = (userId: string) => {
    const key = `mfa:${userId}`;
    const limit = attemptLimiter.check(key, ATTEMPTS, ATTEMPT_WINDOW_MS);
    if (!limit.allowed) {
      throw new AppError(429, ErrorCode.RATE_LIMITED, 'Too many attempts. Try again later.', {
        retryAfterSeconds: Math.ceil(limit.resetInMs / 1000),
      });
    }
    return key;
  };

  /** A TOTP code or an unused recovery code. */
  const checkCode = async (userId: string, code: string): Promise<boolean> => {
    const row = await repos.mfa.getRow(userId);
    if (row?.totpSecretEncrypted && row.totpEnabledAt && verifyTotp(decrypt(row.totpSecretEncrypted), code)) {
      return true;
    }
    return repos.mfa.consumeRecoveryCode(userId, hashRecoveryCode(code));
  };

  const finishVerification = async (req: Request) => {
    await repos.mfa.markVerified(req.auth!.session.id, req.auth!.user.id);
  };

  // GET /v1/mfa - What is set up, plus whether this session still owes a check.
  router.get('/', async (req: Request, res: Response) => {
    const userId = req.auth!.user.id;
    const [row, passkeys] = await Promise.all([repos.mfa.getRow(userId), repos.mfa.listPasskeys(userId)]);
    res.json({
      data: {
        pending: Boolean(req.auth!.session.mfaPending),
        totpEnabled: Boolean(row?.totpEnabledAt),
        recoveryCodesRemaining: row?.recoveryCodeHashes.length ?? 0,
        trustWindowHours: MFA_TRUST_WINDOW_MS / 3_600_000,
        passkeys: passkeys.map((p) => ({
          id: p.id,
          name: p.name,
          deviceType: p.deviceType,
          backedUp: p.backedUp,
          createdAt: p.createdAt,
          lastUsedAt: p.lastUsedAt,
        })),
      },
    });
  });

  /* ---------- Authenticator app ---------- */

  // POST /v1/mfa/totp/setup - Start enrolment: a fresh secret and its QR URI.
  router.post('/totp/setup', async (req: Request, res: Response) => {
    needFullSession(req);
    const userId = req.auth!.user.id;
    const row = await repos.mfa.getRow(userId);
    if (row?.totpEnabledAt) {
      throw new AppError(409, ErrorCode.CONFLICT, 'An authenticator app is already set up.');
    }
    const secret = generateTotpSecret();
    await repos.mfa.setPendingTotp(userId, encrypt(secret));
    res.json({ data: { secret, otpauthUrl: totpUri(secret, req.auth!.user.email, issuer) } });
  });

  // POST /v1/mfa/totp/enable - Confirm the first code; returns the recovery codes once.
  router.post('/totp/enable', async (req: Request, res: Response) => {
    needFullSession(req);
    const userId = req.auth!.user.id;
    const { code } = codeSchema.parse(req.body);
    const key = throttle(userId);
    const row = await repos.mfa.getRow(userId);
    if (!row?.totpSecretEncrypted || row.totpEnabledAt) {
      throw new AppError(409, ErrorCode.CONFLICT, 'Start the authenticator setup first.');
    }
    if (!verifyTotp(decrypt(row.totpSecretEncrypted), code)) {
      attemptLimiter.record(key, ATTEMPT_WINDOW_MS);
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'That code is not correct. Try the next one.');
    }
    attemptLimiter.reset(key);
    let recoveryCodes: string[] | null = null;
    if (row.recoveryCodeHashes.length === 0) {
      recoveryCodes = generateRecoveryCodes();
    }
    await repos.mfa.enableTotp(userId, recoveryCodes ? recoveryCodes.map(hashRecoveryCode) : null);
    await finishVerification(req);
    res.json({ data: { enabled: true, recoveryCodes } });
  });

  // DELETE /v1/mfa/totp - Turn the authenticator off; needs a current code.
  router.delete('/totp', async (req: Request, res: Response) => {
    needFullSession(req);
    const userId = req.auth!.user.id;
    const { code } = codeSchema.parse(req.body);
    const key = throttle(userId);
    if (!(await checkCode(userId, code))) {
      attemptLimiter.record(key, ATTEMPT_WINDOW_MS);
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'That code is not correct.');
    }
    attemptLimiter.reset(key);
    await repos.mfa.disableTotp(userId);
    if (!(await repos.mfa.isEnabled(userId))) await repos.mfa.setRecoveryCodes(userId, []);
    res.json({ data: { enabled: false } });
  });

  // POST /v1/mfa/recovery-codes - Replace the recovery codes; needs a current authenticator code.
  router.post('/recovery-codes', async (req: Request, res: Response) => {
    needFullSession(req);
    const userId = req.auth!.user.id;
    const { code } = codeSchema.parse(req.body);
    const key = throttle(userId);
    const row = await repos.mfa.getRow(userId);
    if (!row?.totpSecretEncrypted || !row.totpEnabledAt || !verifyTotp(decrypt(row.totpSecretEncrypted), code)) {
      attemptLimiter.record(key, ATTEMPT_WINDOW_MS);
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'That code is not correct.');
    }
    attemptLimiter.reset(key);
    const recoveryCodes = generateRecoveryCodes();
    await repos.mfa.setRecoveryCodes(userId, recoveryCodes.map(hashRecoveryCode));
    res.json({ data: { recoveryCodes } });
  });

  /* ---------- Passkeys ---------- */

  const nameSchema = z.object({ name: z.string().trim().min(1).max(60).optional() });

  // POST /v1/mfa/passkeys/options - Begin registering a passkey on this device.
  router.post('/passkeys/options', async (req: Request, res: Response) => {
    needFullSession(req);
    const user = req.auth!.user;
    const existing = await repos.mfa.listPasskeys(user.id);
    const options = await generateRegistrationOptions({
      rpName,
      rpID,
      userName: user.email,
      userDisplayName: user.name || user.email,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: existing.map((p) => ({ id: p.credentialId, transports: p.transports })),
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
    });
    await repos.mfa.setChallenge(user.id, options.challenge, CHALLENGE_TTL_MS);
    res.json({ data: options });
  });

  // POST /v1/mfa/passkeys - Finish registration and store the passkey.
  router.post('/passkeys', async (req: Request, res: Response) => {
    needFullSession(req);
    const userId = req.auth!.user.id;
    const { name } = nameSchema.parse(req.body);
    const response = req.body?.response as RegistrationResponseJSON | undefined;
    if (!response) throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing passkey response.');
    const challenge = await repos.mfa.takeChallenge(userId);
    if (!challenge) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'The passkey request expired. Try again.');
    }
    let verified;
    try {
      verified = await verifyRegistrationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: appOrigin,
        expectedRPID: rpID,
      });
    } catch {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Could not verify this passkey.');
    }
    if (!verified.verified) {
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Could not verify this passkey.');
    }
    const { credential, credentialDeviceType, credentialBackedUp } = verified.registrationInfo;
    const passkey = await repos.mfa.addPasskey(userId, {
      credentialId: credential.id,
      publicKey: Buffer.from(credential.publicKey).toString('base64url'),
      counter: credential.counter,
      transports: credential.transports ?? [],
      deviceType: credentialDeviceType,
      backedUp: credentialBackedUp,
      name: name || 'Passkey',
    });
    await finishVerification(req);
    res.status(201).json({ data: { id: passkey.id, name: passkey.name } });
  });

  // DELETE /v1/mfa/passkeys/:id
  router.delete('/passkeys/:id', async (req: Request, res: Response) => {
    needFullSession(req);
    const removed = await repos.mfa.deletePasskey(req.auth!.user.id, String(req.params.id));
    if (!removed) throw AppError.notFound('Passkey not found.');
    res.json({ data: { success: true } });
  });

  /* ---------- Sign-in verification (also open to a pending session) ---------- */

  // POST /v1/mfa/verify/code - Authenticator or recovery code.
  router.post('/verify/code', async (req: Request, res: Response) => {
    const userId = req.auth!.user.id;
    const { code } = codeSchema.parse(req.body);
    const key = throttle(userId);
    if (!(await checkCode(userId, code))) {
      attemptLimiter.record(key, ATTEMPT_WINDOW_MS);
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'That code is not correct.');
    }
    attemptLimiter.reset(key);
    await finishVerification(req);
    res.json({ data: { verified: true } });
  });

  // POST /v1/mfa/verify/passkey/options
  router.post('/verify/passkey/options', async (req: Request, res: Response) => {
    const userId = req.auth!.user.id;
    const passkeys = await repos.mfa.listPasskeys(userId);
    if (passkeys.length === 0) {
      throw new AppError(409, ErrorCode.CONFLICT, 'No passkey is set up for this account.');
    }
    const options = await generateAuthenticationOptions({
      rpID,
      userVerification: 'preferred',
      allowCredentials: passkeys.map((p) => ({ id: p.credentialId, transports: p.transports })),
    });
    await repos.mfa.setChallenge(userId, options.challenge, CHALLENGE_TTL_MS);
    res.json({ data: options });
  });

  // POST /v1/mfa/verify/passkey
  router.post('/verify/passkey', async (req: Request, res: Response) => {
    const userId = req.auth!.user.id;
    const response = req.body?.response as AuthenticationResponseJSON | undefined;
    if (!response) throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Missing passkey response.');
    const key = throttle(userId);
    const challenge = await repos.mfa.takeChallenge(userId);
    const passkey = await repos.mfa.findPasskey(userId, response.id);
    if (!challenge || !passkey) {
      attemptLimiter.record(key, ATTEMPT_WINDOW_MS);
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Could not verify this passkey.');
    }
    let verified;
    try {
      verified = await verifyAuthenticationResponse({
        response,
        expectedChallenge: challenge,
        expectedOrigin: appOrigin,
        expectedRPID: rpID,
        credential: {
          id: passkey.credentialId,
          publicKey: Buffer.from(passkey.publicKey, 'base64url'),
          counter: passkey.counter,
          transports: passkey.transports,
        },
      });
    } catch {
      attemptLimiter.record(key, ATTEMPT_WINDOW_MS);
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Could not verify this passkey.');
    }
    if (!verified.verified) {
      attemptLimiter.record(key, ATTEMPT_WINDOW_MS);
      throw new AppError(400, ErrorCode.VALIDATION_ERROR, 'Could not verify this passkey.');
    }
    attemptLimiter.reset(key);
    await repos.mfa.touchPasskey(passkey.id, verified.authenticationInfo.newCounter);
    await finishVerification(req);
    res.json({ data: { verified: true } });
  });

  return router;
}
