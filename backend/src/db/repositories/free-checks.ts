import { and, eq, gte, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { freeChecks, type FreeCheckResultPayload } from '../schema/index.js';

export function freeChecksRepository(db: Database) {
  return {
    async create(data: { url: string; domain: string; ipHash: string }) {
      const [row] = await db
        .insert(freeChecks)
        .values({
          url: data.url,
          domain: data.domain,
          ipHash: data.ipHash,
          status: 'pending',
        })
        .returning();
      if (!row) {
        throw new Error('Failed to create free check record');
      }
      return row;
    },

    async findById(id: string) {
      const [row] = await db.select().from(freeChecks).where(eq(freeChecks.id, id));
      return row ?? null;
    },

    async updateStatus(
      id: string,
      status: 'running' | 'completed' | 'failed',
      errorMessage?: string,
    ) {
      const [row] = await db
        .update(freeChecks)
        .set({
          status,
          ...(errorMessage !== undefined ? { errorMessage } : {}),
          updatedAt: new Date(),
        })
        .where(eq(freeChecks.id, id))
        .returning();
      return row ?? null;
    },

    async updateResult(
      id: string,
      result: FreeCheckResultPayload,
      status: 'completed' | 'failed' = 'completed',
      errorMessage?: string,
    ) {
      const [row] = await db
        .update(freeChecks)
        .set({
          result,
          status,
          ...(errorMessage !== undefined ? { errorMessage } : {}),
          updatedAt: new Date(),
        })
        .where(eq(freeChecks.id, id))
        .returning();
      return row ?? null;
    },

    async attachEmail(id: string, email: string, marketingConsent: boolean) {
      const [row] = await db
        .update(freeChecks)
        .set({
          email,
          marketingConsent,
          updatedAt: new Date(),
        })
        .where(eq(freeChecks.id, id))
        .returning();
      return row ?? null;
    },

    async setReportKey(id: string, reportKey: string) {
      const [row] = await db
        .update(freeChecks)
        .set({
          reportKey,
          updatedAt: new Date(),
        })
        .where(eq(freeChecks.id, id))
        .returning();
      return row ?? null;
    },

    async markConverted(id: string, orgId: string) {
      const [row] = await db
        .update(freeChecks)
        .set({
          convertedOrgId: orgId,
          updatedAt: new Date(),
        })
        .where(eq(freeChecks.id, id))
        .returning();
      return row ?? null;
    },

    async countRecentByIpHash(ipHash: string, windowSeconds: number): Promise<number> {
      const since = new Date(Date.now() - windowSeconds * 1000);
      const [res] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(freeChecks)
        .where(and(eq(freeChecks.ipHash, ipHash), gte(freeChecks.createdAt, since)));
      return res?.count ?? 0;
    },

    async countRecentByDomain(domain: string, windowSeconds: number): Promise<number> {
      const since = new Date(Date.now() - windowSeconds * 1000);
      const [res] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(freeChecks)
        .where(and(eq(freeChecks.domain, domain), gte(freeChecks.createdAt, since)));
      return res?.count ?? 0;
    },

    async countGlobalToday(): Promise<number> {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);
      const [res] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(freeChecks)
        .where(gte(freeChecks.createdAt, todayStart));
      return res?.count ?? 0;
    },
  };
}
