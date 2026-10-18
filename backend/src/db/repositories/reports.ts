import { and, count, desc, eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  reports,
  scans,
  sites,
  users,
  type ReportRow,
  type ReportType,
  type ReportStatus,
} from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export interface CreateReportInput {
  siteId?: string | null;
  scanId?: string | null;
  type: ReportType;
  branded?: boolean;
  requestedBy?: string | null;
  expiresAt?: Date | null;
}

export interface ListReportsOptions {
  siteId?: string;
  limit?: number;
  offset?: number;
}

export interface ReportWithDetails extends ReportRow {
  siteName?: string | null;
  scanScore?: number | null;
  requesterName?: string | null;
}

export function reportsRepository(db: Database) {
  return {
    async create(orgId: OrgId, input: CreateReportInput): Promise<ReportRow> {
      const [row] = await db
        .insert(reports)
        .values({
          orgId,
          siteId: input.siteId ?? null,
          scanId: input.scanId ?? null,
          type: input.type,
          branded: input.branded ?? false,
          requestedBy: input.requestedBy ?? null,
          expiresAt: input.expiresAt ?? null,
          status: 'queued',
        })
        .returning();

      if (!row) {
        throw new Error('Failed to create report record.');
      }
      return row;
    },

    async findById(orgId: OrgId, id: string): Promise<ReportWithDetails | null> {
      const rows = await db
        .select({
          report: reports,
          siteName: sites.name,
          scanScore: scans.score,
          requesterName: users.name,
        })
        .from(reports)
        .leftJoin(sites, eq(reports.siteId, sites.id))
        .leftJoin(scans, eq(reports.scanId, scans.id))
        .leftJoin(users, eq(reports.requestedBy, users.id))
        .where(and(eq(reports.id, id), eq(reports.orgId, orgId)))
        .limit(1);

      if (!rows.length || !rows[0]) return null;
      const { report, siteName, scanScore, requesterName } = rows[0];
      return {
        ...report,
        siteName,
        scanScore,
        requesterName,
      };
    },

    async findRawById(id: string): Promise<ReportWithDetails | null> {
      const rows = await db
        .select({
          report: reports,
          siteName: sites.name,
          scanScore: scans.score,
          requesterName: users.name,
        })
        .from(reports)
        .leftJoin(sites, eq(reports.siteId, sites.id))
        .leftJoin(scans, eq(reports.scanId, scans.id))
        .leftJoin(users, eq(reports.requestedBy, users.id))
        .where(eq(reports.id, id))
        .limit(1);

      if (!rows.length || !rows[0]) return null;
      const { report, siteName, scanScore, requesterName } = rows[0];
      return {
        ...report,
        siteName,
        scanScore,
        requesterName,
      };
    },

    async listByOrg(
      orgId: OrgId,
      options: ListReportsOptions = {},
    ): Promise<{ reports: ReportWithDetails[]; total: number }> {
      const conditions = [eq(reports.orgId, orgId)];
      if (options.siteId) {
        conditions.push(eq(reports.siteId, options.siteId));
      }

      const whereClause = and(...conditions);

      const [totalRow] = await db.select({ count: count() }).from(reports).where(whereClause);

      const total = Number(totalRow?.count ?? 0);

      const query = db
        .select({
          report: reports,
          siteName: sites.name,
          scanScore: scans.score,
          requesterName: users.name,
        })
        .from(reports)
        .leftJoin(sites, eq(reports.siteId, sites.id))
        .leftJoin(scans, eq(reports.scanId, scans.id))
        .leftJoin(users, eq(reports.requestedBy, users.id))
        .where(whereClause)
        .orderBy(desc(reports.createdAt));

      if (options.limit) {
        query.limit(options.limit);
      }
      if (options.offset) {
        query.offset(options.offset);
      }

      const rows = await query;
      return {
        reports: rows.map(({ report, siteName, scanScore, requesterName }) => ({
          ...report,
          siteName,
          scanScore,
          requesterName,
        })),
        total,
      };
    },

    async updateStatus(
      id: string,
      status: ReportStatus,
      fields?: { fileKey?: string; fileSize?: number; expiresAt?: Date | null },
    ): Promise<ReportRow | null> {
      const [updated] = await db
        .update(reports)
        .set({
          status,
          ...(fields?.fileKey !== undefined ? { fileKey: fields.fileKey } : {}),
          ...(fields?.fileSize !== undefined ? { fileSize: fields.fileSize } : {}),
          ...(fields?.expiresAt !== undefined ? { expiresAt: fields.expiresAt } : {}),
          updatedAt: new Date(),
        })
        .where(eq(reports.id, id))
        .returning();

      return updated ?? null;
    },

    async delete(orgId: OrgId, id: string): Promise<boolean> {
      const deleted = await db
        .delete(reports)
        .where(and(eq(reports.id, id), eq(reports.orgId, orgId)))
        .returning({ id: reports.id });

      return deleted.length > 0;
    },
  };
}

export type ReportsRepository = ReturnType<typeof reportsRepository>;
