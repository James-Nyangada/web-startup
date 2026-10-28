import { describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import type { Repositories } from '../../src/db/repositories/index.js';
import { buildTestApp, fakeRepos, mockAuth } from '../helpers/fakes.js';
import { encrypt } from '../../src/lib/encryption.js';
import { generateTotpSecret, totpCode } from '../../src/lib/totp.js';

function setup(opts: { mfaPending?: boolean; totp?: boolean } = {}) {
  const userId = 'user-1';
  const auth = mockAuth(userId);
  Object.assign(auth.mockSession, { mfaPending: Boolean(opts.mfaPending) });
  const secret = generateTotpSecret();
  const row = {
    userId,
    totpSecretEncrypted: encrypt(secret),
    totpEnabledAt: opts.totp ? new Date() : null,
    recoveryCodeHashes: [] as string[],
  };
  const { repos } = fakeRepos();
  const mfa = {
    getRow: vi.fn().mockResolvedValue(row),
    listPasskeys: vi.fn().mockResolvedValue([]),
    consumeRecoveryCode: vi.fn().mockResolvedValue(false),
    markVerified: vi.fn().mockResolvedValue(undefined),
    enableTotp: vi.fn().mockResolvedValue(undefined),
    setPendingTotp: vi.fn().mockResolvedValue(undefined),
  };
  (repos as unknown as Record<string, unknown>).mfa = mfa;
  repos.users.findById = vi.fn().mockResolvedValue({ id: userId, email: 'u@example.com' });
  const { app } = buildTestApp({ auth, repos: repos as unknown as Repositories });
  return { app, auth, mfa, secret };
}

describe('two-step verification', () => {
  it('lets a pending session verify with an authenticator code, once', async () => {
    const { app, auth, mfa, secret } = setup({ mfaPending: true, totp: true });
    const res = await request(app)
      .post('/v1/mfa/verify/code')
      .set('Cookie', auth.cookie)
      .send({ code: totpCode(secret) });
    expect(res.status).toBe(200);
    expect(mfa.markVerified).toHaveBeenCalledWith('session-user-1', 'user-1');
  });

  it('rejects a wrong code without verifying the session', async () => {
    const { app, auth, mfa } = setup({ mfaPending: true, totp: true });
    const res = await request(app)
      .post('/v1/mfa/verify/code')
      .set('Cookie', auth.cookie)
      .send({ code: '000000' });
    expect(res.status).toBe(400);
    expect(mfa.markVerified).not.toHaveBeenCalled();
  });

  it('blocks a pending session from the rest of the API', async () => {
    const { app, auth } = setup({ mfaPending: true, totp: true });
    const res = await request(app).get('/v1/notifications').set('Cookie', auth.cookie);
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('MFA_REQUIRED');
  });

  it('blocks a pending session from changing 2FA settings', async () => {
    const { app, auth } = setup({ mfaPending: true, totp: true });
    const res = await request(app).post('/v1/mfa/totp/setup').set('Cookie', auth.cookie);
    expect(res.status).toBe(403);
  });

  it('enrols an authenticator and returns recovery codes once', async () => {
    const { app, auth, mfa, secret } = setup();
    const res = await request(app)
      .post('/v1/mfa/totp/enable')
      .set('Cookie', auth.cookie)
      .send({ code: totpCode(secret) });
    expect(res.status).toBe(200);
    expect(res.body.data.recoveryCodes).toHaveLength(10);
    expect(mfa.enableTotp).toHaveBeenCalled();
    expect(mfa.markVerified).toHaveBeenCalled();
  });
});
