import { readFileSync } from 'node:fs';
import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema/index.js';

export type Database = NodePgDatabase<typeof schema>;

export interface DbOptions {
  url: string;
  ssl: boolean;
  caCertPath?: string | undefined;
  max?: number;
}

/**
 * node-postgres lets `sslmode` in the URL override the `ssl` option, and recent
 * versions treat `sslmode=require` as full verification, which fails against
 * Supabase without its CA. Strip it and configure TLS explicitly instead.
 */
function stripSslMode(url: string): string {
  const parsed = new URL(url);
  parsed.searchParams.delete('sslmode');
  return parsed.toString();
}

export function createPool({ url, ssl, caCertPath, max = 10 }: DbOptions): pg.Pool {
  return new pg.Pool({
    connectionString: stripSslMode(url),
    max,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    ssl: ssl
      ? caCertPath
        ? { ca: readFileSync(caCertPath, 'utf8'), rejectUnauthorized: true }
        : { rejectUnauthorized: false }
      : false,
  });
}

export function createDb(pool: pg.Pool): Database {
  return drizzle(pool, { schema });
}
