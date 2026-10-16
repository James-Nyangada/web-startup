import { and, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { memberships, users, type OrgRole } from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export function membershipsRepository(db: Database) {
  return {
    async list(orgId: OrgId) {
      return db
        .select({
          userId: users.id,
          email: users.email,
          name: users.name,
          role: memberships.role,
          joinedAt: memberships.createdAt,
        })
        .from(memberships)
        .innerJoin(users, eq(users.id, memberships.userId))
        .where(eq(memberships.orgId, orgId))
        .orderBy(memberships.createdAt);
    },

    async findRole(orgId: OrgId, userId: string): Promise<OrgRole | null> {
      const [row] = await db
        .select({ role: memberships.role })
        .from(memberships)
        .where(and(eq(memberships.orgId, orgId), eq(memberships.userId, userId)))
        .limit(1);
      return row?.role ?? null;
    },

    async add(orgId: OrgId, userId: string, role: OrgRole) {
      const [row] = await db.insert(memberships).values({ orgId, userId, role }).returning();
      return row;
    },
  };
}
