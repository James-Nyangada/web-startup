import { and, eq, isNull, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { clientAccess, sites, users } from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export interface ClientViewerWithSites {
  user: {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
  };
  sites: {
    id: string;
    name: string;
    rootUrl: string;
    status: string;
    platform: string;
  }[];
  createdAt: Date;
}

export function clientAccessRepository(db: Database) {
  return {
    /**
     * Lists all client_access entries for a user in a specific organisation.
     */
    async listByUserAndOrg(userId: string, orgId: OrgId) {
      return db
        .select({
          id: clientAccess.id,
          orgId: clientAccess.orgId,
          siteId: clientAccess.siteId,
          createdAt: clientAccess.createdAt,
        })
        .from(clientAccess)
        .where(and(eq(clientAccess.userId, userId), eq(clientAccess.orgId, orgId)));
    },

    /**
     * Lists all client viewers in an organisation, grouped by user with their assigned sites.
     */
    async listByOrg(orgId: OrgId): Promise<ClientViewerWithSites[]> {
      const rows = await db
        .select({
          accessId: clientAccess.id,
          createdAt: clientAccess.createdAt,
          user: {
            id: users.id,
            email: users.email,
            name: users.name,
            avatarUrl: users.avatarUrl,
          },
          site: {
            id: sites.id,
            name: sites.name,
            rootUrl: sites.rootUrl,
            status: sites.status,
            platform: sites.platform,
          },
        })
        .from(clientAccess)
        .innerJoin(users, eq(users.id, clientAccess.userId))
        .innerJoin(sites, eq(sites.id, clientAccess.siteId))
        .where(and(eq(clientAccess.orgId, orgId), isNull(sites.deletedAt)));

      const byUser = new Map<string, ClientViewerWithSites>();
      for (const row of rows) {
        let entry = byUser.get(row.user.id);
        if (!entry) {
          entry = {
            user: row.user,
            sites: [],
            createdAt: row.createdAt,
          };
          byUser.set(row.user.id, entry);
        }
        entry.sites.push(row.site);
      }

      return Array.from(byUser.values());
    },

    /**
     * Grants access to one or more sites for a user in an organisation.
     */
    async grantAccess(orgId: OrgId, userId: string, siteIds: string[]): Promise<void> {
      if (siteIds.length === 0) return;
      const values = siteIds.map((siteId) => ({
        orgId,
        userId,
        siteId,
      }));
      await db.insert(clientAccess).values(values).onConflictDoNothing();
    },

    /**
     * Replaces existing site access for a client viewer in an organisation.
     */
    async setSiteAccess(orgId: OrgId, userId: string, siteIds: string[]): Promise<void> {
      await db
        .delete(clientAccess)
        .where(and(eq(clientAccess.orgId, orgId), eq(clientAccess.userId, userId)));

      if (siteIds.length > 0) {
        await this.grantAccess(orgId, userId, siteIds);
      }
    },

    /**
     * Completely removes a client viewer's access in an organisation.
     */
    async removeClientViewer(orgId: OrgId, userId: string): Promise<void> {
      await db
        .delete(clientAccess)
        .where(and(eq(clientAccess.orgId, orgId), eq(clientAccess.userId, userId)));
    },

    /**
     * Counts distinct client viewers in an organisation.
     */
    async count(orgId: OrgId): Promise<number> {
      const [row] = await db
        .select({
          count: sql<number>`count(distinct ${clientAccess.userId})::int`,
        })
        .from(clientAccess)
        .where(eq(clientAccess.orgId, orgId));
      return row?.count ?? 0;
    },
  };
}
