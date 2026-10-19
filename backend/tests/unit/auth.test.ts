import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../../src/lib/auth.js';
import { AuthRateLimiter } from '../../src/lib/rate-limiter.js';
import { COMMON_PASSWORDS, validatePassword } from '../../src/lib/passwords.js';
import { buildTestApp } from '../helpers/fakes.js';
import { ErrorCode } from '../../src/shared/errors.js';

describe('passwords', () => {
  it('rejects passwords shorter than 10 characters', () => {
    const res = validatePassword('short');
    expect(res.valid).toBe(false);
    expect(res.reason).toContain('at least 10 characters');
  });

  it('rejects common passwords from the blocklist', () => {
    for (const common of Array.from(COMMON_PASSWORDS).slice(0, 5)) {
      const res = validatePassword(common);
      expect(res.valid).toBe(false);
      expect(res.reason).toContain('too common');
    }
  });

  it('accepts strong, unblocked passwords', () => {
    const res = validatePassword('CorrectHorseBatteryStaple99!');
    expect(res.valid).toBe(true);
    expect(res.reason).toBeUndefined();
  });
});

describe('rate-limiter', () => {
  it('allows 5 attempts and blocks on the 6th', () => {
    const limiter = new AuthRateLimiter();
    const key = 'user@example.com:127.0.0.1';

    for (let i = 0; i < 5; i++) {
      expect(limiter.check(key, 5, 1000).allowed).toBe(true);
      limiter.record(key, 1000);
    }

    const blocked = limiter.check(key, 5, 1000);
    expect(blocked.allowed).toBe(false);
    expect(blocked.resetInMs).toBeGreaterThan(0);
  });

  it('resets attempts when cleared', () => {
    const limiter = new AuthRateLimiter();
    const key = 'test-clear';
    for (let i = 0; i < 5; i++) {
      limiter.record(key, 1000);
    }
    expect(limiter.check(key, 5, 1000).allowed).toBe(false);
    limiter.reset(key);
    expect(limiter.check(key, 5, 1000).allowed).toBe(true);
  });
});

function createMockAuth() {
  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    emailVerified: true,
    emailVerifiedAt: new Date(),
    avatarUrl: null,
    timeZone: 'UTC',
    isStaff: false,
    lastActiveOrgId: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    deletedAt: null,
  };

  const mockSession = {
    id: 'session-123',
    userId: mockUser.id,
    token: 'token-xyz',
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const api = {
    signUpEmail: vi
      .fn()
      .mockImplementation(({ body }: { body: { email: string; name?: string } }) => {
        return Promise.resolve(
          new Response(JSON.stringify({ user: { id: 'u1', email: body.email } }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }),
    signInEmail: vi.fn().mockImplementation(({ body }: { body: { password: string } }) => {
      if (body.password === 'WrongPassword123!') {
        return Promise.resolve(
          new Response(JSON.stringify({ message: 'Invalid email or password' }), {
            status: 401,
            headers: { 'Content-Type': 'application/json' },
          }),
        );
      }
      return Promise.resolve(
        new Response(JSON.stringify({ user: mockUser, session: mockSession }), {
          status: 200,
          headers: {
            'Content-Type': 'application/json',
            'Set-Cookie': 'better-auth.session_token=token-xyz; Path=/; HttpOnly; SameSite=Lax',
          },
        }),
      );
    }),
    signInMagicLink: vi.fn().mockResolvedValue({ status: true }),
    verifyEmail: vi.fn().mockImplementation(({ query }: { query?: { token?: string } }) => {
      if (query?.token === 'invalid-token') {
        return Promise.resolve(
          new Response(JSON.stringify({ message: 'Invalid token' }), { status: 400 }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ status: true }), { status: 200 }));
    }),
    signOut: vi.fn().mockImplementation(() => {
      return Promise.resolve(
        new Response(JSON.stringify({ success: true }), {
          status: 200,
          headers: {
            'Set-Cookie':
              'better-auth.session_token=; Path=/; Expires=Thu, 01 Jan 1970 00:00:00 GMT',
          },
        }),
      );
    }),
    requestPasswordReset: vi.fn().mockResolvedValue({ status: true }),
    resetPassword: vi.fn().mockImplementation(({ body }: { body: { token?: string } }) => {
      if (body?.token === 'expired-token') {
        return Promise.resolve(
          new Response(JSON.stringify({ message: 'Invalid token' }), { status: 400 }),
        );
      }
      return Promise.resolve(new Response(JSON.stringify({ status: true }), { status: 200 }));
    }),
    changePassword: vi
      .fn()
      .mockImplementation(({ body }: { body: { currentPassword?: string } }) => {
        if (body?.currentPassword === 'wrong') {
          return Promise.resolve(
            new Response(JSON.stringify({ message: 'Incorrect current password' }), {
              status: 400,
            }),
          );
        }
        return Promise.resolve(new Response(JSON.stringify({ status: true }), { status: 200 }));
      }),
    listSessions: vi.fn().mockResolvedValue([mockSession]),
    revokeSession: vi.fn().mockResolvedValue({ status: true }),
    getSession: vi
      .fn()
      .mockImplementation(
        ({ headers }: { headers?: Headers | Record<string, string | undefined> }) => {
          let cookie: string | null = null;
          if (headers instanceof Headers) {
            cookie = headers.get('cookie');
          } else if (headers && typeof headers === 'object' && 'cookie' in headers) {
            cookie = (headers.cookie as string) ?? null;
          }
          if (cookie && cookie.includes('token-xyz')) {
            return Promise.resolve({ user: mockUser, session: mockSession });
          }
          return Promise.resolve(null);
        },
      ),
  };

  return { api, mockUser, mockSession } as unknown as Auth & {
    api: typeof api;
    mockUser: typeof mockUser;
    mockSession: typeof mockSession;
  };
}

describe('auth endpoints', () => {
  let mockAuth: ReturnType<typeof createMockAuth>;

  beforeEach(() => {
    mockAuth = createMockAuth();
  });

  describe('POST /v1/auth/sign-up', () => {
    it('returns 400 when missing email or password', async () => {
      const { app } = buildTestApp({ auth: mockAuth });
      const res = await request(app).post('/v1/auth/sign-up').send({ email: 'bad' }).expect(400);

      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('returns 400 when turnstile verification fails', async () => {
      const { app } = buildTestApp({
        auth: mockAuth,
        turnstile: () => Promise.resolve(false),
      });

      const res = await request(app)
        .post('/v1/auth/sign-up')
        .send({
          email: 'test@example.com',
          password: 'SuperSecretPassword123!',
          turnstileToken: 'bad-turnstile',
        })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.BOT_CHECK_FAILED);
    });

    it('returns 400 when password is too weak or common', async () => {
      const { app } = buildTestApp({ auth: mockAuth });
      const res = await request(app)
        .post('/v1/auth/sign-up')
        .send({
          email: 'test@example.com',
          password: 'password123',
        })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.PASSWORD_TOO_WEAK);
    });

    it('returns 409 when user already exists', async () => {
      mockAuth.api.signUpEmail.mockResolvedValueOnce(
        new Response(JSON.stringify({ message: 'User already exists' }), {
          status: 400,
          headers: { 'Content-Type': 'application/json' },
        }),
      );

      const { app } = buildTestApp({ auth: mockAuth });
      const res = await request(app)
        .post('/v1/auth/sign-up')
        .send({
          email: 'existing@example.com',
          password: 'StrongUniquePassword123!',
        })
        .expect(409);

      expect(res.body.error.code).toBe(ErrorCode.EMAIL_ALREADY_EXISTS);
    });

    it('returns 201 on successful registration', async () => {
      const { app } = buildTestApp({ auth: mockAuth });
      const res = await request(app)
        .post('/v1/auth/sign-up')
        .send({
          email: 'newuser@example.com',
          password: 'StrongUniquePassword123!',
          name: 'Newbie',
        })
        .expect(201);

      expect(res.body.data.message).toContain('Account created');
      expect(mockAuth.api.signUpEmail).toHaveBeenCalledWith(
        expect.objectContaining({
          body: {
            email: 'newuser@example.com',
            password: 'StrongUniquePassword123!',
            name: 'Newbie',
          },
        }),
      );
    });
  });

  describe('POST /v1/auth/sign-in', () => {
    it('returns 400 when missing credentials', async () => {
      const { app } = buildTestApp({ auth: mockAuth });
      const res = await request(app).post('/v1/auth/sign-in').send({}).expect(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('returns 401 with generic message on wrong credentials', async () => {
      const { app } = buildTestApp({ auth: mockAuth });
      const res = await request(app)
        .post('/v1/auth/sign-in')
        .send({
          email: 'test@example.com',
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(res.body.error.code).toBe(ErrorCode.INVALID_CREDENTIALS);
      expect(res.body.error.message).toBe('Email or password is incorrect.');
    });

    it('returns 200 and sets cookie on valid sign-in', async () => {
      const { app } = buildTestApp({ auth: mockAuth });
      const res = await request(app)
        .post('/v1/auth/sign-in')
        .send({
          email: 'test@example.com',
          password: 'ValidPassword123!',
        })
        .expect(200);

      expect(res.headers['set-cookie']).toBeDefined();
      expect(res.body.data.user.email).toBe('test@example.com');
    });

    it('rate limits after 5 failed attempts per email + IP', async () => {
      const { app } = buildTestApp({ auth: mockAuth });
      const email = 'ratelimited@example.com';

      for (let i = 0; i < 5; i++) {
        await request(app)
          .post('/v1/auth/sign-in')
          .send({ email, password: 'WrongPassword123!' })
          .expect(401);
      }

      const res = await request(app)
        .post('/v1/auth/sign-in')
        .send({ email, password: 'WrongPassword123!' })
        .expect(429);

      expect(res.body.error.code).toBe(ErrorCode.RATE_LIMITED);
      expect(res.body.error.message).toContain('Too many sign-in attempts');
    });
  });

  describe('POST /v1/auth/magic-link', () => {
    it('returns 200 without disclosing email existence', async () => {
      const { app } = buildTestApp({ auth: mockAuth });
      const res = await request(app)
        .post('/v1/auth/magic-link')
        .send({ email: 'nonexistent@example.com' })
        .expect(200);

      expect(res.body.data.message).toContain('If that email address exists');
      expect(mockAuth.api.signInMagicLink).toHaveBeenCalledWith(
        expect.objectContaining({
          body: { email: 'nonexistent@example.com' },
        }),
      );
    });
  });

  describe('POST /v1/auth/verify-email', () => {
    it('returns 400 when token is missing', async () => {
      const { app } = buildTestApp({ auth: mockAuth });
      const res = await request(app).post('/v1/auth/verify-email').send({}).expect(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('returns 400 when token is invalid', async () => {
      const { app } = buildTestApp({ auth: mockAuth });
      const res = await request(app)
        .post('/v1/auth/verify-email')
        .send({ token: 'invalid-token' })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.INVALID_TOKEN);
    });

    it('returns 200 when token is valid', async () => {
      const { app } = buildTestApp({ auth: mockAuth });
      const res = await request(app)
        .post('/v1/auth/verify-email')
        .send({ token: 'valid-token' })
        .expect(200);

      expect(res.body.data.verified).toBe(true);
    });
  });

  describe('POST /v1/auth/forgot-password and reset-password', () => {
    it('forgot-password returns 200 without disclosing email', async () => {
      const { app } = buildTestApp({ auth: mockAuth });
      const res = await request(app)
        .post('/v1/auth/forgot-password')
        .send({ email: 'any@example.com' })
        .expect(200);

      expect(res.body.data.message).toContain('If that email address exists');
    });

    it('reset-password rejects weak password', async () => {
      const { app } = buildTestApp({ auth: mockAuth });
      const res = await request(app)
        .post('/v1/auth/reset-password')
        .send({ token: 'some-token', newPassword: 'short' })
        .expect(400);

      expect(res.body.error.code).toBe(ErrorCode.PASSWORD_TOO_WEAK);
    });

    it('reset-password resets successfully', async () => {
      const { app } = buildTestApp({ auth: mockAuth });
      const res = await request(app)
        .post('/v1/auth/reset-password')
        .send({ token: 'valid-token', newPassword: 'BrandNewSecurePassword123!' })
        .expect(200);

      expect(res.body.data.success).toBe(true);
    });
  });

  describe('POST /v1/auth/sign-out', () => {
    it('clears session and returns 200', async () => {
      const { app } = buildTestApp({ auth: mockAuth });
      const res = await request(app).post('/v1/auth/sign-out').expect(200);
      expect(res.body.data.success).toBe(true);
    });
  });
});

describe('profile (/v1/me) endpoints', () => {
  let mockAuth: ReturnType<typeof createMockAuth>;

  beforeEach(() => {
    mockAuth = createMockAuth();
  });

  it('GET /v1/me returns 401 when unauthenticated', async () => {
    const { app } = buildTestApp({ auth: mockAuth });
    const res = await request(app).get('/v1/me').expect(401);
    expect(res.body.error.code).toBe(ErrorCode.UNAUTHENTICATED);
  });

  it('GET /v1/me returns user profile and memberships when authenticated', async () => {
    const { app, repos } = buildTestApp({ auth: mockAuth });
    vi.mocked(repos.users.findById).mockResolvedValueOnce(mockAuth.mockUser);
    vi.mocked(repos.users.listMemberships).mockResolvedValueOnce([
      {
        id: 'mem-1',
        orgId: 'org-1',
        role: 'owner',
        createdAt: new Date(),
        org: {
          id: 'org-1',
          name: 'Acme Corp',
          slug: 'acme-corp',
          type: 'store' as const,
          plan: 'trial',
          billingStatus: 'trialing',
          timeZone: 'UTC',
          trialEndsAt: null,
        },
      },
    ]);

    const res = await request(app)
      .get('/v1/me')
      .set('Cookie', 'better-auth.session_token=token-xyz')
      .expect(200);

    expect(res.body.data.user.email).toBe('test@example.com');
    expect(res.body.data.memberships).toHaveLength(1);
    expect(res.body.data.activeOrg.slug).toBe('acme-corp');
  });

  it('PATCH /v1/me updates profile name and timezone', async () => {
    const { app, repos } = buildTestApp({ auth: mockAuth });
    vi.mocked(repos.users.update).mockResolvedValueOnce({
      ...mockAuth.mockUser,
      name: 'Updated Name',
      timeZone: 'America/New_York',
    });

    const res = await request(app)
      .patch('/v1/me')
      .set('Cookie', 'better-auth.session_token=token-xyz')
      .send({ name: 'Updated Name', timeZone: 'America/New_York' })
      .expect(200);

    expect(res.body.data.user.name).toBe('Updated Name');
    expect(repos.users.update).toHaveBeenCalledWith(
      mockAuth.mockUser.id,
      expect.objectContaining({ name: 'Updated Name' }),
    );
  });

  it('POST /v1/me/change-password rejects weak new password', async () => {
    const { app } = buildTestApp({ auth: mockAuth });
    const res = await request(app)
      .post('/v1/me/change-password')
      .set('Cookie', 'better-auth.session_token=token-xyz')
      .send({ currentPassword: 'oldPassword123!', newPassword: '123' })
      .expect(400);

    expect(res.body.error.code).toBe(ErrorCode.PASSWORD_TOO_WEAK);
  });

  it('POST /v1/me/change-password succeeds with valid password', async () => {
    const { app } = buildTestApp({ auth: mockAuth });
    const res = await request(app)
      .post('/v1/me/change-password')
      .set('Cookie', 'better-auth.session_token=token-xyz')
      .send({
        currentPassword: 'oldPassword123!',
        newPassword: 'BrandNewSecurePassword123!',
      })
      .expect(200);

    expect(res.body.data.success).toBe(true);
  });

  it('GET /v1/me/sessions lists active sessions', async () => {
    const { app } = buildTestApp({ auth: mockAuth });
    const res = await request(app)
      .get('/v1/me/sessions')
      .set('Cookie', 'better-auth.session_token=token-xyz')
      .expect(200);

    expect(res.body.data.sessions).toHaveLength(1);
  });

  it('DELETE /v1/me/sessions/:id revokes a session', async () => {
    const { app } = buildTestApp({ auth: mockAuth });
    const res = await request(app)
      .delete('/v1/me/sessions/session-123')
      .set('Cookie', 'better-auth.session_token=token-xyz')
      .expect(200);

    expect(res.body.data.success).toBe(true);
    expect(mockAuth.api.revokeSession).toHaveBeenCalled();
  });

  it('DELETE /v1/me blocks if user is sole owner of an active org', async () => {
    const { app, repos } = buildTestApp({ auth: mockAuth });
    vi.mocked(repos.users.isSoleOwnerOfActiveOrg).mockResolvedValueOnce(true);

    const res = await request(app)
      .delete('/v1/me')
      .set('Cookie', 'better-auth.session_token=token-xyz')
      .expect(422);

    expect(res.body.error.code).toBe(ErrorCode.ACCOUNT_DELETION_BLOCKED);
    expect(res.body.error.message).toContain('sole owner');
  });

  it('DELETE /v1/me soft deletes account if not sole owner', async () => {
    const { app, repos } = buildTestApp({ auth: mockAuth });
    vi.mocked(repos.users.isSoleOwnerOfActiveOrg).mockResolvedValueOnce(false);

    const res = await request(app)
      .delete('/v1/me')
      .set('Cookie', 'better-auth.session_token=token-xyz')
      .expect(200);

    expect(res.body.data.success).toBe(true);
    expect(repos.users.softDelete).toHaveBeenCalledWith(mockAuth.mockUser.id);
  });
});
