import * as Sentry from '@sentry/node';
import { env } from './config/env.js';

// Imported before anything else in server.ts so Sentry can instrument Express.
const { SENTRY_DSN_API, SENTRY_RELEASE, NODE_ENV } = env();

if (SENTRY_DSN_API) {
  Sentry.init({
    dsn: SENTRY_DSN_API,
    environment: NODE_ENV,
    release: SENTRY_RELEASE,
    tracesSampleRate: 0,
  });
}
