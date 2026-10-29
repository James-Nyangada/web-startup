import { existsSync } from 'node:fs';
import { defineConfig } from 'drizzle-kit';

if (existsSync('.env')) process.loadEnvFile('.env');

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL ?? '',
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  },
  strict: true,
  verbose: true,
});
