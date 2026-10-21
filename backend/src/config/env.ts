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
  ENCRYPTION_KEY: z.string().min(16).default('dev_encryption_key_32_characters_long_for_aes_256'),
  AUTH_SECRET: z
    .string()
    .min(32)
    .default('dev_secret_must_be_at_least_32_characters_long_for_auth'),
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  AI_SUGGESTIONS_MONTHLY_CAP: z.coerce.number().int().positive().default(50),
  FEATURE_AI_SUGGESTIONS: booleanString.default(true),
  /** Cloudflare R2. When all four are set, files go to R2; otherwise to STORAGE_DIR on disk. */
  R2_ACCOUNT_ID: z.string().optional(),
  R2_ACCESS_KEY_ID: z.string().optional(),
  R2_SECRET_ACCESS_KEY: z.string().optional(),
  R2_BUCKET: z.string().optional(),
  STORAGE_DIR: z.string().optional(),
  /** Paddle Billing (Phase 4). */
  PADDLE_ENV: z.enum(['sandbox', 'production']).default('sandbox'),
  PADDLE_API_KEY: z.string().optional(),
  PADDLE_WEBHOOK_SECRET: z.string().optional(),
  NEXT_PUBLIC_PADDLE_CLIENT_TOKEN: z.string().optional(),
  PADDLE_PRICE_STORE_MONTHLY: z.string().optional(),
  PADDLE_PRICE_STORE_ANNUAL: z.string().optional(),
  PADDLE_PRICE_GROWTH_MONTHLY: z.string().optional(),
  PADDLE_PRICE_GROWTH_ANNUAL: z.string().optional(),
  PADDLE_PRICE_AGENCY_MONTHLY: z.string().optional(),
  PADDLE_PRICE_AGENCY_ANNUAL: z.string().optional(),
  PADDLE_PRICE_AGENCY_PRO_MONTHLY: z.string().optional(),
  PADDLE_PRICE_AGENCY_PRO_ANNUAL: z.string().optional(),
  /** P6-12: API answers 503 and the worker stops taking jobs. */
  MAINTENANCE_MODE: booleanString.default(false),
  /** P6-07: host agencies point custom portal domains at (CNAME). Defaults to portal.<app host>. */
  CUSTOM_DOMAIN_TARGET: z.string().optional(),
  /** P6-10: cookie domain shared by app and api, e.g. `.example.com`. Unset in development. */
  COOKIE_DOMAIN: z.string().optional(),
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
