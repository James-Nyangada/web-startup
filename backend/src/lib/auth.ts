import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { magicLink } from 'better-auth/plugins';
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
}

export function createAuth(db: Database, options: CreateAuthOptions) {
  return betterAuth({
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
    advanced: { database: { generateId: () => newId() } },
    secret: options.secret,
    baseURL: options.baseURL,
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
        sendMagicLink: async ({ email, token, url }) => {
          if (options.mailer) {
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
