import { and, desc, eq, gte, lte, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  manualChecks,
  type ManualCheckResult,
  type ManualCheckRow,
  type ManualCheckType,
  type NewManualCheckRow,
} from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export interface ManualCheckFilter {
  checkType?: ManualCheckType;
  result?: ManualCheckResult;
  from?: string; // YYYY-MM-DD
  to?: string; // YYYY-MM-DD
  limit?: number;
  offset?: number;
}

export function manualChecksRepository(db: Database) {
  return {
    async create(
      orgId: OrgId,
      entry: Omit<NewManualCheckRow, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>,
    ): Promise<ManualCheckRow> {
      const [row] = await db
        .insert(manualChecks)
        .values({
          ...entry,
          orgId,
        })
        .returning();
      return row!;
    },

    async findById(orgId: OrgId, checkId: string): Promise<ManualCheckRow | null> {
      const [row] = await db
        .select()
        .from(manualChecks)
        .where(and(eq(manualChecks.orgId, orgId), eq(manualChecks.id, checkId)))
        .limit(1);
      return row ?? null;
    },

    async findRawById(checkId: string): Promise<ManualCheckRow | null> {
      const [row] = await db
        .select()
        .from(manualChecks)
        .where(eq(manualChecks.id, checkId))
        .limit(1);
      return row ?? null;
    },

    async listBySite(
      orgId: OrgId,
      siteId: string,
      filter: ManualCheckFilter = {},
    ): Promise<ManualCheckRow[]> {
      const conditions = [eq(manualChecks.orgId, orgId), eq(manualChecks.siteId, siteId)];

      if (filter.checkType) {
        conditions.push(eq(manualChecks.checkType, filter.checkType));
      }
      if (filter.result) {
        conditions.push(eq(manualChecks.result, filter.result));
      }
      if (filter.from) {
        conditions.push(gte(manualChecks.performedAt, filter.from));
      }
      if (filter.to) {
        conditions.push(lte(manualChecks.performedAt, filter.to));
      }

      const limit = Math.min(filter.limit ?? 50, 200);
      const offset = filter.offset ?? 0;

      return db
        .select()
        .from(manualChecks)
        .where(and(...conditions))
        .orderBy(desc(manualChecks.performedAt), desc(manualChecks.createdAt))
        .limit(limit)
        .offset(offset);
    },

    async countBySite(
      orgId: OrgId,
      siteId: string,
      filter: ManualCheckFilter = {},
    ): Promise<number> {
      const conditions = [eq(manualChecks.orgId, orgId), eq(manualChecks.siteId, siteId)];

      if (filter.checkType) {
        conditions.push(eq(manualChecks.checkType, filter.checkType));
      }
      if (filter.result) {
        conditions.push(eq(manualChecks.result, filter.result));
      }
      if (filter.from) {
        conditions.push(gte(manualChecks.performedAt, filter.from));
      }
      if (filter.to) {
        conditions.push(lte(manualChecks.performedAt, filter.to));
      }

      const [res] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(manualChecks)
        .where(and(...conditions));

      return res?.count ?? 0;
    },

    async update(
      orgId: OrgId,
      checkId: string,
      data: Partial<
        Omit<NewManualCheckRow, 'id' | 'orgId' | 'siteId' | 'createdBy' | 'createdAt' | 'updatedAt'>
      >,
    ): Promise<ManualCheckRow | null> {
      const [updated] = await db
        .update(manualChecks)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(and(eq(manualChecks.orgId, orgId), eq(manualChecks.id, checkId)))
        .returning();

      return updated ?? null;
    },

    async delete(orgId: OrgId, checkId: string): Promise<boolean> {
      const res = await db
        .delete(manualChecks)
        .where(and(eq(manualChecks.orgId, orgId), eq(manualChecks.id, checkId)))
        .returning({ id: manualChecks.id });

      return res.length > 0;
    },
  };
}
