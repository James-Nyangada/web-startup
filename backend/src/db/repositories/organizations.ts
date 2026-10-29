import { and, eq, isNull, ne, notInArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  memberships,
  organizations,
  users,
  type BillingStatus,
  type OrgType,
  type Plan,
} from '../schema/index.js';
import type { OrgId } from './org-scope.js';

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface CreateOrgData {
  name: string;
  slug: string;
  type?: OrgType;
  timeZone?: string;
  plan?: Plan;
  billingStatus?: BillingStatus;
  trialEndsAt?: Date | null;
  firstUtm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  };
}

export type OrgRow = Omit<typeof organizations.$inferSelect, 'firstUtm'> & {
  firstUtm?: {
    source?: string;
    medium?: string;
    campaign?: string;
    term?: string;
    content?: string;
  } | null;
};

/**
 * A staff plan override (P6-02) replaces `plan` everywhere limits are read, until it
 * expires. `basePlan` keeps the billed plan for screens that need both.
 */
export function withEffectivePlan<T extends OrgRow>(
  row: T,
  now = new Date(),
): T & { basePlan?: Plan } {
  const active =
    row.planOverride !== null &&
    row.planOverride !== undefined &&
    (!row.planOverrideExpiresAt || row.planOverrideExpiresAt.getTime() > now.getTime());
  return { ...row, plan: active ? row.planOverride! : row.plan, basePlan: row.plan };
}

export function organizationsRepository(db: Database) {
  return {
    async create(data: CreateOrgData): Promise<OrgRow> {
      const [row] = await db
        .insert(organizations)
        .values({
          name: data.name,
          slug: data.slug,
          type: data.type ?? 'store',
          timeZone: data.timeZone ?? 'UTC',
          plan: data.plan ?? 'trial',
          billingStatus: data.billingStatus ?? 'trialing',
          trialEndsAt: data.trialEndsAt,
        })
        .returning();

      return row as OrgRow;
    },

    async findById(id: string): Promise<(OrgRow & { basePlan?: Plan }) | null> {
      const [row] = await db
        .select()
        .from(organizations)
        .where(and(eq(organizations.id, id), isNull(organizations.deletedAt)))
        .limit(1);

      return row ? withEffectivePlan(row as OrgRow) : null;
    },

    async findBySlug(slug: string): Promise<(OrgRow & { basePlan?: Plan }) | null> {
      const [row] = await db
        .select()
        .from(organizations)
        .where(and(eq(organizations.slug, slug), isNull(organizations.deletedAt)))
        .limit(1);

      return row ? withEffectivePlan(row as OrgRow) : null;
    },

    async findByIdOrSlug(idOrSlug: string): Promise<(OrgRow & { basePlan?: Plan }) | null> {
      if (UUID_REGEX.test(idOrSlug)) {
        const byId = await this.findById(idOrSlug);
        if (byId) return byId;
      }
      return this.findBySlug(idOrSlug);
    },

    async findByPaddleCustomerId(paddleCustomerId: string): Promise<OrgRow | null> {
      const [row] = await db
        .select()
        .from(organizations)
        .where(
          and(
            eq(organizations.paddleCustomerId, paddleCustomerId),
            isNull(organizations.deletedAt),
          ),
        )
        .limit(1);

      return (row as OrgRow) ?? null;
    },

    async update(
      orgId: OrgId,
      data: Partial<
        Pick<
          typeof organizations.$inferInsert,
          | 'name'
          | 'slug'
          | 'timeZone'
          | 'plan'
          | 'billingStatus'
          | 'paddleCustomerId'
          | 'pastDueSince'
        >
      >,
    ): Promise<OrgRow | null> {
      const [row] = await db
        .update(organizations)
        .set(data)
        .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
        .returning();

      return (row as OrgRow) ?? null;
    },

    async softDelete(orgId: OrgId): Promise<OrgRow | null> {
      const [row] = await db
        .update(organizations)
        .set({ deletedAt: new Date() })
        .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
        .returning();

      return (row as OrgRow) ?? null;
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
      org: OrgRow;
      membership: typeof memberships.$inferSelect;
    }> {
      return db.transaction(async (tx) => {
        const [org] = await tx
          .insert(organizations)
          .values({
            name: data.name,
            slug: data.slug,
            type: data.type ?? 'store',
            timeZone: data.timeZone ?? 'UTC',
            plan: data.plan ?? 'trial',
            billingStatus: data.billingStatus ?? 'trialing',
            trialEndsAt: data.trialEndsAt,
            firstUtm: data.firstUtm,
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

        await tx.update(users).set({ lastActiveOrgId: org.id }).where(eq(users.id, userId));

        return { org: org, membership };
      });
    },

    async findDueForTrialLifecycle(): Promise<OrgRow[]> {
      const rows = await db
        .select()
        .from(organizations)
        .where(
          and(
            isNull(organizations.deletedAt),
            sql`(${organizations.billingStatus} = 'trialing' OR ${organizations.billingStatus} = 'past_due' OR ${organizations.billingStatus} = 'read_only' OR ${organizations.billingStatus} = 'canceled')`,
          ),
        );
      return rows;
    },

    async listAllActive(): Promise<(OrgRow & { basePlan?: Plan })[]> {
      const rows = await db
        .select()
        .from(organizations)
        .where(
          and(
            isNull(organizations.deletedAt),
            notInArray(organizations.billingStatus, ['read_only', 'canceled']),
          ),
        );
      return rows.map((row) => withEffectivePlan(row as OrgRow));
    },
  };
}
