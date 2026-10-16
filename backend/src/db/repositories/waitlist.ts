import { sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { waitlist } from '../schema/index.js';

/** Not tenant data, so no org scope. */
export function waitlistRepository(db: Database) {
  return {
    /** Re-joining keeps the row and only ever upgrades consent from false to true. */
    async join(entry: { email: string; consent: boolean; source?: string | undefined }) {
      await db
        .insert(waitlist)
        .values(entry)
        .onConflictDoUpdate({
          target: waitlist.email,
          set: { consent: sql`${waitlist.consent} or excluded.consent` },
        });
    },
  };
}
