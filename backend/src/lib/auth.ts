import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
import { eq } from 'drizzle-orm';
import type { Database } from '../db/client.js';
import * as schema from '../db/schema/index.js';
import { newId } from './ids.js';

export interface EmailData {
  email: string;
  token: string;
  url: string;
}

export interface AuthMailer {
  sendVerificationEmail(data: EmailData): Promise<void>;
  sendMagicLink(data: EmailData): Promise<void>;
  sendResetPassword(data: EmailData): Promise<void>;
  sendPasswordChangedNotice?(data: { email: string }): Promise<void>;
}

export interface CreateAuthOptions {
  secret: string;
  baseURL: string;
  googleClientId?: string;
  googleClientSecret?: string;
  mailer?: AuthMailer;
  /** Extra origins allowed to sign in, e.g. verified custom portal domains (P6-07). */
  trustedOrigins?: (request?: Request) => Promise<string[]>;
  /** Spec 11.1: share the session cookie between app.<domain> and api.<domain>. */
  cookieDomain?: string;
  /** Secure cookies; on whenever the base URL is https. */
  secureCookies?: boolean;
}

/** A signed-in session ends after 30 minutes with no activity. */
export const SESSION_IDLE_TIMEOUT_SECONDS = 30 * 60;
/** Activity slides the expiry forward at most once a minute, to spare the database. */
const SESSION_REFRESH_INTERVAL_SECONDS = 60;

/** After a second-factor check the user is not asked again for this long. */
export const MFA_TRUST_WINDOW_MS = 24 * 60 * 60 * 1000;

/** True when a new session must pass a second factor: they have one set up and none in 24 hours. */
async function sessionNeedsMfa(db: Database, userId: string): Promise<boolean> {
  const [mfa] = await db
    .select({ totpEnabledAt: schema.userMfa.totpEnabledAt })
    .from(schema.userMfa)
    .where(eq(schema.userMfa.userId, userId))
    .limit(1);
  let enabled = Boolean(mfa?.totpEnabledAt);
  if (!enabled) {
    const [passkey] = await db
      .select({ id: schema.userPasskeys.id })
      .from(schema.userPasskeys)
      .where(eq(schema.userPasskeys.userId, userId))
      .limit(1);
    enabled = Boolean(passkey);
  }
  if (!enabled) return false;
  const [user] = await db
    .select({ lastMfaAt: schema.users.lastMfaAt })
    .from(schema.users)
    .where(eq(schema.users.id, userId))
    .limit(1);
  return !user?.lastMfaAt || Date.now() - user.lastMfaAt.getTime() > MFA_TRUST_WINDOW_MS;
}

export function createAuth(db: Database, options: CreateAuthOptions) {
  return betterAuth({
    session: {
      expiresIn: SESSION_IDLE_TIMEOUT_SECONDS,
      updateAge: SESSION_REFRESH_INTERVAL_SECONDS,
      additionalFields: {
        mfaPending: { type: 'boolean', required: false, input: false },
      },
    },
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        user: schema.users,
        session: schema.sessions,
        account: schema.accounts,
        verification: schema.verifications,
      },
    }),
    user: {
      fields: {
        image: 'avatarUrl',
      },
      additionalFields: {
        emailVerifiedAt: { type: 'date', required: false, input: false },
      },
    },
    databaseHooks: {
      session: {
        // Every way of signing in (password, magic link, Google) passes through here, so this is
        // where a session is marked as still owing its second factor.
        create: {
          before: async (session) => ({
            data: { ...session, mfaPending: await sessionNeedsMfa(db, session.userId) },
          }),
        },
      },
      user: {
        // Keep email_verified_at in step with Better Auth's boolean (sign-up via Google, link click).
        create: {
          before: (user) =>
            Promise.resolve(
              user.emailVerified ? { data: { ...user, emailVerifiedAt: new Date() } } : undefined,
            ),
        },
        update: {
          before: (data) =>
            Promise.resolve(
              data.emailVerified === true && !data.emailVerifiedAt
                ? { data: { ...data, emailVerifiedAt: new Date() } }
                : undefined,
            ),
        },
      },
    },
    // All ids are UUIDv7 columns, so Better Auth must not invent its own string ids.
    advanced: {
      database: { generateId: () => newId() },
      // Spec 11.1: HttpOnly, Secure, SameSite=Lax, domain .<domain>.
      useSecureCookies: options.secureCookies ?? options.baseURL.startsWith('https://'),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax' },
      ...(options.cookieDomain
        ? { crossSubDomainCookies: { enabled: true, domain: options.cookieDomain } }
        : {}),
    },
    secret: options.secret,
    baseURL: options.baseURL,
    ...(options.trustedOrigins ? { trustedOrigins: options.trustedOrigins } : {}),
    basePath: '/v1/auth',
    emailAndPassword: {
      enabled: true,
      minPasswordLength: 10,
      sendResetPassword: async ({ user, url, token }) => {
        if (options.mailer) {
          await options.mailer.sendResetPassword({ email: user.email, token, url });
        }
      },
      resetPasswordTokenExpiresIn: 60 * 60, // 1 hour
    },
    emailVerification: {
      sendOnSignUp: true,
      sendVerificationEmail: async ({ user, url, token }) => {
        if (options.mailer) {
          await options.mailer.sendVerificationEmail({ email: user.email, token, url });
        }
      },
      expiresIn: 7 * 24 * 60 * 60, // 7 days
    },
    plugins: [
      magicLink({
        sendMagicLink: async ({ email, token }) => {
          if (options.mailer) {
            // Better Auth's own url points at its API path on the web origin, which the web app
            // does not serve. Send the user to the /magic page, which verifies against the API.
            const url = `${options.baseURL.replace(/\/$/, '')}/magic?token=${encodeURIComponent(token)}`;
            await options.mailer.sendMagicLink({ email, token, url });
          }
        },
        expiresIn: 15 * 60, // 15 minutes
      }),
    ],
    socialProviders:
      options.googleClientId && options.googleClientSecret
        ? {
            google: {
              clientId: options.googleClientId,
              clientSecret: options.googleClientSecret,
            },
          }
        : undefined,
  });
}

export type Auth = ReturnType<typeof createAuth>;
export type Session = NonNullable<Awaited<ReturnType<Auth['api']['getSession']>>>;
export type AuthUser = Session['user'];
export type AuthSession = Session['session'];
