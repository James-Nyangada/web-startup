import { and, asc, desc, eq, ilike, isNotNull, isNull, lte, ne, or, sql } from 'drizzle-orm';
import { randomBytes } from 'node:crypto';
import type { Database } from '../client.js';
import type { Platform, Standard } from '../../scanner/types.js';
import {
  issues,
  organizations,
  scans,
  sites,
  type ScanFrequency,
  type SiteStatus,
  type VerifyMethod,
} from '../schema/index.js';
import { computeNextScanAt } from '../../lib/schedule.js';
import type { OrgId } from './org-scope.js';

export interface SiteListOptions {
  status?: SiteStatus;
  platform?: Platform;
  client?: string;
  q?: string;
  sort?: 'score' | 'name' | 'lastScan' | 'openCritical';
}

/** Per-site numbers for the sites list (S-21) and organisation overview (S-20). */
export interface SiteSummary {
  openCritical: number;
  openSerious: number;
  regressions: number;
  lastScanAt: Date | null;
  lastScanStatus: string | null;
  lastScanError: string | null;
  previousScore: number | null;
}

export interface CreateSiteInput {
  name: string;
  rootUrl: string;
  platform?: Platform;
  clientName?: string | null;
  scanFrequency?: ScanFrequency;
  scanDay?: number;
  scanHour?: number;
  pageLimit?: number;
  standard?: Standard;
  pinnedUrls?: string[];
  excludedPaths?: string[];
  timeZone?: string;
}

export interface UpdateSiteInput {
  name?: string;
  clientName?: string | null;
  scanFrequency?: ScanFrequency;
  scanDay?: number;
  scanHour?: number;
  pageLimit?: number;
  standard?: Standard;
  pinnedUrls?: string[];
  excludedPaths?: string[];
  timeZone?: string;
}

export function sitesRepository(db: Database) {
  return {
    async list(orgId: OrgId, options: SiteListOptions = {}) {
      const conditions = [eq(sites.orgId, orgId), isNull(sites.deletedAt)];

      if (options.status) {
        conditions.push(eq(sites.status, options.status));
      }

      if (options.platform) {
        conditions.push(eq(sites.platform, options.platform));
      }

      if (options.client) {
        conditions.push(ilike(sites.clientName, `%${options.client.trim()}%`));
      }

      if (options.q) {
        const q = `%${options.q.trim()}%`;
        conditions.push(or(ilike(sites.name, q), ilike(sites.rootUrl, q))!);
      }

      let query = db
        .select()
        .from(sites)
        .where(and(...conditions));

      switch (options.sort) {
        case 'score':
          query = query.orderBy(asc(sites.score), asc(sites.name)) as typeof query;
          break;
        case 'name':
          query = query.orderBy(asc(sites.name)) as typeof query;
          break;
        case 'lastScan':
          query = query.orderBy(desc(sites.updatedAt)) as typeof query;
          break;
        case 'openCritical':
          query = query.orderBy(asc(sites.score)) as typeof query;
          break;
        default:
          query = query.orderBy(desc(sites.createdAt)) as typeof query;
          break;
      }

      return query;
    },

    async listSummaries(orgId: OrgId, siteIds: string[]): Promise<Map<string, SiteSummary>> {
      const summaries = new Map<string, SiteSummary>();
      if (siteIds.length === 0) return summaries;
      for (const id of siteIds) {
        summaries.set(id, {
          openCritical: 0,
          openSerious: 0,
          regressions: 0,
          lastScanAt: null,
          lastScanStatus: null,
          lastScanError: null,
          previousScore: null,
        });
      }
      const idList = sql.join(
        siteIds.map((id) => sql`${id}::uuid`),
        sql`, `,
      );

      const counts = await db
        .select({
          siteId: issues.siteId,
          critical: sql<number>`count(*) filter (where ${issues.impact} = 'critical')::int`,
          serious: sql<number>`count(*) filter (where ${issues.impact} = 'serious')::int`,
          regressions: sql<number>`count(*) filter (where ${issues.isRegression})::int`,
        })
        .from(issues)
        .where(
          and(
            eq(issues.orgId, orgId),
            sql`${issues.siteId} in (${idList})`,
            eq(issues.status, 'open'),
          ),
        )
        .groupBy(issues.siteId);
      for (const row of counts) {
        const summary = summaries.get(row.siteId);
        if (!summary) continue;
        summary.openCritical = row.critical;
        summary.openSerious = row.serious;
        summary.regressions = row.regressions;
      }

      // Latest scan of any status, plus the score of the second-latest finished scan for the delta.
      const ranked = db
        .select({
          siteId: scans.siteId,
          status: scans.status,
          score: scans.score,
          errorMessage: scans.errorMessage,
          at: sql<Date>`coalesce(${scans.finishedAt}, ${scans.queuedAt})`.as('at'),
          anyRank:
            sql<number>`row_number() over (partition by ${scans.siteId} order by ${scans.queuedAt} desc)`.as(
              'any_rank',
            ),
          doneRank:
            sql<number>`row_number() over (partition by ${scans.siteId}, ${scans.status} in ('completed', 'partial') order by ${scans.queuedAt} desc)`.as(
              'done_rank',
            ),
        })
        .from(scans)
        .where(and(eq(scans.orgId, orgId), sql`${scans.siteId} in (${idList})`))
        .as('ranked');
      const scanRows = await db
        .select()
        .from(ranked)
        .where(
          or(
            eq(ranked.anyRank, 1),
            and(sql`${ranked.status} in ('completed', 'partial')`, eq(ranked.doneRank, 2)),
          ),
        );
      for (const row of scanRows) {
        const summary = summaries.get(row.siteId);
        if (!summary) continue;
        if (Number(row.anyRank) === 1) {
          summary.lastScanAt = new Date(row.at);
          summary.lastScanStatus = row.status;
          summary.lastScanError = row.errorMessage;
        }
        if (Number(row.doneRank) === 2 && ['completed', 'partial'].includes(row.status)) {
          summary.previousScore = row.score;
        }
      }
      return summaries;
    },

    async findById(orgId: OrgId, siteId: string) {
      const [row] = await db
        .select()
        .from(sites)
        .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId), isNull(sites.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async findByRootUrl(orgId: OrgId, rootUrl: string) {
      const [row] = await db
        .select()
        .from(sites)
        .where(and(eq(sites.orgId, orgId), eq(sites.rootUrl, rootUrl), isNull(sites.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async count(orgId: OrgId): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sites)
        .where(and(eq(sites.orgId, orgId), isNull(sites.deletedAt)));
      return row?.count ?? 0;
    },

    async countActive(orgId: OrgId): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sites)
        .where(and(eq(sites.orgId, orgId), isNull(sites.deletedAt), ne(sites.status, 'paused')));
      return row?.count ?? 0;
    },

    async countDailySites(orgId: OrgId): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(sites)
        .where(
          and(eq(sites.orgId, orgId), isNull(sites.deletedAt), eq(sites.scanFrequency, 'daily')),
        );
      return row?.count ?? 0;
    },

    async create(orgId: OrgId, input: CreateSiteInput) {
      const verifyToken = `ps_${randomBytes(16).toString('hex')}`;
      const scanFrequency = input.scanFrequency ?? 'weekly';
      const scanDay = input.scanDay ?? 1;
      const scanHour = input.scanHour ?? 2;
      const nextScanAt = computeNextScanAt({
        frequency: scanFrequency,
        scanDay,
        scanHour,
        timeZone: input.timeZone ?? 'UTC',
      });

      const [row] = await db
        .insert(sites)
        .values({
          orgId,
          name: input.name,
          rootUrl: input.rootUrl,
          platform: input.platform ?? 'unknown',
          clientName: input.clientName ?? null,
          verifyToken,
          scanFrequency,
          scanDay,
          scanHour,
          nextScanAt,
          pageLimit: input.pageLimit ?? 50,
          standard: input.standard ?? 'wcag22aa',
          pinnedUrls: input.pinnedUrls ?? [],
          excludedPaths: input.excludedPaths ?? [],
        })
        .returning();
      if (!row) {
        throw new Error('Failed to insert site record.');
      }
      return row;
    },

    async update(orgId: OrgId, siteId: string, patch: UpdateSiteInput) {
      let nextScanAt: Date | null | undefined = undefined;
      if (
        patch.scanFrequency !== undefined ||
        patch.scanDay !== undefined ||
        patch.scanHour !== undefined ||
        patch.timeZone !== undefined
      ) {
        const existing = await this.findById(orgId, siteId);
        if (existing) {
          nextScanAt = computeNextScanAt({
            frequency: patch.scanFrequency ?? existing.scanFrequency,
            scanDay: patch.scanDay ?? existing.scanDay,
            scanHour: patch.scanHour ?? existing.scanHour,
            timeZone: patch.timeZone ?? 'UTC',
          });
        }
      }

      const directPatch = { ...patch };
      delete directPatch.timeZone;
      const updateData: Record<string, unknown> = {
        ...directPatch,
        updatedAt: new Date(),
      };
      if (nextScanAt !== undefined) {
        updateData.nextScanAt = nextScanAt;
      }

      const [row] = await db
        .update(sites)
        .set(updateData)
        .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId), isNull(sites.deletedAt)))
        .returning();
      return row ?? null;
    },

    async pause(orgId: OrgId, siteId: string) {
      const [row] = await db
        .update(sites)
        .set({
          status: 'paused',
          updatedAt: new Date(),
        })
        .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId), isNull(sites.deletedAt)))
        .returning();
      return row ?? null;
    },

    async resume(orgId: OrgId, siteId: string) {
      const existing = await this.findById(orgId, siteId);
      if (!existing) return null;

      const newStatus = existing.verifiedAt ? 'active' : 'pending_verification';

      const [row] = await db
        .update(sites)
        .set({
          status: newStatus,
          updatedAt: new Date(),
        })
        .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId), isNull(sites.deletedAt)))
        .returning();
      return row ?? null;
    },

    async softDelete(orgId: OrgId, siteId: string) {
      const [row] = await db
        .update(sites)
        .set({
          deletedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId), isNull(sites.deletedAt)))
        .returning();
      return row ?? null;
    },

    async setVerified(orgId: OrgId, siteId: string, method: VerifyMethod) {
      const [row] = await db
        .update(sites)
        .set({
          status: 'active',
          verifyMethod: method,
          verifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(sites.orgId, orgId), eq(sites.id, siteId), isNull(sites.deletedAt)))
        .returning();
      return row ?? null;
    },

    async findRawById(siteId: string) {
      const [row] = await db
        .select()
        .from(sites)
        .where(and(eq(sites.id, siteId), isNull(sites.deletedAt)));
      return row ?? null;
    },

    async findDueForScheduledScan(limit = 20) {
      return db
        .select({
          site: sites,
          orgTimeZone: organizations.timeZone,
          orgPlan: organizations.plan,
          orgBillingStatus: organizations.billingStatus,
        })
        .from(sites)
        .innerJoin(organizations, eq(sites.orgId, organizations.id))
        .where(
          and(
            eq(sites.status, 'active'),
            isNull(sites.deletedAt),
            isNotNull(sites.nextScanAt),
            lte(sites.nextScanAt, new Date()),
            isNull(organizations.deletedAt),
            ne(organizations.billingStatus, 'read_only'),
          ),
        )
        .orderBy(asc(sites.nextScanAt))
        .limit(limit);
    },

    async updateNextScanAt(siteId: string, nextScanAt: Date | null) {
      const [row] = await db
        .update(sites)
        .set({
          nextScanAt,
          updatedAt: new Date(),
        })
        .where(eq(sites.id, siteId))
        .returning();
      return row ?? null;
    },
  };
}

export type SitesRepository = ReturnType<typeof sitesRepository>;
