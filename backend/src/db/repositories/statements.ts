import { and, desc, eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { statements, type NewStatementRow, type StatementRow } from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export function statementsRepository(db: Database) {
  return {
    async create(
      orgId: OrgId,
      entry: Omit<NewStatementRow, 'id' | 'orgId' | 'createdAt' | 'updatedAt'>,
    ): Promise<StatementRow> {
      const [row] = await db
        .insert(statements)
        .values({
          ...entry,
          orgId,
        })
        .returning();
      return row!;
    },

    async findById(orgId: OrgId, statementId: string): Promise<StatementRow | null> {
      const [row] = await db
        .select()
        .from(statements)
        .where(and(eq(statements.orgId, orgId), eq(statements.id, statementId)))
        .limit(1);
      return row ?? null;
    },

    async findLatestBySite(orgId: OrgId, siteId: string): Promise<StatementRow | null> {
      const [row] = await db
        .select()
        .from(statements)
        .where(and(eq(statements.orgId, orgId), eq(statements.siteId, siteId)))
        .orderBy(desc(statements.version))
        .limit(1);
      return row ?? null;
    },

    async findPublishedBySite(siteId: string): Promise<StatementRow | null> {
      const [row] = await db
        .select()
        .from(statements)
        .where(and(eq(statements.siteId, siteId), eq(statements.status, 'published')))
        .orderBy(desc(statements.version))
        .limit(1);
      return row ?? null;
    },

    async listBySite(orgId: OrgId, siteId: string): Promise<StatementRow[]> {
      return db
        .select()
        .from(statements)
        .where(and(eq(statements.orgId, orgId), eq(statements.siteId, siteId)))
        .orderBy(desc(statements.version));
    },

    async getNextVersion(siteId: string): Promise<number> {
      const [res] = await db
        .select({ maxVersion: sql<number>`coalesce(max(${statements.version}), 0)::int` })
        .from(statements)
        .where(eq(statements.siteId, siteId));
      return (res?.maxVersion ?? 0) + 1;
    },

    async update(
      orgId: OrgId,
      statementId: string,
      data: Partial<Omit<NewStatementRow, 'id' | 'orgId' | 'siteId' | 'createdAt' | 'updatedAt'>>,
    ): Promise<StatementRow | null> {
      const [updated] = await db
        .update(statements)
        .set({
          ...data,
          updatedAt: new Date(),
        })
        .where(and(eq(statements.orgId, orgId), eq(statements.id, statementId)))
        .returning();
      return updated ?? null;
    },
  };
}
