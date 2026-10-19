import { and, asc, desc, eq, ilike, inArray, isNull, or, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import type { PreviousIssue, ScanDiff } from '../../scanner/results/diff.js';
import type { FoundIssue } from '../../scanner/results/issues.js';
import {
  issueEvents,
  issueNotes,
  issueOccurrences,
  issues,
  pages,
  rules,
  scans,
  sites,
  users,
  type Impact,
  type IssueStatus,
  type IgnoredReason,
} from '../schema/index.js';
import { AUDIENCE_LABELS, RULE_CONTENT } from '../../scanner/rules/content.js';
import { ruleInfo } from '../../scanner/rules/catalog.js';
import type { OrgId } from './org-scope.js';

export type BulkAction =
  | { type: 'ignore'; reason: IgnoredReason; note?: string | null }
  | { type: 'unignore' }
  | { type: 'assign'; assigneeId: string | null }
  | { type: 'set_due_date'; dueDate: string | null };

export interface IssueListFilters {
  status?: IssueStatus | IssueStatus[];
  impact?: Impact | Impact[];
  wcag?: string;
  templateKey?: string;
  ruleId?: string;
  assigneeId?: string | null;
  isRegression?: boolean;
  needsReview?: boolean;
  search?: string;
}

export type IssueSortField = 'impact' | 'occurrences' | 'firstSeen' | 'lastSeen' | 'createdAt';
export type IssueSortOrder = 'asc' | 'desc';

export interface CrossSiteCommonIssue {
  ruleId: string;
  title: string;
  impact: Impact;
  affectedSitesCount: number;
  totalOccurrences: number;
  sites: Array<{
    siteId: string;
    siteName: string;
    clientName: string | null;
    occurrences: number;
  }>;
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

        // issues.rule_id references rules; axe can report rules the catalog doesn't list yet.
        const ruleIds = [...new Set(allFoundIssues.map((issue) => issue.ruleId))];
        if (ruleIds.length > 0) {
          await tx
            .insert(rules)
            .values(
              ruleIds.map((ruleId) => {
                const info = ruleInfo(ruleId);
                return {
                  ruleId,
                  title: info.title,
                  description: info.description,
                  whoIsAffected: info.whoIsAffected.join(', '),
                  wcagCriteria: info.wcagCriteria,
                  wcagLevel: info.wcagLevel,
                  defaultImpact: info.defaultImpact,
                  weight: info.weight,
                  helpUrl: info.helpUrl,
                  axeVersion: info.axeVersion,
                };
              }),
            )
            .onConflictDoNothing({ target: rules.ruleId });
        }

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
      optionsOrLimit:
        | {
            limit?: number;
            offset?: number;
            sort?: IssueSortField;
            order?: IssueSortOrder;
            maxLimit?: number;
          }
        | number = 50,
      legacyOffset = 0,
    ) {
      let limit = 50;
      let offset = 0;
      let sortField: IssueSortField = 'impact';
      let sortOrder: IssueSortOrder = 'desc';

      if (typeof optionsOrLimit === 'number') {
        limit = optionsOrLimit;
        offset = legacyOffset;
      } else if (optionsOrLimit && typeof optionsOrLimit === 'object') {
        limit = optionsOrLimit.limit ?? 50;
        offset = optionsOrLimit.offset ?? 0;
        sortField = optionsOrLimit.sort ?? 'impact';
        sortOrder = optionsOrLimit.order ?? 'desc';
      }

      const maxLimit =
        typeof optionsOrLimit === 'object' && optionsOrLimit.maxLimit
          ? optionsOrLimit.maxLimit
          : 200;
      limit = Math.min(maxLimit, Math.max(1, limit));
      offset = Math.max(0, offset);

      const conditions = [eq(issues.orgId, orgId), eq(issues.siteId, siteId)];

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          if (filters.status.length > 0) {
            conditions.push(inArray(issues.status, filters.status));
          }
        } else {
          conditions.push(eq(issues.status, filters.status));
        }
      }

      if (filters.impact) {
        if (Array.isArray(filters.impact)) {
          if (filters.impact.length > 0) {
            conditions.push(inArray(issues.impact, filters.impact));
          }
        } else {
          conditions.push(eq(issues.impact, filters.impact));
        }
      }

      if (filters.templateKey) {
        conditions.push(eq(issues.templateKey, filters.templateKey));
      }

      if (filters.ruleId) {
        conditions.push(eq(issues.ruleId, filters.ruleId));
      }

      if (filters.isRegression !== undefined) {
        conditions.push(eq(issues.isRegression, filters.isRegression));
      }

      if (filters.needsReview !== undefined) {
        conditions.push(eq(issues.needsReview, filters.needsReview));
      }

      if (filters.assigneeId !== undefined) {
        if (filters.assigneeId === null || filters.assigneeId === 'unassigned') {
          conditions.push(isNull(issues.assigneeId));
        } else {
          conditions.push(eq(issues.assigneeId, filters.assigneeId));
        }
      }

      if (filters.wcag) {
        conditions.push(sql`${filters.wcag} = any(${issues.wcagCriteria})`);
      }

      if (filters.search && filters.search.trim()) {
        const query = `%${filters.search.trim()}%`;
        const searchCondition = or(
          ilike(rules.title, query),
          ilike(issues.ruleId, query),
          ilike(issues.templateKey, query),
          ilike(issues.selector, query),
        );
        if (searchCondition) {
          conditions.push(searchCondition);
        }
      }

      const orderExpr = [];
      const isAsc = sortOrder === 'asc';

      if (sortField === 'impact') {
        const impactSql = sql`
          CASE ${issues.impact}
            WHEN 'critical' THEN 4
            WHEN 'serious' THEN 3
            WHEN 'moderate' THEN 2
            WHEN 'minor' THEN 1
            ELSE 0
          END
        `;
        orderExpr.push(isAsc ? asc(impactSql) : desc(impactSql));
        orderExpr.push(desc(issues.occurrenceCount));
      } else if (sortField === 'occurrences') {
        orderExpr.push(isAsc ? asc(issues.occurrenceCount) : desc(issues.occurrenceCount));
      } else if (sortField === 'firstSeen' || sortField === 'createdAt') {
        orderExpr.push(isAsc ? asc(issues.createdAt) : desc(issues.createdAt));
      } else if (sortField === 'lastSeen') {
        orderExpr.push(isAsc ? asc(issues.updatedAt) : desc(issues.updatedAt));
      } else {
        orderExpr.push(desc(issues.occurrenceCount));
      }
      orderExpr.push(issues.id);

      const rows = await db
        .select({
          id: issues.id,
          orgId: issues.orgId,
          siteId: issues.siteId,
          fingerprint: issues.fingerprint,
          ruleId: issues.ruleId,
          title: rules.title,
          description: rules.description,
          impact: issues.impact,
          wcagCriteria: issues.wcagCriteria,
          wcagLevel: issues.wcagLevel,
          templateKey: issues.templateKey,
          selector: issues.selector,
          htmlSnippet: issues.htmlSnippet,
          failureSummary: issues.failureSummary,
          status: issues.status,
          ignoredReason: issues.ignoredReason,
          ignoredNote: issues.ignoredNote,
          isRegression: issues.isRegression,
          regressionCount: issues.regressionCount,
          occurrenceCount: issues.occurrenceCount,
          assigneeId: issues.assigneeId,
          assigneeName: users.name,
          dueDate: issues.dueDate,
          needsReview: issues.needsReview,
          firstSeenScanId: issues.firstSeenScanId,
          lastSeenScanId: issues.lastSeenScanId,
          fixedScanId: issues.fixedScanId,
          fixedAt: issues.fixedAt,
          createdAt: issues.createdAt,
          updatedAt: issues.updatedAt,
        })
        .from(issues)
        .leftJoin(rules, eq(issues.ruleId, rules.ruleId))
        .leftJoin(users, eq(issues.assigneeId, users.id))
        .where(and(...conditions))
        .orderBy(...orderExpr)
        .limit(limit)
        .offset(offset);

      return rows.map((r) => ({
        ...r,
        title: r.title ?? r.ruleId,
      }));
    },

    async countBySite(orgId: OrgId, siteId: string, filters: IssueListFilters = {}) {
      const conditions = [eq(issues.orgId, orgId), eq(issues.siteId, siteId)];

      if (filters.status) {
        if (Array.isArray(filters.status)) {
          if (filters.status.length > 0) {
            conditions.push(inArray(issues.status, filters.status));
          }
        } else {
          conditions.push(eq(issues.status, filters.status));
        }
      }

      if (filters.impact) {
        if (Array.isArray(filters.impact)) {
          if (filters.impact.length > 0) {
            conditions.push(inArray(issues.impact, filters.impact));
          }
        } else {
          conditions.push(eq(issues.impact, filters.impact));
        }
      }

      if (filters.templateKey) {
        conditions.push(eq(issues.templateKey, filters.templateKey));
      }

      if (filters.ruleId) {
        conditions.push(eq(issues.ruleId, filters.ruleId));
      }

      if (filters.isRegression !== undefined) {
        conditions.push(eq(issues.isRegression, filters.isRegression));
      }

      if (filters.needsReview !== undefined) {
        conditions.push(eq(issues.needsReview, filters.needsReview));
      }

      if (filters.assigneeId !== undefined) {
        if (filters.assigneeId === null || filters.assigneeId === 'unassigned') {
          conditions.push(isNull(issues.assigneeId));
        } else {
          conditions.push(eq(issues.assigneeId, filters.assigneeId));
        }
      }

      if (filters.wcag) {
        conditions.push(sql`${filters.wcag} = any(${issues.wcagCriteria})`);
      }

      let query = db.select({ count: sql<number>`count(*)::int` }).from(issues);

      if (filters.search && filters.search.trim()) {
        const q = `%${filters.search.trim()}%`;
        const searchCondition = or(
          ilike(rules.title, q),
          ilike(issues.ruleId, q),
          ilike(issues.templateKey, q),
          ilike(issues.selector, q),
        );
        if (searchCondition) {
          conditions.push(searchCondition);
        }
        query = query.leftJoin(rules, eq(issues.ruleId, rules.ruleId)) as never;
      }

      const [row] = await query.where(and(...conditions));
      return row?.count ?? 0;
    },

    async listTemplatesBySite(orgId: OrgId, siteId: string) {
      const rows = await db
        .select({
          templateKey: issues.templateKey,
          count: sql<number>`count(*)::int`,
        })
        .from(issues)
        .where(and(eq(issues.orgId, orgId), eq(issues.siteId, siteId)))
        .groupBy(issues.templateKey)
        .orderBy(desc(sql`count(*)`));
      return rows;
    },

    async listCrossSite(
      orgId: OrgId,
      filters: IssueListFilters & { siteId?: string } = {},
      options: {
        limit?: number;
        offset?: number;
        sort?: IssueSortField;
        order?: IssueSortOrder;
      } = {},
    ) {
      const limit = Math.min(200, Math.max(1, options.limit ?? 50));
      const offset = Math.max(0, options.offset ?? 0);
      const conditions = [eq(issues.orgId, orgId)];
      if (filters.siteId) conditions.push(eq(issues.siteId, filters.siteId));
      if (filters.assigneeId) conditions.push(eq(issues.assigneeId, filters.assigneeId));
      if (filters.status) {
        if (Array.isArray(filters.status)) {
          if (filters.status.length > 0) conditions.push(inArray(issues.status, filters.status));
        } else {
          conditions.push(eq(issues.status, filters.status));
        }
      }

      return db
        .select({
          id: issues.id,
          siteId: issues.siteId,
          ruleId: issues.ruleId,
          title: rules.title,
          impact: issues.impact,
          templateKey: issues.templateKey,
          status: issues.status,
          occurrenceCount: issues.occurrenceCount,
          assigneeId: issues.assigneeId,
          dueDate: issues.dueDate,
          createdAt: issues.createdAt,
          updatedAt: issues.updatedAt,
        })
        .from(issues)
        .leftJoin(rules, eq(issues.ruleId, rules.ruleId))
        .where(and(...conditions))
        .orderBy(desc(issues.updatedAt))
        .limit(limit)
        .offset(offset);
    },

    async listCrossSiteCommonIssues(orgId: OrgId): Promise<CrossSiteCommonIssue[]> {
      const rows = await db
        .select({
          ruleId: issues.ruleId,
          title: rules.title,
          impact: issues.impact,
          siteId: issues.siteId,
          siteName: sites.name,
          clientName: sites.clientName,
          occurrenceCount: sql<number>`sum(${issues.occurrenceCount})::int`,
        })
        .from(issues)
        .innerJoin(rules, eq(issues.ruleId, rules.ruleId))
        .innerJoin(sites, eq(issues.siteId, sites.id))
        .where(and(eq(issues.orgId, orgId), eq(issues.status, 'open'), isNull(sites.deletedAt)))
        .groupBy(
          issues.ruleId,
          rules.title,
          issues.impact,
          issues.siteId,
          sites.name,
          sites.clientName,
        );

      const ruleMap = new Map<string, CrossSiteCommonIssue>();

      for (const row of rows) {
        let entry = ruleMap.get(row.ruleId);
        if (!entry) {
          entry = {
            ruleId: row.ruleId,
            title: row.title ?? row.ruleId,
            impact: row.impact,
            affectedSitesCount: 0,
            totalOccurrences: 0,
            sites: [],
          };
          ruleMap.set(row.ruleId, entry);
        }
        entry.affectedSitesCount += 1;
        entry.totalOccurrences += row.occurrenceCount;
        entry.sites.push({
          siteId: row.siteId,
          siteName: row.siteName,
          clientName: row.clientName,
          occurrences: row.occurrenceCount,
        });
      }

      return Array.from(ruleMap.values()).sort(
        (a, b) =>
          b.affectedSitesCount - a.affectedSitesCount || b.totalOccurrences - a.totalOccurrences,
      );
    },

    async findById(orgId: OrgId, issueId: string) {
      const [row] = await db
        .select({
          id: issues.id,
          orgId: issues.orgId,
          siteId: issues.siteId,
          fingerprint: issues.fingerprint,
          ruleId: issues.ruleId,
          title: rules.title,
          description: rules.description,
          whoIsAffected: rules.whoIsAffected,
          helpUrl: rules.helpUrl,
          impact: issues.impact,
          wcagCriteria: issues.wcagCriteria,
          wcagLevel: issues.wcagLevel,
          templateKey: issues.templateKey,
          selector: issues.selector,
          htmlSnippet: issues.htmlSnippet,
          failureSummary: issues.failureSummary,
          status: issues.status,
          ignoredReason: issues.ignoredReason,
          ignoredNote: issues.ignoredNote,
          ignoredBy: issues.ignoredBy,
          ignoredAt: issues.ignoredAt,
          isRegression: issues.isRegression,
          regressionCount: issues.regressionCount,
          occurrenceCount: issues.occurrenceCount,
          assigneeId: issues.assigneeId,
          assigneeName: users.name,
          dueDate: issues.dueDate,
          needsReview: issues.needsReview,
          firstSeenScanId: issues.firstSeenScanId,
          lastSeenScanId: issues.lastSeenScanId,
          fixedScanId: issues.fixedScanId,
          fixedAt: issues.fixedAt,
          createdAt: issues.createdAt,
          updatedAt: issues.updatedAt,
        })
        .from(issues)
        .leftJoin(rules, eq(issues.ruleId, rules.ruleId))
        .leftJoin(users, eq(issues.assigneeId, users.id))
        .where(and(eq(issues.orgId, orgId), eq(issues.id, issueId)));

      if (!row) return null;

      const fallbackContent = RULE_CONTENT[row.ruleId];
      const title = row.title ?? fallbackContent?.title ?? row.ruleId;
      const description = row.description ?? fallbackContent?.description ?? null;
      const whoIsAffected =
        row.whoIsAffected ??
        (fallbackContent?.affects?.map((a) => AUDIENCE_LABELS[a]).join('. ') || null);

      return {
        ...row,
        title,
        description,
        whoIsAffected,
      };
    },

    /**
     * Finds an issue by ID without tenant scope (used by background workers).
     */
    async findRawById(issueId: string) {
      const [row] = await db.select().from(issues).where(eq(issues.id, issueId));
      return row ?? null;
    },

    /**
     * Top issues to fix first ordered by (impact × occurrences) descending (Spec S-24, P2-11).
     * Impact weight: critical=4, serious=3, moderate=2, minor=1.
     */
    async listTopIssues(orgId: OrgId, siteId: string, limit = 5) {
      const rows = await db
        .select({
          id: issues.id,
          ruleId: issues.ruleId,
          title: rules.title,
          impact: issues.impact,
          wcagCriteria: issues.wcagCriteria,
          wcagLevel: issues.wcagLevel,
          templateKey: issues.templateKey,
          selector: issues.selector,
          status: issues.status,
          isRegression: issues.isRegression,
          occurrenceCount: issues.occurrenceCount,
        })
        .from(issues)
        .leftJoin(rules, eq(issues.ruleId, rules.ruleId))
        .where(and(eq(issues.orgId, orgId), eq(issues.siteId, siteId), eq(issues.status, 'open')))
        .orderBy(
          sql`(
            CASE ${issues.impact}
              WHEN 'critical' THEN 4
              WHEN 'serious' THEN 3
              WHEN 'moderate' THEN 2
              WHEN 'minor' THEN 1
              ELSE 0
            END * ${issues.occurrenceCount}
          ) DESC`,
          desc(issues.occurrenceCount),
          issues.id,
        )
        .limit(limit);

      return rows.map((r) => ({
        id: r.id,
        ruleId: r.ruleId,
        title: r.title ?? r.ruleId,
        impact: r.impact,
        wcagCriteria: r.wcagCriteria,
        wcagLevel: r.wcagLevel,
        templateKey: r.templateKey,
        selector: r.selector,
        status: r.isRegression ? ('regressed' as const) : r.status,
        isRegression: r.isRegression,
        occurrenceCount: r.occurrenceCount,
      }));
    },

    /**
     * Open issue counts by severity (Critical, Serious, Moderate, Minor).
     */
    async getSeverityCounts(orgId: OrgId, siteId: string) {
      const rows = await db
        .select({
          impact: issues.impact,
          count: sql<number>`count(*)::int`,
        })
        .from(issues)
        .where(and(eq(issues.orgId, orgId), eq(issues.siteId, siteId), eq(issues.status, 'open')))
        .groupBy(issues.impact);

      const counts: Record<Impact, number> = {
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0,
      };

      for (const row of rows) {
        if (row.impact in counts) {
          counts[row.impact] = row.count;
        }
      }

      return counts;
    },

    /**
     * Counts of new, fixed, and regressed issues since the specified scan (or last scan).
     */
    async getDiffSummary(orgId: OrgId, siteId: string, lastScanId?: string | null) {
      if (!lastScanId) {
        return {
          newCount: 0,
          fixedCount: 0,
          regressedCount: 0,
          sinceDate: null,
        };
      }

      const [scan] = await db
        .select({
          finishedAt: scans.finishedAt,
          queuedAt: scans.queuedAt,
          counts: scans.counts,
        })
        .from(scans)
        .where(and(eq(scans.orgId, orgId), eq(scans.id, lastScanId)));

      const scanCounts = scan?.counts;

      if (
        scanCounts &&
        typeof scanCounts.new === 'number' &&
        typeof scanCounts.fixed === 'number' &&
        typeof scanCounts.regressed === 'number'
      ) {
        return {
          newCount: scanCounts.new,
          fixedCount: scanCounts.fixed,
          regressedCount: scanCounts.regressed,
          sinceDate: scan?.finishedAt ?? scan?.queuedAt ?? null,
        };
      }

      const rows = await db
        .select({
          type: issueEvents.type,
          count: sql<number>`count(*)::int`,
        })
        .from(issueEvents)
        .where(and(eq(issueEvents.orgId, orgId), eq(issueEvents.scanId, lastScanId)))
        .groupBy(issueEvents.type);

      let newCount = 0;
      let fixedCount = 0;
      let regressedCount = 0;

      for (const r of rows) {
        if (r.type === 'created') newCount = r.count;
        if (r.type === 'fixed') fixedCount = r.count;
        if (r.type === 'regressed') regressedCount = r.count;
      }

      return {
        newCount,
        fixedCount,
        regressedCount,
        sinceDate: scan?.finishedAt ?? scan?.queuedAt ?? null,
      };
    },

    /**
     * Lists recently fixed issues for a site (Spec S-24).
     */
    async listRecentlyFixed(orgId: OrgId, siteId: string, limit = 5) {
      const rows = await db
        .select({
          id: issues.id,
          ruleId: issues.ruleId,
          title: rules.title,
          templateKey: issues.templateKey,
          fixedAt: issues.fixedAt,
        })
        .from(issues)
        .leftJoin(rules, eq(issues.ruleId, rules.ruleId))
        .where(and(eq(issues.orgId, orgId), eq(issues.siteId, siteId), eq(issues.status, 'fixed')))
        .orderBy(desc(issues.fixedAt))
        .limit(limit);

      return rows.map((r) => ({
        id: r.id,
        ruleId: r.ruleId,
        title: r.title ? `${r.title} — ${r.templateKey}` : r.ruleId,
        templateKey: r.templateKey,
        fixedAt: r.fixedAt ? r.fixedAt.toISOString() : null,
      }));
    },

    /**
     * Lists occurrences for an issue, joined with page data (Spec S-26, P2-13).
     */
    async listOccurrences(
      orgId: OrgId,
      issueId: string,
      options: { limit?: number; offset?: number } = {},
    ) {
      const limit = options.limit ?? 50;
      const offset = options.offset ?? 0;

      const rows = await db
        .select({
          id: issueOccurrences.id,
          issueId: issueOccurrences.issueId,
          pageId: issueOccurrences.pageId,
          url: pages.url,
          pageTitle: pages.title,
          templateKey: pages.templateKey,
          target: issueOccurrences.target,
          scanId: issueOccurrences.scanId,
          createdAt: issueOccurrences.createdAt,
        })
        .from(issueOccurrences)
        .innerJoin(pages, eq(pages.id, issueOccurrences.pageId))
        .where(and(eq(issueOccurrences.orgId, orgId), eq(issueOccurrences.issueId, issueId)))
        .orderBy(pages.url, issueOccurrences.id)
        .limit(limit)
        .offset(offset);

      return rows;
    },

    /**
     * Count occurrences for an issue.
     */
    async countOccurrences(orgId: OrgId, issueId: string): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(issueOccurrences)
        .where(and(eq(issueOccurrences.orgId, orgId), eq(issueOccurrences.issueId, issueId)));
      return row?.count ?? 0;
    },

    /**
     * Lists events for an issue timeline (Spec S-26, P2-13).
     */
    async listEvents(orgId: OrgId, issueId: string) {
      const rows = await db
        .select({
          id: issueEvents.id,
          issueId: issueEvents.issueId,
          type: issueEvents.type,
          actorId: issueEvents.actorId,
          actorName: users.name,
          scanId: issueEvents.scanId,
          data: issueEvents.data,
          createdAt: issueEvents.createdAt,
        })
        .from(issueEvents)
        .leftJoin(users, eq(issueEvents.actorId, users.id))
        .where(and(eq(issueEvents.orgId, orgId), eq(issueEvents.issueId, issueId)))
        .orderBy(desc(issueEvents.createdAt));

      return rows;
    },

    /**
     * Lists notes for an issue (Spec S-26, P2-13).
     */
    async listNotes(orgId: OrgId, issueId: string, options: { clientVisibleOnly?: boolean } = {}) {
      const conditions = [
        eq(issueNotes.orgId, orgId),
        eq(issueNotes.issueId, issueId),
        isNull(issueNotes.deletedAt),
      ];
      if (options.clientVisibleOnly) {
        conditions.push(eq(issueNotes.visibleToClient, true));
      }

      const rows = await db
        .select({
          id: issueNotes.id,
          issueId: issueNotes.issueId,
          authorId: issueNotes.authorId,
          authorName: users.name,
          body: issueNotes.body,
          visibleToClient: issueNotes.visibleToClient,
          createdAt: issueNotes.createdAt,
          updatedAt: issueNotes.updatedAt,
        })
        .from(issueNotes)
        .leftJoin(users, eq(issueNotes.authorId, users.id))
        .where(and(...conditions))
        .orderBy(asc(issueNotes.createdAt));

      return rows;
    },

    /**
     * Lists client-visible notes for a site (Spec S-61, P4-09).
     */
    async listClientNotesBySite(orgId: OrgId, siteId: string, limit = 10) {
      const rows = await db
        .select({
          id: issueNotes.id,
          issueId: issueNotes.issueId,
          authorId: issueNotes.authorId,
          authorName: users.name,
          body: issueNotes.body,
          visibleToClient: issueNotes.visibleToClient,
          createdAt: issueNotes.createdAt,
          updatedAt: issueNotes.updatedAt,
        })
        .from(issueNotes)
        .innerJoin(issues, eq(issues.id, issueNotes.issueId))
        .leftJoin(users, eq(issueNotes.authorId, users.id))
        .where(
          and(
            eq(issueNotes.orgId, orgId),
            eq(issues.siteId, siteId),
            eq(issueNotes.visibleToClient, true),
            isNull(issueNotes.deletedAt),
          ),
        )
        .orderBy(desc(issueNotes.createdAt))
        .limit(limit);

      return rows;
    },

    /**
     * Adds a note to an issue (Spec S-26, P2-13/P2-14).
     */
    async addNote(
      orgId: OrgId,
      issueId: string,
      authorId: string,
      body: string,
      visibleToClient = false,
    ) {
      const [note] = await db
        .insert(issueNotes)
        .values({
          orgId,
          issueId,
          authorId,
          body,
          visibleToClient,
        })
        .returning();

      if (!note) {
        throw new Error('Failed to create issue note');
      }

      // Write note_added event to issue_events
      await db.insert(issueEvents).values({
        orgId,
        issueId,
        type: 'note_added',
        actorId: authorId,
        data: { noteId: note.id, visibleToClient },
      });

      return note;
    },

    /**
     * Finds a single note by ID.
     */
    async findNoteById(orgId: OrgId, issueId: string, noteId: string) {
      const [note] = await db
        .select({
          id: issueNotes.id,
          issueId: issueNotes.issueId,
          authorId: issueNotes.authorId,
          authorName: users.name,
          body: issueNotes.body,
          visibleToClient: issueNotes.visibleToClient,
          createdAt: issueNotes.createdAt,
          updatedAt: issueNotes.updatedAt,
        })
        .from(issueNotes)
        .leftJoin(users, eq(issueNotes.authorId, users.id))
        .where(
          and(
            eq(issueNotes.orgId, orgId),
            eq(issueNotes.issueId, issueId),
            eq(issueNotes.id, noteId),
            isNull(issueNotes.deletedAt),
          ),
        );

      return note ?? null;
    },

    /**
     * Updates an existing note.
     */
    async updateNote(
      orgId: OrgId,
      issueId: string,
      noteId: string,
      body: string,
      visibleToClient?: boolean,
    ) {
      const updateData: Partial<typeof issueNotes.$inferInsert> = {
        body,
        updatedAt: new Date(),
      };
      if (visibleToClient !== undefined) {
        updateData.visibleToClient = visibleToClient;
      }

      const [updated] = await db
        .update(issueNotes)
        .set(updateData)
        .where(
          and(
            eq(issueNotes.orgId, orgId),
            eq(issueNotes.issueId, issueId),
            eq(issueNotes.id, noteId),
            isNull(issueNotes.deletedAt),
          ),
        )
        .returning();

      return updated ?? null;
    },

    /**
     * Soft deletes a note.
     */
    async deleteNote(orgId: OrgId, issueId: string, noteId: string) {
      const [deleted] = await db
        .update(issueNotes)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(issueNotes.orgId, orgId),
            eq(issueNotes.issueId, issueId),
            eq(issueNotes.id, noteId),
            isNull(issueNotes.deletedAt),
          ),
        )
        .returning();

      return deleted ?? null;
    },

    /**
     * Ignores an issue with reason and optional/required note (Spec S-26, P2-14).
     */
    async ignore(
      orgId: OrgId,
      issueId: string,
      actorId: string,
      reason: IgnoredReason,
      note?: string | null,
    ) {
      const trimmedNote = note?.trim() || null;
      const [updated] = await db
        .update(issues)
        .set({
          status: 'ignored',
          ignoredReason: reason,
          ignoredNote: trimmedNote,
          ignoredBy: actorId,
          ignoredAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(issues.orgId, orgId), eq(issues.id, issueId)))
        .returning();

      if (!updated) return null;

      await db.insert(issueEvents).values({
        orgId,
        issueId,
        type: 'ignored',
        actorId,
        data: { reason, note: trimmedNote },
      });

      return updated;
    },

    /**
     * Unignores / reopens an ignored issue.
     */
    async unignore(orgId: OrgId, issueId: string, actorId: string) {
      const [updated] = await db
        .update(issues)
        .set({
          status: 'open',
          ignoredReason: null,
          ignoredNote: null,
          ignoredBy: null,
          ignoredAt: null,
          updatedAt: new Date(),
        })
        .where(and(eq(issues.orgId, orgId), eq(issues.id, issueId)))
        .returning();

      if (!updated) return null;

      await db.insert(issueEvents).values({
        orgId,
        issueId,
        type: 'unignored',
        actorId,
        data: {},
      });

      return updated;
    },

    /**
     * Assigns or unassigns an issue.
     */
    async assign(orgId: OrgId, issueId: string, actorId: string, assigneeId: string | null) {
      const [updated] = await db
        .update(issues)
        .set({
          assigneeId,
          updatedAt: new Date(),
        })
        .where(and(eq(issues.orgId, orgId), eq(issues.id, issueId)))
        .returning();

      if (!updated) return null;

      await db.insert(issueEvents).values({
        orgId,
        issueId,
        type: 'assigned',
        actorId,
        data: { assigneeId },
      });

      return updated;
    },

    /**
     * Sets or clears an issue's due date.
     */
    async setDueDate(orgId: OrgId, issueId: string, actorId: string, dueDate: string | null) {
      const [updated] = await db
        .update(issues)
        .set({
          dueDate,
          updatedAt: new Date(),
        })
        .where(and(eq(issues.orgId, orgId), eq(issues.id, issueId)))
        .returning();

      if (!updated) return null;

      await db.insert(issueEvents).values({
        orgId,
        issueId,
        type: 'due_date_set',
        actorId,
        data: { dueDate },
      });

      return updated;
    },

    /**
     * Marks an issue fixed (used by recheck / scan).
     */
    async markFixed(
      orgId: OrgId,
      issueId: string,
      actorId?: string | null,
      scanId?: string | null,
    ) {
      const [updated] = await db
        .update(issues)
        .set({
          status: 'fixed',
          fixedAt: new Date(),
          fixedScanId: scanId ?? null,
          updatedAt: new Date(),
        })
        .where(and(eq(issues.orgId, orgId), eq(issues.id, issueId)))
        .returning();

      if (!updated) return null;

      await db.insert(issueEvents).values({
        orgId,
        issueId,
        type: 'fixed',
        actorId: actorId ?? null,
        scanId: scanId ?? null,
        data: {},
      });

      return updated;
    },

    /** Records the outcome of an issue.recheck job on the issue timeline. */
    async recordRecheck(
      orgId: OrgId,
      issueId: string,
      data: { outcome: 'fixed' | 'still_open' | 'unchecked'; pagesChecked: number },
    ) {
      await db.insert(issueEvents).values({ orgId, issueId, type: 'rechecked', data });
    },

    /**
     * Bulk actions across up to 200 issues (Spec P2-14).
     */
    async bulkAction(
      orgId: OrgId,
      issueIds: string[],
      actorId: string,
      action: BulkAction,
    ): Promise<{ updatedCount: number }> {
      if (issueIds.length === 0) return { updatedCount: 0 };
      if (issueIds.length > 200) {
        throw new Error('Bulk actions are limited to 200 issues at a time.');
      }

      return await db.transaction(async (tx) => {
        const matchingIssues = await tx
          .select({ id: issues.id, status: issues.status })
          .from(issues)
          .where(and(eq(issues.orgId, orgId), inArray(issues.id, issueIds)));

        if (matchingIssues.length === 0) return { updatedCount: 0 };

        const matchedIds = matchingIssues.map((i) => i.id);

        if (action.type === 'ignore') {
          const trimmedNote = action.note?.trim() || null;
          await tx
            .update(issues)
            .set({
              status: 'ignored',
              ignoredReason: action.reason,
              ignoredNote: trimmedNote,
              ignoredBy: actorId,
              ignoredAt: new Date(),
              updatedAt: new Date(),
            })
            .where(and(eq(issues.orgId, orgId), inArray(issues.id, matchedIds)));

          const eventRows = matchedIds.map((id) => ({
            orgId,
            issueId: id,
            type: 'ignored' as const,
            actorId,
            data: { reason: action.reason, note: trimmedNote },
          }));
          await tx.insert(issueEvents).values(eventRows);
        } else if (action.type === 'unignore') {
          await tx
            .update(issues)
            .set({
              status: 'open',
              ignoredReason: null,
              ignoredNote: null,
              ignoredBy: null,
              ignoredAt: null,
              updatedAt: new Date(),
            })
            .where(and(eq(issues.orgId, orgId), inArray(issues.id, matchedIds)));

          const eventRows = matchedIds.map((id) => ({
            orgId,
            issueId: id,
            type: 'unignored' as const,
            actorId,
            data: {},
          }));
          await tx.insert(issueEvents).values(eventRows);
        } else if (action.type === 'assign') {
          await tx
            .update(issues)
            .set({
              assigneeId: action.assigneeId,
              updatedAt: new Date(),
            })
            .where(and(eq(issues.orgId, orgId), inArray(issues.id, matchedIds)));

          const eventRows = matchedIds.map((id) => ({
            orgId,
            issueId: id,
            type: 'assigned' as const,
            actorId,
            data: { assigneeId: action.assigneeId },
          }));
          await tx.insert(issueEvents).values(eventRows);
        } else if (action.type === 'set_due_date') {
          await tx
            .update(issues)
            .set({
              dueDate: action.dueDate,
              updatedAt: new Date(),
            })
            .where(and(eq(issues.orgId, orgId), inArray(issues.id, matchedIds)));

          const eventRows = matchedIds.map((id) => ({
            orgId,
            issueId: id,
            type: 'due_date_set' as const,
            actorId,
            data: { dueDate: action.dueDate },
          }));
          await tx.insert(issueEvents).values(eventRows);
        }

        return { updatedCount: matchedIds.length };
      });
    },

    /**
     * Retrieves the diff of issues for a specific scan:
     * - regressed: issues regressed in this scan (Spec S-28: regressed first)
     * - new: issues created / first seen in this scan
     * - fixed: issues marked fixed in this scan
     */
    async getScanDiff(orgId: OrgId, scanId: string) {
      // 1. Fetch events for this scan
      const events = await db
        .select({
          issueId: issueEvents.issueId,
          type: issueEvents.type,
        })
        .from(issueEvents)
        .where(
          and(
            eq(issueEvents.orgId, orgId),
            eq(issueEvents.scanId, scanId),
            inArray(issueEvents.type, ['created', 'fixed', 'regressed']),
          ),
        );

      const createdIds = new Set<string>();
      const fixedIds = new Set<string>();
      const regressedIds = new Set<string>();

      for (const e of events) {
        if (e.type === 'created') createdIds.add(e.issueId);
        else if (e.type === 'fixed') fixedIds.add(e.issueId);
        else if (e.type === 'regressed') regressedIds.add(e.issueId);
      }

      // Fallback: If no events were recorded for this scanId (e.g. historical data or mock scans)
      if (events.length === 0) {
        const matchingIssues = await db
          .select({
            id: issues.id,
            firstSeenScanId: issues.firstSeenScanId,
            fixedScanId: issues.fixedScanId,
            lastSeenScanId: issues.lastSeenScanId,
            isRegression: issues.isRegression,
          })
          .from(issues)
          .where(
            and(
              eq(issues.orgId, orgId),
              or(
                eq(issues.firstSeenScanId, scanId),
                eq(issues.fixedScanId, scanId),
                and(eq(issues.lastSeenScanId, scanId), eq(issues.isRegression, true)),
              ),
            ),
          );

        for (const i of matchingIssues) {
          if (i.firstSeenScanId === scanId) createdIds.add(i.id);
          if (i.fixedScanId === scanId) fixedIds.add(i.id);
          if (i.lastSeenScanId === scanId && i.isRegression) regressedIds.add(i.id);
        }
      }

      const allIds = Array.from(new Set([...createdIds, ...fixedIds, ...regressedIds]));
      if (allIds.length === 0) {
        return {
          regressed: [],
          new: [],
          fixed: [],
        };
      }

      const rows = await db
        .select({
          id: issues.id,
          ruleId: issues.ruleId,
          title: rules.title,
          impact: issues.impact,
          wcagCriteria: issues.wcagCriteria,
          wcagLevel: issues.wcagLevel,
          templateKey: issues.templateKey,
          selector: issues.selector,
          occurrenceCount: issues.occurrenceCount,
          status: issues.status,
          isRegression: issues.isRegression,
          regressionCount: issues.regressionCount,
        })
        .from(issues)
        .leftJoin(rules, eq(issues.ruleId, rules.ruleId))
        .where(and(eq(issues.orgId, orgId), inArray(issues.id, allIds)));

      const issueMap = new Map(rows.map((r) => [r.id, r]));

      const regressed = Array.from(regressedIds)
        .map((id) => issueMap.get(id))
        .filter((i): i is NonNullable<typeof i> => Boolean(i));

      const newIssues = Array.from(createdIds)
        .map((id) => issueMap.get(id))
        .filter((i): i is NonNullable<typeof i> => Boolean(i));

      const fixed = Array.from(fixedIds)
        .map((id) => issueMap.get(id))
        .filter((i): i is NonNullable<typeof i> => Boolean(i));

      return {
        regressed,
        new: newIssues,
        fixed,
      };
    },
  };
}

export type IssuesRepository = ReturnType<typeof issuesRepository>;
