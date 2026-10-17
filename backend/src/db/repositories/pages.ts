import { and, desc, eq, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Database } from '../client.js';
import {
  pages,
  pageResults,
  type PageResultStatus,
} from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export function hashUrl(url: string): string {
  return createHash('sha256').update(url).digest('hex');
}

export interface PageUpsertInput {
  url: string;
  templateKey: string;
  title?: string | null;
  lastStatusCode?: number | null;
  isPinned?: boolean;
  firstSeenScanId?: string | null;
  lastScannedScanId?: string | null;
}

export interface PageResultInsertInput {
  pageId: string;
  status: PageResultStatus;
  httpStatus?: number | null;
  loadMs?: number | null;
  violations: number;
  passes: number;
  incomplete: number;
  score?: number | null;
  screenshotKey?: string | null;
}

export function pagesRepository(db: Database) {
  return {
    /**
     * Upserts a list of pages for a site.
     * Automatically hashes URLs and deduplicates input by (siteId, urlHash)
     * to avoid Postgres ON CONFLICT multi-target errors.
     * Returns a Map of url -> pageId.
     */
    async upsertPages(
      orgId: OrgId,
      siteId: string,
      pageList: readonly PageUpsertInput[],
    ): Promise<Map<string, string>> {
      if (pageList.length === 0) return new Map();

      // Deduplicate by urlHash to satisfy PostgreSQL's constraint that an ON CONFLICT
      // DO UPDATE command cannot affect the same row twice in a single statement.
      const uniqueByHash = new Map<string, PageUpsertInput & { urlHash: string }>();
      for (const p of pageList) {
        const urlHash = hashUrl(p.url);
        uniqueByHash.set(urlHash, { ...p, urlHash });
      }

      const rowsToInsert = Array.from(uniqueByHash.values()).map((p) => ({
        orgId,
        siteId,
        url: p.url,
        urlHash: p.urlHash,
        templateKey: p.templateKey,
        title: p.title ?? null,
        lastStatusCode: p.lastStatusCode ?? null,
        isPinned: p.isPinned ?? false,
        firstSeenScanId: p.firstSeenScanId ?? null,
        lastScannedScanId: p.lastScannedScanId ?? null,
      }));

      // Insert in chunks of 100 to stay well under query parameter limits
      const chunkSize = 100;
      const resultMap = new Map<string, string>();

      for (let i = 0; i < rowsToInsert.length; i += chunkSize) {
        const chunk = rowsToInsert.slice(i, i + chunkSize);
        const returned = await db
          .insert(pages)
          .values(chunk)
          .onConflictDoUpdate({
            target: [pages.siteId, pages.urlHash],
            set: {
              templateKey: sql`excluded.template_key`,
              title: sql`coalesce(excluded.title, pages.title)`,
              lastScannedScanId: sql`coalesce(excluded.last_scanned_scan_id, pages.last_scanned_scan_id)`,
              lastStatusCode: sql`coalesce(excluded.last_status_code, pages.last_status_code)`,
              updatedAt: new Date(),
            },
          })
          .returning({ id: pages.id, url: pages.url });

        for (const row of returned) {
          resultMap.set(row.url, row.id);
        }
      }

      return resultMap;
    },

    async listBySite(orgId: OrgId, siteId: string, limit = 50, offset = 0) {
      return db
        .select()
        .from(pages)
        .where(and(eq(pages.orgId, orgId), eq(pages.siteId, siteId)))
        .orderBy(pages.url)
        .limit(limit)
        .offset(offset);
    },

    async countBySite(orgId: OrgId, siteId: string) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(pages)
        .where(and(eq(pages.orgId, orgId), eq(pages.siteId, siteId)));
      return row?.count ?? 0;
    },

    async findById(orgId: OrgId, pageId: string) {
      const [row] = await db
        .select()
        .from(pages)
        .where(and(eq(pages.orgId, orgId), eq(pages.id, pageId)));
      return row ?? null;
    },

    /**
     * Inserts or updates page scan results.
     */
    async insertPageResults(
      orgId: OrgId,
      scanId: string,
      results: readonly PageResultInsertInput[],
    ): Promise<void> {
      if (results.length === 0) return;

      const rows = results.map((r) => ({
        orgId,
        scanId,
        pageId: r.pageId,
        status: r.status,
        httpStatus: r.httpStatus ?? null,
        loadMs: r.loadMs ?? null,
        violations: r.violations,
        passes: r.passes,
        incomplete: r.incomplete,
        score: r.score ?? null,
        screenshotKey: r.screenshotKey ?? null,
      }));

      const chunkSize = 100;
      for (let i = 0; i < rows.length; i += chunkSize) {
        const chunk = rows.slice(i, i + chunkSize);
        await db
          .insert(pageResults)
          .values(chunk)
          .onConflictDoUpdate({
            target: [pageResults.scanId, pageResults.pageId],
            set: {
              status: sql`excluded.status`,
              httpStatus: sql`excluded.http_status`,
              loadMs: sql`excluded.load_ms`,
              violations: sql`excluded.violations`,
              passes: sql`excluded.passes`,
              incomplete: sql`excluded.incomplete`,
              score: sql`excluded.score`,
              screenshotKey: sql`coalesce(excluded.screenshot_key, page_results.screenshot_key)`,
              updatedAt: new Date(),
            },
          });
      }
    },

    async listResultsByScan(orgId: OrgId, scanId: string) {
      return db
        .select()
        .from(pageResults)
        .where(and(eq(pageResults.orgId, orgId), eq(pageResults.scanId, scanId)))
        .orderBy(desc(pageResults.violations));
    },
  };
}

export type PagesRepository = ReturnType<typeof pagesRepository>;
