import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import type { PreviousIssue, ScanDiff } from '../../scanner/results/diff.js';
import type { FoundIssue } from '../../scanner/results/issues.js';
import {
  issueEvents,
  issueOccurrences,
  issues,
  pages,
  type Impact,
  type IssueStatus,
} from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export interface IssueListFilters {
  status?: IssueStatus;
  impact?: Impact;
  templateKey?: string;
  ruleId?: string;
  isRegression?: boolean;
  needsReview?: boolean;
}

export function issuesRepository(db: Database) {
  return {
    /**
     * Lists existing issues for a site in the format required by the diffScans engine.
     * Includes lastSeenPageUrls for each issue from its last seen scan.
     */
    async listForDiff(orgId: OrgId, siteId: string): Promise<PreviousIssue[]> {
      const siteIssues = await db
        .select({
          id: issues.id,
          fingerprint: issues.fingerprint,
          status: issues.status,
          templateKey: issues.templateKey,
          lastSeenScanId: issues.lastSeenScanId,
        })
        .from(issues)
        .where(and(eq(issues.orgId, orgId), eq(issues.siteId, siteId)));

      if (siteIssues.length === 0) {
        return [];
      }

      const issueIds = siteIssues.map((i) => i.id);
      const lastScanIds = Array.from(
        new Set(siteIssues.map((i) => i.lastSeenScanId).filter(Boolean)),
      ) as string[];

      const urlsByIssueId = new Map<string, string[]>();

      if (lastScanIds.length > 0 && issueIds.length > 0) {
        // Query in chunks of 500 to stay within Postgres param bounds
        const chunkSize = 500;
        for (let i = 0; i < issueIds.length; i += chunkSize) {
          const chunkIssueIds = issueIds.slice(i, i + chunkSize);
          const occRows = await db
            .select({
              issueId: issueOccurrences.issueId,
              url: pages.url,
            })
            .from(issueOccurrences)
            .innerJoin(pages, eq(pages.id, issueOccurrences.pageId))
            .where(
              and(
                eq(issueOccurrences.orgId, orgId),
                inArray(issueOccurrences.issueId, chunkIssueIds),
                inArray(issueOccurrences.scanId, lastScanIds),
              ),
            );

          for (const row of occRows) {
            const list = urlsByIssueId.get(row.issueId) ?? [];
            list.push(row.url);
            urlsByIssueId.set(row.issueId, list);
          }
        }
      }

      return siteIssues.map((issue) => ({
        fingerprint: issue.fingerprint,
        status: issue.status,
        templateKey: issue.templateKey,
        lastSeenPageUrls: urlsByIssueId.get(issue.id) ?? [],
      }));
    },

    /**
     * Applies the outcome of diffScans to the database:
     * 1. Inserts created issues & writes 'created' events.
     * 2. Updates stillOpen issues.
     * 3. Updates regressed issues, increments regression_count & writes 'regressed' events.
     * 4. Updates ignoredSeen issues.
     * 5. Updates fixed issues & writes 'fixed' events.
     * 6. Inserts occurrences for all seen issues.
     */
    async applyScanDiff(
      orgId: OrgId,
      siteId: string,
      scanId: string,
      diff: ScanDiff,
      allFoundIssues: readonly FoundIssue[],
      pageUrlToIdMap: Map<string, string>,
    ): Promise<{ createdCount: number; fixedCount: number; regressedCount: number }> {
      return await db.transaction(async (tx) => {
        let createdCount = 0;
        let fixedCount = 0;
        let regressedCount = 0;

        // 1. Process Created Issues
        if (diff.created.length > 0) {
          // Deduplicate by fingerprint to avoid conflict issues
          const uniqueCreated = new Map<string, FoundIssue>();
          for (const issue of diff.created) {
            uniqueCreated.set(issue.fingerprint, issue);
          }

          const rowsToInsert = Array.from(uniqueCreated.values()).map((issue) => ({
            orgId,
            siteId,
            fingerprint: issue.fingerprint,
            ruleId: issue.ruleId,
            impact: issue.impact,
            wcagCriteria: issue.wcagCriteria,
            wcagLevel: issue.wcagLevel,
            templateKey: issue.templateKey,
            selector: issue.selector,
            htmlSnippet: issue.htmlSnippet ?? null,
            failureSummary: issue.failureSummary ?? null,
            status: 'open' as const,
            isRegression: false,
            regressionCount: 0,
            firstSeenScanId: scanId,
            lastSeenScanId: scanId,
            occurrenceCount: issue.occurrences.length,
            needsReview: issue.needsReview,
          }));

          const chunkSize = 100;
          for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
            const chunk = rowsToInsert.slice(i, i + chunkSize);
            const inserted = await tx
              .insert(issues)
              .values(chunk)
              .onConflictDoUpdate({
                target: [issues.siteId, issues.fingerprint],
                set: {
                  status: 'open',
                  lastSeenScanId: scanId,
                  occurrenceCount: sql`excluded.occurrence_count`,
                  htmlSnippet: sql`excluded.html_snippet`,
                  failureSummary: sql`excluded.failure_summary`,
                  selector: sql`excluded.selector`,
                  updatedAt: new Date(),
                },
              })
              .returning({ id: issues.id, fingerprint: issues.fingerprint });

            createdCount += inserted.length;

            const fingerprintToIssue = new Map(chunk.map((c) => [c.fingerprint, c]));
            const eventsToInsert = inserted.map((row) => {
              const src = fingerprintToIssue.get(row.fingerprint);
              return {
                orgId,
                issueId: row.id,
                type: 'created' as const,
                scanId,
                data: {
                  ruleId: src?.ruleId,
                  impact: src?.impact,
                },
              };
            });

            if (eventsToInsert.length > 0) {
              await tx.insert(issueEvents).values(eventsToInsert);
            }
          }
        }

        // 2. Process Still Open Issues
        for (const issue of diff.stillOpen) {
          await tx
            .update(issues)
            .set({
              status: 'open',
              lastSeenScanId: scanId,
              occurrenceCount: issue.occurrences.length,
              htmlSnippet: issue.htmlSnippet ?? null,
              failureSummary: issue.failureSummary ?? null,
              selector: issue.selector,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(issues.orgId, orgId),
                eq(issues.siteId, siteId),
                eq(issues.fingerprint, issue.fingerprint),
              ),
            );
        }

        // 3. Process Regressed Issues
        for (const issue of diff.regressed) {
          const [updated] = await tx
            .update(issues)
            .set({
              status: 'open',
              isRegression: true,
              regressionCount: sql`${issues.regressionCount} + 1`,
              lastSeenScanId: scanId,
              occurrenceCount: issue.occurrences.length,
              htmlSnippet: issue.htmlSnippet ?? null,
              failureSummary: issue.failureSummary ?? null,
              selector: issue.selector,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(issues.orgId, orgId),
                eq(issues.siteId, siteId),
                eq(issues.fingerprint, issue.fingerprint),
              ),
            )
            .returning({ id: issues.id, regressionCount: issues.regressionCount });

          if (updated) {
            regressedCount++;
            await tx.insert(issueEvents).values({
              orgId,
              issueId: updated.id,
              type: 'regressed',
              scanId,
              data: {
                previousStatus: 'fixed',
                regressionCount: updated.regressionCount,
              },
            });
          }
        }

        // 4. Process Ignored Seen Issues
        for (const issue of diff.ignoredSeen) {
          await tx
            .update(issues)
            .set({
              lastSeenScanId: scanId,
              occurrenceCount: issue.occurrences.length,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(issues.orgId, orgId),
                eq(issues.siteId, siteId),
                eq(issues.fingerprint, issue.fingerprint),
              ),
            );
        }

        // 5. Process Fixed Issues
        for (const prev of diff.fixed) {
          const [updated] = await tx
            .update(issues)
            .set({
              status: 'fixed',
              fixedScanId: scanId,
              fixedAt: new Date(),
              occurrenceCount: 0,
              updatedAt: new Date(),
            })
            .where(
              and(
                eq(issues.orgId, orgId),
                eq(issues.siteId, siteId),
                eq(issues.fingerprint, prev.fingerprint),
              ),
            )
            .returning({ id: issues.id });

          if (updated) {
            fixedCount++;
            await tx.insert(issueEvents).values({
              orgId,
              issueId: updated.id,
              type: 'fixed',
              scanId,
              data: { fixedScanId: scanId },
            });
          }
        }

        // 6. Record Occurrences for all seen issues
        // First delete any existing occurrences for this scan (in case of retry)
        await tx
          .delete(issueOccurrences)
          .where(and(eq(issueOccurrences.orgId, orgId), eq(issueOccurrences.scanId, scanId)));

        if (allFoundIssues.length > 0) {
          // Fetch IDs of all seen issues
          const allFingerprints = Array.from(new Set(allFoundIssues.map((i) => i.fingerprint)));
          const fingerprintToId = new Map<string, string>();

          const chunkSize = 500;
          for (let i = 0; i < allFingerprints.length; i += chunkSize) {
            const chunkFp = allFingerprints.slice(i, i + chunkSize);
            const rows = await tx
              .select({ id: issues.id, fingerprint: issues.fingerprint })
              .from(issues)
              .where(
                and(
                  eq(issues.orgId, orgId),
                  eq(issues.siteId, siteId),
                  inArray(issues.fingerprint, chunkFp),
                ),
              );
            for (const r of rows) {
              fingerprintToId.set(r.fingerprint, r.id);
            }
          }

          const occurrenceRows: Array<{
            orgId: string;
            scanId: string;
            issueId: string;
            pageId: string;
            target: string;
          }> = [];

          for (const issue of allFoundIssues) {
            const issueId = fingerprintToId.get(issue.fingerprint);
            if (!issueId) continue;

            for (const occ of issue.occurrences) {
              const pageId = pageUrlToIdMap.get(occ.pageUrl);
              if (!pageId) continue;

              occurrenceRows.push({
                orgId,
                scanId,
                issueId,
                pageId,
                target: occ.target,
              });
            }
          }

          // Insert occurrences in chunks
          const occChunkSize = 200;
          for (let i = 0; i < occurrenceRows.length; i += occChunkSize) {
            const chunk = occurrenceRows.slice(i, i + occChunkSize);
            await tx.insert(issueOccurrences).values(chunk);
          }
        }

        return { createdCount, fixedCount, regressedCount };
      });
    },

    async listBySite(
      orgId: OrgId,
      siteId: string,
      filters: IssueListFilters = {},
      limit = 50,
      offset = 0,
    ) {
      const conditions = [eq(issues.orgId, orgId), eq(issues.siteId, siteId)];

      if (filters.status) conditions.push(eq(issues.status, filters.status));
      if (filters.impact) conditions.push(eq(issues.impact, filters.impact));
      if (filters.templateKey) conditions.push(eq(issues.templateKey, filters.templateKey));
      if (filters.ruleId) conditions.push(eq(issues.ruleId, filters.ruleId));
      if (filters.isRegression !== undefined) {
        conditions.push(eq(issues.isRegression, filters.isRegression));
      }
      if (filters.needsReview !== undefined) {
        conditions.push(eq(issues.needsReview, filters.needsReview));
      }

      return db
        .select()
        .from(issues)
        .where(and(...conditions))
        .orderBy(desc(issues.occurrenceCount), issues.fingerprint)
        .limit(limit)
        .offset(offset);
    },

    async countBySite(orgId: OrgId, siteId: string, filters: IssueListFilters = {}) {
      const conditions = [eq(issues.orgId, orgId), eq(issues.siteId, siteId)];
      if (filters.status) conditions.push(eq(issues.status, filters.status));
      if (filters.impact) conditions.push(eq(issues.impact, filters.impact));

      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(issues)
        .where(and(...conditions));
      return row?.count ?? 0;
    },

    async findById(orgId: OrgId, issueId: string) {
      const [row] = await db
        .select()
        .from(issues)
        .where(and(eq(issues.orgId, orgId), eq(issues.id, issueId)));
      return row ?? null;
    },
  };
}

export type IssuesRepository = ReturnType<typeof issuesRepository>;
