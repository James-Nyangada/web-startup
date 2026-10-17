import { and, eq, isNull, ne } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  memberships,
  organizations,
  users,
  type BillingStatus,
  type Plan,
} from '../schema/index.js';
import type { OrgId } from './org-scope.js';

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CreateOrgData {
  name: string;
  slug: string;
  timeZone?: string;
  plan?: Plan;
  billingStatus?: BillingStatus;
  trialEndsAt?: Date | null;
}

export function organizationsRepository(db: Database) {
  return {
    async create(data: CreateOrgData) {
      const [row] = await db
        .insert(organizations)
        .values({
          name: data.name,
          slug: data.slug,
          timeZone: data.timeZone ?? 'UTC',
          plan: data.plan ?? 'trial',
          billingStatus: data.billingStatus ?? 'trialing',
          trialEndsAt: data.trialEndsAt,
        })
        .returning();

      return row;
    },

    async findById(id: string) {
      const [row] = await db
        .select()
        .from(organizations)
        .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)))
        .limit(1);

      return row ?? null;
    },

    async findBySlug(slug: string) {
      const [row] = await db
        .select()
        .from(organizations)
        .where(and(eq(organizations.slug, slug), isNull(organizations.deletedAt)))
        .limit(1);

      return row ?? null;
    },

    async findByIdOrSlug(idOrSlug: string) {
      if (UUID_REGEX.test(idOrSlug)) {
        const byId = await this.findById(idOrSlug);
        if (byId) return byId;
      }
      return this.findBySlug(idOrSlug);
    },

    async update(
      orgId: OrgId,
      data: Partial<
        Pick<
          typeof organizations.$inferInsert,
          'name' | 'slug' | 'timeZone' | 'plan' | 'billingStatus'
        >
      >,
    ) {
      const [row] = await db
        .update(organizations)
        .set(data)
        .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
        .returning();

      return row ?? null;
    },

    async softDelete(orgId: OrgId) {
      const [row] = await db
        .update(organizations)
        .set({ deletedAt: new Date() })
        .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
        .returning();

      return row ?? null;
    },

    async isSlugAvailable(slug: string, excludeOrgId?: string): Promise<boolean> {
      const conditions = [eq(organizations.slug, slug), isNull(organizations.deletedAt)];
      if (excludeOrgId) {
        conditions.push(ne(organizations.id, excludeOrgId));
      }

      const [found] = await db
        .select({ id: organizations.id })
        .from(organizations)
        .where(and(...conditions))
        .limit(1);

      return !found;
    },

    /**
     * Atomically creates an organisation, adds the creator as owner,
     * and sets the user's lastActiveOrgId.
     */
    async createWithInitialOwner(
      data: CreateOrgData,
      userId: string,
    ): Promise<{
      org: typeof organizations.$inferSelect;
      membership: typeof memberships.$inferSelect;
    }> {
      return db.transaction(async (tx) => {
        const [org] = await tx
          .insert(organizations)
          .values({
            name: data.name,
            slug: data.slug,
            timeZone: data.timeZone ?? 'UTC',
            plan: data.plan ?? 'trial',
            billingStatus: data.billingStatus ?? 'trialing',
            trialEndsAt: data.trialEndsAt,
          })
          .returning();

        if (!org) {
          throw new Error('Failed to insert organisation.');
        }

        const [membership] = await tx
          .insert(memberships)
          .values({
            orgId: org.id,
            userId,
            role: 'owner',
          })
          .returning();

        if (!membership) {
          throw new Error('Failed to insert initial membership.');
        }

        await tx
          .update(users)
          .set({ lastActiveOrgId: org.id })
          .where(eq(users.id, userId));

        return { org, membership };
      });
    },
  };
}
