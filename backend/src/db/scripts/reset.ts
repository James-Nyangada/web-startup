import { sql } from 'drizzle-orm';
import { env } from '../../config/env.js';
import { closeDb, getDb, type Database } from '../index.js';
import { runMigrations } from './migrate.js';
import { seed } from './seed.js';

/**
 * Drops only this app's objects (never the whole public schema: on Supabase
 * that would also remove Supabase's own grants), then migrates and seeds.
 */
export async function dropAppObjects(db: Database): Promise<void> {
  await db.execute(sql`
    DROP TABLE IF EXISTS
      ai_suggestions,
      ai_usage,
      free_checks,
      accounts,
      sessions,
      verifications,
      invitations,
      client_access,
      branding,
      notification_preferences,
      in_app_notifications,
      reports,
      issue_notes,
      issue_events,
      issue_occurrences,
      issues,
      page_results,
      pages,
      scans,
      sites,
      fix_guides,
      rules,
      waitlist,
      feature_flags,
      audit_log,
      memberships,
      organizations,
      users
    CASCADE;
    DROP FUNCTION IF EXISTS set_updated_at() CASCADE;
    DROP FUNCTION IF EXISTS forbid_append_only_write() CASCADE;
    DROP SCHEMA IF EXISTS drizzle CASCADE;
  `);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (env().NODE_ENV === 'production') {
    console.error('Refusing to reset: NODE_ENV is production.');
    process.exit(1);
  }
  if (!process.argv.includes('--yes')) {
    console.error(
      'This deletes ALL app data in the database at DATABASE_URL.\n' +
        'Run again with confirmation:  npm run db:reset -- --yes',
    );
    process.exit(1);
  }
  try {
    const { db } = getDb();
    await dropAppObjects(db);
    await runMigrations(db);
    await seed(db);
    console.log('Database reset, migrated and seeded.');
  } catch (error) {
    console.error('Reset failed:', error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
