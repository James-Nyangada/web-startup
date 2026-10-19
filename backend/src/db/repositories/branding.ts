import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { branding } from '../schema/identity.js';
import type { OrgId } from './org-scope.js';

export type BrandingRecord = typeof branding.$inferSelect;
export type BrandingInsert = typeof branding.$inferInsert;

export function brandingRepository(db: Database) {
  return {
    async findByOrgId(orgId: OrgId): Promise<BrandingRecord | null> {
      const [row] = await db.select().from(branding).where(eq(branding.orgId, orgId)).limit(1);
      return row ?? null;
    },

    async upsert(
      orgId: OrgId,
      data: Partial<Omit<BrandingInsert, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>>,
    ): Promise<BrandingRecord> {
      const existing = await this.findByOrgId(orgId);
      if (existing) {
        const [updated] = await db
          .update(branding)
          .set({ ...data, updatedAt: new Date() })
          .where(eq(branding.orgId, orgId))
          .returning();
        if (!updated) throw new Error('Failed to update branding record');
        return updated;
      }

      const [created] = await db
        .insert(branding)
        .values({
          orgId,
          ...data,
        })
        .returning();
      if (!created) throw new Error('Failed to insert branding record');
      return created;
    },
  };
}
