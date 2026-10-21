import { and, eq, isNotNull, lt, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  branding,
  issueOccurrences,
  manualChecks,
  organizations,
  pageResults,
  reports,
  scans,
} from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export interface PruneStats {
  occurrencesCount: number;
  pagesCount: number;
  rawKeys: string[];
}

export function retentionRepository(db: Database) {
  return {
    async getPrunableStats(orgId: OrgId, cutoff: Date): Promise<PruneStats> {
      const scanRows = await db
        .select({ rawKey: scans.rawKey })
        .from(scans)
        .where(and(eq(scans.orgId, orgId), lt(scans.queuedAt, cutoff), isNotNull(scans.rawKey)));

      const rawKeys = scanRows.map((r) => r.rawKey).filter((k): k is string => Boolean(k));

      const [occRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(issueOccurrences)
        .where(and(eq(issueOccurrences.orgId, orgId), lt(issueOccurrences.createdAt, cutoff)));

      const [pageRow] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(pageResults)
        .where(and(eq(pageResults.orgId, orgId), lt(pageResults.createdAt, cutoff)));

      return {
        occurrencesCount: occRow?.count ?? 0,
        pagesCount: pageRow?.count ?? 0,
        rawKeys,
      };
    },

    async pruneTransientData(
      orgId: OrgId,
      cutoff: Date,
    ): Promise<{ occurrencesDeleted: number; pagesDeleted: number }> {
      await db
        .update(scans)
        .set({ rawKey: null })
        .where(and(eq(scans.orgId, orgId), lt(scans.queuedAt, cutoff), isNotNull(scans.rawKey)));

      const deletedOccs = await db
        .delete(issueOccurrences)
        .where(and(eq(issueOccurrences.orgId, orgId), lt(issueOccurrences.createdAt, cutoff)))
        .returning({ id: issueOccurrences.id });

      const deletedPages = await db
        .delete(pageResults)
        .where(and(eq(pageResults.orgId, orgId), lt(pageResults.createdAt, cutoff)))
        .returning({ id: pageResults.id });

      return {
        occurrencesDeleted: deletedOccs.length,
        pagesDeleted: deletedPages.length,
      };
    },

    async findPurgeableOrgs(cutoff: Date): Promise<Array<{ id: OrgId; name: string }>> {
      const rows = await db
        .select({ id: organizations.id, name: organizations.name })
        .from(organizations)
        .where(and(isNotNull(organizations.deletedAt), lt(organizations.deletedAt, cutoff)));

      return rows.map((r) => ({ id: r.id as OrgId, name: r.name }));
    },

    /** Every storage object an org owns (scan results, reports, logos, attachments). */
    async listOrgFileKeys(orgId: OrgId): Promise<string[]> {
      const [scanRows, reportRows, brandRows, checkRows] = await Promise.all([
        db.select({ key: scans.rawKey }).from(scans).where(eq(scans.orgId, orgId)),
        db.select({ key: reports.fileKey }).from(reports).where(eq(reports.orgId, orgId)),
        db
          .select({ light: branding.logoLightKey, dark: branding.logoDarkKey })
          .from(branding)
          .where(eq(branding.orgId, orgId)),
        db
          .select({ key: manualChecks.attachmentKey })
          .from(manualChecks)
          .where(eq(manualChecks.orgId, orgId)),
      ]);
      const keys = [
        ...scanRows.map((r) => r.key),
        ...reportRows.map((r) => r.key),
        ...brandRows.flatMap((r) => [r.light, r.dark]),
        ...checkRows.map((r) => r.key),
      ];
      return [...new Set(keys.filter((k): k is string => Boolean(k)))];
    },

    /**
     * Hard-deletes an org and everything that cascades from it (spec 5.8). The cascade
     * reaches the append-only tables (evidence_events, audit_log), so the trigger guard is
     * lifted for this transaction only.
     */
    async purgeOrganization(orgId: OrgId): Promise<boolean> {
      return db.transaction(async (tx) => {
        await tx.execute(sql`select set_config('app.allow_append_only_write', 'on', true)`);
        const [row] = await tx
          .delete(organizations)
          .where(eq(organizations.id, orgId))
          .returning({ id: organizations.id });
        return Boolean(row);
      });
    },
  };
}

export type RetentionRepository = ReturnType<typeof retentionRepository>;
