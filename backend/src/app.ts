import * as Sentry from '@sentry/node';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import type pg from 'pg';
import type { Env } from './config/env.js';
import { createDb } from './db/client.js';
import type { Repositories } from './db/repositories/index.js';
import { createAuth, type Auth } from './lib/auth.js';
import type { TurnstileVerifier } from './lib/turnstile.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';
import { orgsRouter } from './routes/orgs.js';
import { detectPlatformRouter } from './routes/sites.js';
import { waitlistRouter } from './routes/public/waitlist.js';
import { publicPlansRouter } from './routes/public/plans.js';
import {
  freeChecksPublicRouter,
  type FreeChecksRouterOptions,
} from './routes/public/free-checks.js';
import type { ScansRouterOptions } from './routes/scans.js';
import { EmailSender } from './emails/sender.js';
import { createEmailPreviewRouter } from './emails/preview-router.js';
import { invitationsRouter } from './routes/invitations.js';
import { reportsPublicRouter } from './routes/reports.js';
import { paddleWebhookRouter } from './routes/billing.js';
import { getStorage, type StorageService } from './storage/index.js';
import { portalRouter } from './routes/portal.js';

declare module 'http' {
  interface IncomingMessage {
    rawBody?: Buffer;
  }
}

export interface AppDeps {
  config: Pick<
    Env,
    | 'APP_URL'
    | 'SITE_URL'
    | 'CORS_ORIGINS'
    | 'SENTRY_DSN_API'
    | 'AUTH_SECRET'
    | 'GOOGLE_CLIENT_ID'
    | 'GOOGLE_CLIENT_SECRET'
  >;
  pool: pg.Pool;
  repos: Repositories;
  verifyTurnstile: TurnstileVerifier;
  auth?: Auth;
  scansOptions?: ScansRouterOptions;
  emailSender?: EmailSender;
  storage?: StorageService;
  freeChecksOptions?: FreeChecksRouterOptions;
}

export function createApp({
  config,
  pool,
  repos,
  verifyTurnstile,
  auth: injectedAuth,
  scansOptions,
  emailSender: injectedEmailSender,
  storage: injectedStorage,
  freeChecksOptions,
}: AppDeps): express.Express {
  const app = express();
  const emailSender = injectedEmailSender ?? new EmailSender();
  const storage = injectedStorage ?? getStorage();

  // Behind Caddy / Cloudflare in production; needed for a correct req.ip.
  app.set('trust proxy', 1);

  const allowedOrigins = new Set(
    [config.APP_URL, config.SITE_URL, ...config.CORS_ORIGINS.split(',')]
      .map((origin) => origin.trim().replace(/\/$/, ''))
      .filter(Boolean),
  );

  app.use(requestLogger);
  app.use(helmet());
  app.use(
    cors({
      origin: (origin, callback) => callback(null, !origin || allowedOrigins.has(origin)),
      credentials: true,
    }),
  );
  app.use(
    express.json({
      limit: '100kb',
      verify: (req, _res, buf) => {
        req.rawBody = buf;
      },
    }),
  );

  app.use(healthRouter(pool));

  const auth =
    injectedAuth ??
    createAuth(createDb(pool), {
      secret: config.AUTH_SECRET,
      baseURL: config.APP_URL,
      googleClientId: config.GOOGLE_CLIENT_ID,
      googleClientSecret: config.GOOGLE_CLIENT_SECRET,
      mailer: emailSender,
    });

  const v1 = Router();
  v1.use('/auth', authRouter(auth, verifyTurnstile, config));
  v1.use('/me', meRouter(auth, repos));
  v1.use('/orgs', orgsRouter(auth, repos, scansOptions, emailSender, storage));
  v1.use('/invitations', invitationsRouter(repos, auth));
  v1.use('/sites', detectPlatformRouter(auth));
  const paddleWebhookOpts = { boss: scansOptions?.boss, emailSender };
  v1.use('/webhooks/paddle', paddleWebhookRouter(repos, paddleWebhookOpts));
  v1.use('/public', waitlistRouter(repos, verifyTurnstile));
  v1.use('/public', publicPlansRouter());
  v1.use(
    '/public',
    freeChecksPublicRouter(repos, verifyTurnstile, emailSender, storage, freeChecksOptions),
  );
  v1.use('/emails', createEmailPreviewRouter());
  v1.use('/reports', reportsPublicRouter(repos, storage));
  v1.use('/portal', portalRouter(repos, auth));
  app.use('/v1', v1);
  app.use('/webhooks/paddle', paddleWebhookRouter(repos, paddleWebhookOpts));
  app.use('/public', publicPlansRouter());
  app.use(
    '/public',
    freeChecksPublicRouter(repos, verifyTurnstile, emailSender, storage, freeChecksOptions),
  );

  app.use(notFoundHandler);
  if (config.SENTRY_DSN_API) Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
}
