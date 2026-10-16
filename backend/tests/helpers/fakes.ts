import type pg from 'pg';
import { vi } from 'vitest';
import { createApp } from '../../src/app.js';
import type { Repositories } from '../../src/db/repositories/index.js';
import type { TurnstileVerifier } from '../../src/lib/turnstile.js';

export const testConfig = {
  APP_URL: 'http://localhost:3000',
  SITE_URL: 'http://localhost:3001',
  CORS_ORIGINS: '',
  SENTRY_DSN_API: undefined,
};

export function fakePool(healthy = true): pg.Pool {
  return {
    query: healthy
      ? vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })
      : vi.fn().mockRejectedValue(new Error('connection refused')),
  } as unknown as pg.Pool;
}

export function fakeRepos() {
  const join = vi.fn<Repositories['waitlist']['join']>().mockResolvedValue(undefined);
  const repos = { waitlist: { join } } as unknown as Repositories;
  return { repos, join };
}

export function buildTestApp(options: { healthy?: boolean; turnstile?: TurnstileVerifier } = {}) {
  const { repos, join } = fakeRepos();
  const app = createApp({
    config: testConfig,
    pool: fakePool(options.healthy ?? true),
    repos,
    verifyTurnstile: options.turnstile ?? (() => Promise.resolve(true)),
  });
  return { app, join };
}
