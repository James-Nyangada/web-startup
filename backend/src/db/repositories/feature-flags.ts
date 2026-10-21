import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { featureFlags } from '../schema/index.js';

export type FeatureFlagRow = typeof featureFlags.$inferSelect;

/** Platform-wide flags (S-75). Not tenant data: an org appears only in a flag's allow-list. */
export function featureFlagsRepository(db: Database) {
  return {
    async list(): Promise<FeatureFlagRow[]> {
      return db.select().from(featureFlags).orderBy(featureFlags.key);
    },

    async find(key: string): Promise<FeatureFlagRow | null> {
      const [row] = await db.select().from(featureFlags).where(eq(featureFlags.key, key)).limit(1);
      return row ?? null;
    },

    async upsert(key: string, data: { enabled: boolean; orgIds: string[] }) {
      const [row] = await db
        .insert(featureFlags)
        .values({ key, enabled: data.enabled, orgIds: data.orgIds })
        .onConflictDoUpdate({
          target: featureFlags.key,
          set: { enabled: data.enabled, orgIds: data.orgIds, updatedAt: new Date() },
        })
        .returning();
      return row!;
    },

    async delete(key: string): Promise<boolean> {
      const rows = await db
        .delete(featureFlags)
        .where(eq(featureFlags.key, key))
        .returning({ key: featureFlags.key });
      return rows.length > 0;
    },
  };
}
