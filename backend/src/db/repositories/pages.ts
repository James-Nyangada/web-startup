import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { createHash } from 'node:crypto';
import type { Database } from '../client.js';
import { issues, pages, pageResults, sites, type PageResultStatus } from '../schema/index.js';
import { createExcludedPathMatcher } from '../../scanner/url/skip-patterns.js';
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
        .select({
          id: pageResults.id,
          pageId: pageResults.pageId,
          url: pages.url,
          templateKey: pages.templateKey,
          title: pages.title,
          status: pageResults.status,
          httpStatus: pageResults.httpStatus,
          loadMs: pageResults.loadMs,
          violations: pageResults.violations,
          passes: pageResults.passes,
          incomplete: pageResults.incomplete,
          score: pageResults.score,
          screenshotKey: pageResults.screenshotKey,
          createdAt: pageResults.createdAt,
        })
        .from(pageResults)
        .leftJoin(pages, eq(pageResults.pageId, pages.id))
        .where(and(eq(pageResults.orgId, orgId), eq(pageResults.scanId, scanId)))
        .orderBy(desc(pageResults.violations));
    },

    /**
     * Lists discovered pages grouped by template (Screen S-29).
     * Includes pages count, pages checked in last scan, open issues count,
     * and page details with pin status and last results.
     */
    async listGroupedByTemplate(orgId: OrgId, siteId: string) {
      const allPages = await db
        .select({
          id: pages.id,
          url: pages.url,
          templateKey: pages.templateKey,
          title: pages.title,
          isPinned: pages.isPinned,
          lastStatusCode: pages.lastStatusCode,
          lastScannedScanId: pages.lastScannedScanId,
          createdAt: pages.createdAt,
          updatedAt: pages.updatedAt,
        })
        .from(pages)
        .where(and(eq(pages.orgId, orgId), eq(pages.siteId, siteId)))
        .orderBy(pages.templateKey, pages.url);

      if (allPages.length === 0) {
        return [];
      }

      const issueCounts = await db
        .select({
          templateKey: issues.templateKey,
          openCount: sql<number>`count(*)::int`,
        })
        .from(issues)
        .where(and(eq(issues.orgId, orgId), eq(issues.siteId, siteId), eq(issues.status, 'open')))
        .groupBy(issues.templateKey);

      const templateIssueCountMap = new Map<string, number>(
        issueCounts.map((r) => [r.templateKey, r.openCount]),
      );

      const pageIds = allPages.map((p) => p.id);
      const results = await db
        .select({
          pageId: pageResults.pageId,
          status: pageResults.status,
          httpStatus: pageResults.httpStatus,
          loadMs: pageResults.loadMs,
          violations: pageResults.violations,
          passes: pageResults.passes,
          incomplete: pageResults.incomplete,
          score: pageResults.score,
        })
        .from(pageResults)
        .where(and(eq(pageResults.orgId, orgId), inArray(pageResults.pageId, pageIds)))
        .orderBy(desc(pageResults.createdAt));

      const pageLatestResultMap = new Map<string, (typeof results)[0]>();
      for (const res of results) {
        if (!pageLatestResultMap.has(res.pageId)) {
          pageLatestResultMap.set(res.pageId, res);
        }
      }

      const formatTemplateName = (key: string): string => {
        if (key === 'home') return 'Home page';
        if (key === 'product') return 'Product pages';
        if (key === 'collection') return 'Collections';
        if (key === 'cart') return 'Cart';
        if (key === 'account') return 'Account & Login';
        if (key === 'article') return 'Articles & Blog posts';
        if (key === 'blog-index') return 'Blog index';
        if (key === 'search') return 'Search';
        if (key.startsWith('page:')) {
          const slug = key.slice(5);
          return `Page: ${slug.charAt(0).toUpperCase() + slug.slice(1)}`;
        }
        return key.charAt(0).toUpperCase() + key.slice(1);
      };

      type PageItem = (typeof allPages)[0] & {
        lastResultStatus: string | null;
        violations: number | null;
        passes: number | null;
        score: number | null;
      };

      const groupsMap = new Map<
        string,
        {
          templateKey: string;
          templateName: string;
          pagesDiscovered: number;
          pagesCheckedLastScan: number;
          openIssuesCount: number;
          pages: PageItem[];
        }
      >();

      for (const page of allPages) {
        let group = groupsMap.get(page.templateKey);
        if (!group) {
          group = {
            templateKey: page.templateKey,
            templateName: formatTemplateName(page.templateKey),
            pagesDiscovered: 0,
            pagesCheckedLastScan: 0,
            openIssuesCount: templateIssueCountMap.get(page.templateKey) ?? 0,
            pages: [],
          };
          groupsMap.set(page.templateKey, group);
        }

        group.pagesDiscovered++;
        if (page.lastScannedScanId) {
          group.pagesCheckedLastScan++;
        }

        const latestResult = pageLatestResultMap.get(page.id);
        group.pages.push({
          ...page,
          lastResultStatus: latestResult?.status ?? null,
          violations: latestResult?.violations ?? null,
          passes: latestResult?.passes ?? null,
          score: latestResult?.score ?? null,
        });
      }

      return Array.from(groupsMap.values());
    },

    /**
     * Toggles pin status for a page and synchronizes sites.pinnedUrls (Spec S-29, S-34).
     */
    async setPin(orgId: OrgId, siteId: string, pageIdOrUrl: string, isPinned: boolean) {
      let [page] = await db
        .select()
        .from(pages)
        .where(
          and(
            eq(pages.orgId, orgId),
            eq(pages.siteId, siteId),
            sql`(${pages.id} = ${pageIdOrUrl} or ${pages.url} = ${pageIdOrUrl})`,
          ),
        )
        .limit(1);

      if (!page && isPinned) {
        const urlHash = hashUrl(pageIdOrUrl);
        const [inserted] = await db
          .insert(pages)
          .values({
            orgId,
            siteId,
            url: pageIdOrUrl,
            urlHash,
            templateKey: 'custom',
            title: pageIdOrUrl,
            isPinned: true,
          })
          .onConflictDoUpdate({
            target: [pages.siteId, pages.urlHash],
            set: { isPinned: true, updatedAt: new Date() },
          })
          .returning();
        page = inserted;
      }

      if (!page) {
        return null;
      }

      const [updatedPage] = await db
        .update(pages)
        .set({ isPinned, updatedAt: new Date() })
        .where(and(eq(pages.orgId, orgId), eq(pages.id, page.id)))
        .returning();

      const [site] = await db
        .select({ pinnedUrls: sites.pinnedUrls })
        .from(sites)
        .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId), isNull(sites.deletedAt)))
        .limit(1);

      if (site) {
        const currentPins = new Set(site.pinnedUrls || []);
        if (isPinned) {
          currentPins.add(page.url);
        } else {
          currentPins.delete(page.url);
        }

        await db
          .update(sites)
          .set({
            pinnedUrls: Array.from(currentPins),
            updatedAt: new Date(),
          })
          .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId)));
      }

      return updatedPage ?? null;
    },

    /**
     * Previews how many discovered URLs match the provided excluded path globs.
     * Satisfies Spec S-34 & Chunk P2-16 acceptance criteria:
     * "[ ] Excluded-path preview shows how many discovered URLs match."
     */
    async previewExclusions(orgId: OrgId, siteId: string, patterns: string[]) {
      const allPages = await db
        .select({ url: pages.url })
        .from(pages)
        .where(and(eq(pages.orgId, orgId), eq(pages.siteId, siteId)));

      if (allPages.length === 0 || patterns.length === 0) {
        return {
          matchCount: 0,
          matchedUrls: [],
        };
      }

      const isExcluded = createExcludedPathMatcher(patterns);
      const matchedUrls: string[] = [];

      for (const page of allPages) {
        try {
          const pathname = new URL(page.url).pathname;
          if (isExcluded(pathname)) {
            matchedUrls.push(page.url);
          }
        } catch {
          // ignore invalid URLs
        }
      }

      return {
        matchCount: matchedUrls.length,
        matchedUrls: matchedUrls.slice(0, 50),
      };
    },
  };
}

export type PagesRepository = ReturnType<typeof pagesRepository>;
