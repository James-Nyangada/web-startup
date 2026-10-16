import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { closeDb, getDb, type Database } from '../index.js';

export const migrationsFolder = fileURLToPath(new URL('../../../drizzle', import.meta.url));

export async function runMigrations(db: Database): Promise<void> {
  await migrate(db, { migrationsFolder });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    await runMigrations(getDb().db);
    console.log('Migrations applied.');
  } catch (error) {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
