import { and, eq, isNotNull, isNull } from 'drizzle-orm';
import type { Database } from '../client.js';
import { branding, organizations } from '../schema/identity.js';
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

    /** Any org holding the domain, verified or not; used to refuse duplicates. */
    async findByCustomDomain(domain: string): Promise<BrandingRecord | null> {
      const [row] = await db
        .select()
        .from(branding)
        .where(eq(branding.customDomain, domain))
        .limit(1);
      return row ?? null;
    },

    /**
     * The org behind a verified custom domain (P6-07): TLS `ask` checks and host-based routing.
     * Unverified domains and deleted orgs never resolve.
     */
    async findVerifiedDomain(domain: string) {
      const [row] = await db
        .select({
          branding,
          org: { id: organizations.id, slug: organizations.slug, name: organizations.name },
        })
        .from(branding)
        .innerJoin(organizations, eq(organizations.id, branding.orgId))
        .where(
          and(
            eq(branding.customDomain, domain),
            isNotNull(branding.customDomainVerifiedAt),
            isNull(organizations.deletedAt),
          ),
        )
        .limit(1);
      return row ?? null;
    },
  };
}
