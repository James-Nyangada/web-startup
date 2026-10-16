import * as Sentry from '@sentry/node';
import cors from 'cors';
import express, { Router } from 'express';
import helmet from 'helmet';
import type pg from 'pg';
import type { Env } from './config/env.js';
import type { Repositories } from './db/repositories/index.js';
import type { TurnstileVerifier } from './lib/turnstile.js';
import { errorHandler, notFoundHandler } from './middleware/error-handler.js';
import { requestLogger } from './middleware/request-logger.js';
import { healthRouter } from './routes/health.js';
import { waitlistRouter } from './routes/public/waitlist.js';

export interface AppDeps {
  config: Pick<Env, 'APP_URL' | 'SITE_URL' | 'CORS_ORIGINS' | 'SENTRY_DSN_API'>;
  pool: pg.Pool;
  repos: Repositories;
  verifyTurnstile: TurnstileVerifier;
}

export function createApp({ config, pool, repos, verifyTurnstile }: AppDeps): express.Express {
  const app = express();

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
  app.use(express.json({ limit: '100kb' }));

  app.use(healthRouter(pool));

  const v1 = Router();
  v1.use('/public', waitlistRouter(repos, verifyTurnstile));
  app.use('/v1', v1);

  app.use(notFoundHandler);
  if (config.SENTRY_DSN_API) Sentry.setupExpressErrorHandler(app);
  app.use(errorHandler);

  return app;
}
