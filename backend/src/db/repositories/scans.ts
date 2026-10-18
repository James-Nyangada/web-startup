import { and, desc, eq, gte, isNull, ne, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import type { Standard } from '../../scanner/types.js';
import { scans, sites, type ScanStatus, type ScanTrigger } from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export interface CreateScanInput {
  siteId: string;
  trigger: ScanTrigger;
  standard?: Standard;
  pagesPlanned?: number;
  requestedBy?: string | null;
}

export interface UpdateScanInput {
  status?: ScanStatus;
  startedAt?: Date | null;
  finishedAt?: Date | null;
  pagesDiscovered?: number;
  pagesPlanned?: number;
  pagesScanned?: number;
  pagesFailed?: number;
  templatesFound?: number;
  axeVersion?: string | null;
  engineVersion?: string | null;
  score?: number | null;
  counts?: Record<string, unknown>;
  rawKey?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
}

export function scansRepository(db: Database) {
  return {
    async create(orgId: OrgId, input: CreateScanInput) {
      const [row] = await db
        .insert(scans)
        .values({
          orgId,
          siteId: input.siteId,
          trigger: input.trigger,
          standard: input.standard ?? 'wcag22aa',
          pagesPlanned: input.pagesPlanned ?? 10,
          requestedBy: input.requestedBy ?? null,
          status: 'queued',
        })
        .returning();
      return row;
    },

    async findById(orgId: OrgId, scanId: string) {
      const [row] = await db
        .select()
        .from(scans)
        .where(and(eq(scans.orgId, orgId), eq(scans.id, scanId)));
      return row ?? null;
    },

    async update(orgId: OrgId, scanId: string, input: UpdateScanInput) {
      const [row] = await db
        .update(scans)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(and(eq(scans.orgId, orgId), eq(scans.id, scanId)))
        .returning();

      // If scan finished with a score, update the site's cached score and lastScanId
      if (input.status === 'completed' && row && row.score !== null) {
        await db
          .update(sites)
          .set({
            score: row.score,
            lastScanId: row.id,
            updatedAt: new Date(),
          })
          .where(and(eq(sites.orgId, orgId), eq(sites.id, row.siteId), isNull(sites.deletedAt)));
      }

      return row ?? null;
    },

    async listBySite(orgId: OrgId, siteId: string, limit = 20, offset = 0) {
      return db
        .select()
        .from(scans)
        .where(and(eq(scans.orgId, orgId), eq(scans.siteId, siteId)))
        .orderBy(desc(scans.queuedAt))
        .limit(limit)
        .offset(offset);
    },

    async listTrendScans(orgId: OrgId, siteId: string, limit = 12) {
      const rows = await db
        .select({
          id: scans.id,
          score: scans.score,
          status: scans.status,
          counts: scans.counts,
          finishedAt: scans.finishedAt,
          queuedAt: scans.queuedAt,
          pagesScanned: scans.pagesScanned,
          pagesFailed: scans.pagesFailed,
          pagesPlanned: scans.pagesPlanned,
        })
        .from(scans)
        .where(
          and(
            eq(scans.orgId, orgId),
            eq(scans.siteId, siteId),
            sql`${scans.status} in ('completed', 'partial')`,
          ),
        )
        .orderBy(desc(scans.queuedAt))
        .limit(limit);

      return rows.reverse();
    },

    async countBySite(orgId: OrgId, siteId: string) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(scans)
        .where(and(eq(scans.orgId, orgId), eq(scans.siteId, siteId)));
      return row?.count ?? 0;
    },

    async findRunningScanForSite(orgId: OrgId, siteId: string) {
      const [row] = await db
        .select()
        .from(scans)
        .where(
          and(
            eq(scans.orgId, orgId),
            eq(scans.siteId, siteId),
            sql`${scans.status} in ('queued', 'discovering', 'scanning', 'processing')`,
          ),
        );
      return row ?? null;
    },

    async countOnboardingScansForSite(orgId: OrgId, siteId: string) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(scans)
        .where(
          and(eq(scans.orgId, orgId), eq(scans.siteId, siteId), eq(scans.trigger, 'onboarding')),
        );
      return row?.count ?? 0;
    },

    async countManualScansSince(orgId: OrgId, siteId: string, sinceDate: Date) {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(scans)
        .where(
          and(
            eq(scans.orgId, orgId),
            eq(scans.siteId, siteId),
            eq(scans.trigger, 'manual'),
            gte(scans.queuedAt, sinceDate),
            ne(scans.status, 'canceled'),
          ),
        );
      return row?.count ?? 0;
    },

    async cancelScan(orgId: OrgId, scanId: string) {
      const [row] = await db
        .update(scans)
        .set({
          status: 'canceled',
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(scans.orgId, orgId),
            eq(scans.id, scanId),
            sql`${scans.status} in ('queued', 'discovering', 'scanning', 'processing')`,
          ),
        )
        .returning();
      return row ?? null;
    },

    async findRawById(scanId: string) {
      const [row] = await db.select().from(scans).where(eq(scans.id, scanId));
      return row ?? null;
    },

    async updateRaw(scanId: string, input: UpdateScanInput) {
      const [row] = await db
        .update(scans)
        .set({
          ...input,
          updatedAt: new Date(),
        })
        .where(eq(scans.id, scanId))
        .returning();

      if (input.status === 'completed' && row && row.score !== null) {
        await db
          .update(sites)
          .set({
            score: row.score,
            lastScanId: row.id,
            updatedAt: new Date(),
          })
          .where(and(eq(sites.id, row.siteId), isNull(sites.deletedAt)));
      }

      return row ?? null;
    },

    async findInterruptedScans() {
      return db
        .select()
        .from(scans)
        .where(sql`${scans.status} in ('discovering', 'scanning', 'processing')`);
    },

    async requeueInterrupted(scanId: string) {
      const [row] = await db
        .update(scans)
        .set({
          status: 'queued',
          updatedAt: new Date(),
        })
        .where(eq(scans.id, scanId))
        .returning();
      return row ?? null;
    },

    async markFailed(scanId: string, errorCode: string, errorMessage: string) {
      const [row] = await db
        .update(scans)
        .set({
          status: 'failed',
          errorCode,
          errorMessage,
          finishedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(scans.id, scanId))
        .returning();
      return row ?? null;
    },
  };
}

export type ScansRepository = ReturnType<typeof scansRepository>;
