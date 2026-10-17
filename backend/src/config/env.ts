import { z } from 'zod';

const booleanString = z
  .enum(['true', 'false', '1', '0'])
  .transform((value) => value === 'true' || value === '1');

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(4000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  APP_URL: z.url().default('http://localhost:3000'),
  SITE_URL: z.url().default('http://localhost:3000'),
  /** Extra comma-separated origins allowed by CORS, on top of APP_URL and SITE_URL. */
  CORS_ORIGINS: z.string().default(''),
  DATABASE_URL: z.url({ error: 'DATABASE_URL must be a postgres:// connection string' }),
  /** TLS to Postgres. Supabase requires it; a local Postgres usually does not. */
  DATABASE_SSL: booleanString.default(true),
  /** Optional path to the Supabase CA certificate. When set, the server certificate is verified. */
  DATABASE_CA_CERT_PATH: z.string().optional(),
  DATABASE_POOL_MAX: z.coerce.number().int().positive().default(10),
  SENTRY_DSN_API: z.string().optional(),
  SENTRY_RELEASE: z.string().optional(),
  TURNSTILE_SECRET_KEY: z.string().optional(),
  AUTH_SECRET: z
    .string()
    .min(32)
    .default('dev_secret_must_be_at_least_32_characters_long_for_auth'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
});

export type Env = z.infer<typeof envSchema>;

export function parseEnv(source: NodeJS.ProcessEnv): Env {
  // Treat empty strings in .env as "not set" so defaults apply.
  const cleaned = Object.fromEntries(Object.entries(source).filter(([, value]) => value !== ''));
  const result = envSchema.safeParse(cleaned);
  if (!result.success) {
    const problems = result.error.issues
      .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');
    throw new Error(`Invalid environment configuration:\n${problems}\nSee backend/.env.example.`);
  }
  if (result.data.NODE_ENV === 'production' && !result.data.TURNSTILE_SECRET_KEY) {
    throw new Error('TURNSTILE_SECRET_KEY is required when NODE_ENV=production.');
  }
  return result.data;
}

let cached: Env | undefined;

export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
