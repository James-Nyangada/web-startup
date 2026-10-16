import { describe, expect, it } from 'vitest';
import { parseEnv } from '../../src/config/env.js';

const DATABASE_URL = 'postgresql://user:pass@db.example.com:5432/postgres';

describe('parseEnv', () => {
  it('applies defaults, including port 4000', () => {
    const env = parseEnv({ DATABASE_URL });
    expect(env.PORT).toBe(4000);
    expect(env.NODE_ENV).toBe('development');
    expect(env.DATABASE_SSL).toBe(true);
    expect(env.APP_URL).toBe('http://localhost:3000');
  });

  it('treats empty strings as unset', () => {
    const env = parseEnv({ DATABASE_URL, PORT: '', SENTRY_DSN_API: '' });
    expect(env.PORT).toBe(4000);
    expect(env.SENTRY_DSN_API).toBeUndefined();
  });

  it('reports a missing DATABASE_URL clearly', () => {
    expect(() => parseEnv({})).toThrow(/DATABASE_URL/);
  });

  it('parses DATABASE_SSL=false', () => {
    expect(parseEnv({ DATABASE_URL, DATABASE_SSL: 'false' }).DATABASE_SSL).toBe(false);
  });

  it('requires a Turnstile secret in production', () => {
    expect(() => parseEnv({ DATABASE_URL, NODE_ENV: 'production' })).toThrow(/TURNSTILE/);
    expect(() =>
      parseEnv({ DATABASE_URL, NODE_ENV: 'production', TURNSTILE_SECRET_KEY: 'x' }),
    ).not.toThrow();
  });
});
