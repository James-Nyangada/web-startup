import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { clientAccess, memberships, organizations, sites, users } from '../schema/index.js';

export function usersRepository(db: Database) {
  return {
    async findById(id: string) {
      const [row] = await db
        .select()
        .from(users)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async findByEmail(email: string) {
      const [row] = await db
        .select()
        .from(users)
        .where(and(eq(users.email, email.toLowerCase().trim()), isNull(users.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async update(
      id: string,
      patch: {
        name?: string | null;
        timeZone?: string;
        avatarUrl?: string | null;
        lastActiveOrgId?: string | null;
      },
    ) {
      const [updated] = await db
        .update(users)
        .set(patch)
        .where(and(eq(users.id, id), isNull(users.deletedAt)))
        .returning();
      return updated ?? null;
    },

    async listMemberships(userId: string) {
      const rows = await db
        .select({
          id: memberships.id,
          orgId: memberships.orgId,
          role: memberships.role,
          createdAt: memberships.createdAt,
          org: {
            id: organizations.id,
            name: organizations.name,
            slug: organizations.slug,
            type: organizations.type,
            plan: organizations.plan,
            planOverride: organizations.planOverride,
            planOverrideExpiresAt: organizations.planOverrideExpiresAt,
            billingStatus: organizations.billingStatus,
            timeZone: organizations.timeZone,
            trialEndsAt: organizations.trialEndsAt,
            updatedAt: organizations.updatedAt,
          },
        })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.orgId))
        .where(and(eq(memberships.userId, userId), isNull(organizations.deletedAt)))
        .orderBy(memberships.createdAt);
      // Report the plan the org actually gets, including a live staff override (P6-02).
      const now = Date.now();
      return rows.map(({ org: { planOverride, planOverrideExpiresAt, ...org }, ...m }) => ({
        ...m,
        org: {
          ...org,
          plan:
            planOverride && (!planOverrideExpiresAt || planOverrideExpiresAt.getTime() > now)
              ? planOverride
              : org.plan,
        },
      }));
    },

    async listClientAccess(userId: string) {
      return db
        .select({
          id: clientAccess.id,
          orgId: clientAccess.orgId,
          siteId: clientAccess.siteId,
          org: {
            id: organizations.id,
            name: organizations.name,
            slug: organizations.slug,
          },
          site: {
            id: sites.id,
            name: sites.name,
            rootUrl: sites.rootUrl,
            status: sites.status,
            platform: sites.platform,
            score: sites.score,
          },
        })
        .from(clientAccess)
        .innerJoin(sites, eq(sites.id, clientAccess.siteId))
        .innerJoin(organizations, eq(organizations.id, clientAccess.orgId))
        .where(
          and(
            eq(clientAccess.userId, userId),
            isNull(sites.deletedAt),
            isNull(organizations.deletedAt),
          ),
        )
        .orderBy(clientAccess.createdAt);
    },

    async isSoleOwnerOfActiveOrg(userId: string): Promise<boolean> {
      // Find orgs where user is owner
      const ownedOrgs = await db
        .select({
          orgId: memberships.orgId,
          billingStatus: organizations.billingStatus,
        })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.orgId))
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.role, 'owner'),
            isNull(organizations.deletedAt),
          ),
        );

      for (const org of ownedOrgs) {
        if (org.billingStatus === 'active') {
          // Check if there are other owners (by definition exactly 1 owner per org)
          return true;
        }
      }
      return false;
    },

    async softDelete(id: string) {
      const [deleted] = await db
        .update(users)
        .set({ deletedAt: sql`now()` })
        .where(eq(users.id, id))
        .returning();
      return deleted ?? null;
    },
  };
}
