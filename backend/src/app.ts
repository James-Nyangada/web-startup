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
import { requireAuth } from './middleware/auth.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { maintenanceMode } from './middleware/maintenance.js';
import { originCheck } from './middleware/csrf.js';
import { authRouter } from './routes/auth.js';
import { healthRouter } from './routes/health.js';
import { meRouter } from './routes/me.js';
import { mfaRouter } from './routes/mfa.js';
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
import { manualChecksPublicRouter } from './routes/manual-checks.js';
import { statementsPublicRouter } from './routes/statements.js';
import { globalNotificationsRouter } from './routes/notifications.js';
import { paddleWebhookRouter } from './routes/billing.js';
import type { PaddleClient } from './billing/paddle-api.js';
import { getStorage, type StorageService } from './storage/index.js';
import { portalRouter } from './routes/portal.js';
import { staffRouter } from './routes/staff.js';
import {
  customDomainTrustedOrigins,
  internalRouter,
  portalDomainsRouter,
} from './routes/internal.js';
import { publicApiRouter } from './routes/public-api.js';
import { buildOpenApiDocument } from './openapi/document.js';
import { pgBossQueueAdmin, type QueueAdmin } from './staff/queue-admin.js';

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
  > &
    Partial<Pick<Env, 'MAINTENANCE_MODE' | 'COOKIE_DOMAIN'>>;
  pool: pg.Pool;
  repos: Repositories;
  verifyTurnstile: TurnstileVerifier;
  auth?: Auth;
  scansOptions?: ScansRouterOptions;
  emailSender?: EmailSender;
  storage?: StorageService;
  freeChecksOptions?: FreeChecksRouterOptions;
  paddleClient?: PaddleClient;
  /** Staff queue monitor (S-72); defaults to the pg-boss instance in scansOptions. */
  queueAdmin?: QueueAdmin;
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
  paddleClient,
  queueAdmin,
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
  // Spec 11.1 security headers. The API returns JSON, plus a few self-contained HTML pages
  // (published statements, email previews) that only need inline styles and images.
  app.use(
    helmet({
      contentSecurityPolicy: {
        useDefaults: false,
        directives: {
          defaultSrc: ["'none'"],
          styleSrc: ["'unsafe-inline'"],
          imgSrc: ["'self'", 'data:', 'https:'],
          fontSrc: ["'self'", 'https:', 'data:'],
          baseUri: ["'none'"],
          formAction: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
      strictTransportSecurity: { maxAge: 63_072_000, includeSubDomains: true, preload: true },
      referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
      // Logos are fetched by app.<domain> from api.<domain>: same site, different origin.
      crossOriginResourcePolicy: { policy: 'same-site' },
    }),
  );
  app.use((_req, res, next) => {
    res.setHeader(
      'Permissions-Policy',
      'camera=(), microphone=(), geolocation=(), payment=(), usb=()',
    );
    next();
  });
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

  app.use(maintenanceMode(Boolean(config.MAINTENANCE_MODE)));
  app.use(healthRouter(pool));

  const trustedOrigins = customDomainTrustedOrigins(repos, [...allowedOrigins]);
  const auth =
    injectedAuth ??
    createAuth(createDb(pool), {
      secret: config.AUTH_SECRET,
      baseURL: config.APP_URL,
      googleClientId: config.GOOGLE_CLIENT_ID,
      googleClientSecret: config.GOOGLE_CLIENT_SECRET,
      mailer: emailSender,
      trustedOrigins,
      cookieDomain: config.COOKIE_DOMAIN,
    });
  app.use(
    originCheck(async (origin) => {
      if (allowedOrigins.has(origin)) return true;
      const trusted = await trustedOrigins(new Request(config.APP_URL, { headers: { origin } }));
      return trusted.includes(origin);
    }),
  );

  const v1 = Router();
  // Public REST API (P6-06): only requests with a `psk_` bearer key; others fall through.
  v1.use(publicApiRouter(repos, scansOptions));
  const openApiByHost = new Map<string, ReturnType<typeof buildOpenApiDocument>>();
  v1.get('/openapi.json', (req, res) => {
    const origin = `${req.protocol}://${req.get('host') ?? 'localhost'}`;
    let doc = openApiByHost.get(origin);
    if (!doc) {
      doc = buildOpenApiDocument(origin);
      openApiByHost.set(origin, doc);
    }
    res.setHeader('Cache-Control', 'public, max-age=300');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.json(doc);
  });
  v1.use('/auth', authRouter(auth, verifyTurnstile, config));
  v1.use('/me', meRouter(auth, repos, { boss: scansOptions?.boss, storage, emailSender }));
  v1.use('/mfa', mfaRouter(auth, repos, { appUrl: config.APP_URL }));
  v1.use('/orgs', orgsRouter(auth, repos, scansOptions, emailSender, storage, paddleClient));
  v1.use('/invitations', invitationsRouter(repos, auth));
  v1.use('/sites', detectPlatformRouter(auth));
  const paddleWebhookOpts = { boss: scansOptions?.boss, emailSender };
  v1.use('/webhooks/paddle', paddleWebhookRouter(repos, paddleWebhookOpts));
  v1.use('/public', waitlistRouter(repos, verifyTurnstile));
  v1.use('/public', publicPlansRouter());
  v1.use('/public/portal-domains', portalDomainsRouter(repos));
  v1.use(
    '/public',
    freeChecksPublicRouter(repos, verifyTurnstile, emailSender, storage, freeChecksOptions),
  );
  // Template previews are a development aid; they render sample data only.
  if (process.env.NODE_ENV !== 'production') v1.use('/emails', createEmailPreviewRouter());
  v1.use('/reports', reportsPublicRouter(repos, storage));
  v1.use('/manual-checks', manualChecksPublicRouter(repos, storage));
  v1.use('/public/statements', statementsPublicRouter(repos));
  v1.use('/notifications', requireAuth(auth), globalNotificationsRouter(repos));
  v1.use('/notification-preferences', requireAuth(auth), globalNotificationsRouter(repos));
  v1.use('/portal', portalRouter(repos, auth));
  v1.use(
    '/staff',
    staffRouter(auth, repos, {
      queueAdmin:
        queueAdmin ?? (scansOptions?.boss ? pgBossQueueAdmin(scansOptions.boss, pool) : undefined),
    }),
  );
  app.use('/v1', v1);
  app.use('/internal', internalRouter(repos));
  app.use('/webhooks/paddle', paddleWebhookRouter(repos, paddleWebhookOpts));
  app.use('/public', publicPlansRouter());
  app.use('/public/statements', statementsPublicRouter(repos));
  app.use(
    '/public',
    freeChecksPublicRouter(repos, verifyTurnstile, emailSender, storage, freeChecksOptions),
  );

  app.use(notFoundHandler);
  if (config.SENTRY_DSN_API) Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
}
