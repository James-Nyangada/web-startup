import type pg from 'pg';
import { env } from '../config/env.js';
import { createDb, createPool, type Database } from './client.js';

let pool: pg.Pool | undefined;
let db: Database | undefined;

/** Process-wide pool built from env. Tests build their own with createPool/createDb. */
export function getDb(): { pool: pg.Pool; db: Database } {
  if (!pool || !db) {
    const config = env();
    pool = createPool({
      url: config.DATABASE_URL,
      ssl: config.DATABASE_SSL,
      caCertPath: config.DATABASE_CA_CERT_PATH,
      max: config.DATABASE_POOL_MAX,
    });
    db = createDb(pool);
  }
  return { pool, db };
}

export async function closeDb(): Promise<void> {
  await pool?.end();
  pool = undefined;
  db = undefined;
}

export type { Database } from './client.js';
