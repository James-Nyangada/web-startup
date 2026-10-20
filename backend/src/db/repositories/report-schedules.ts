import { and, desc, eq, isNull, notInArray } from 'drizzle-orm';
import type { Database } from '../client.js';
import { organizations, reportSchedules, sites, type ReportScheduleRow } from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export interface CreateReportScheduleInput {
  siteId: string;
  recipients: string[];
  dayOfMonth: number;
  active?: boolean;
}

export interface UpdateReportScheduleInput {
  recipients?: string[];
  dayOfMonth?: number;
  active?: boolean;
}

export interface ReportScheduleWithSite extends ReportScheduleRow {
  siteName: string;
  clientName: string | null;
}

export function reportSchedulesRepository(db: Database) {
  return {
    async create(orgId: OrgId, input: CreateReportScheduleInput): Promise<ReportScheduleRow> {
      if (input.dayOfMonth < 1 || input.dayOfMonth > 28) {
        throw new Error('Day of month must be between 1 and 28');
      }
      if (input.recipients.length === 0 || input.recipients.length > 10) {
        throw new Error('Schedule must have between 1 and 10 recipients');
      }

      const [row] = await db
        .insert(reportSchedules)
        .values({
          orgId,
          siteId: input.siteId,
          recipients: input.recipients,
          dayOfMonth: input.dayOfMonth,
          type: 'client_monthly',
          active: input.active ?? true,
        })
        .returning();

      if (!row) {
        throw new Error('Failed to create report schedule');
      }

      return row;
    },

    async listByOrg(orgId: OrgId): Promise<ReportScheduleWithSite[]> {
      const rows = await db
        .select({
          schedule: reportSchedules,
          siteName: sites.name,
          clientName: sites.clientName,
        })
        .from(reportSchedules)
        .innerJoin(sites, eq(reportSchedules.siteId, sites.id))
        .where(and(eq(reportSchedules.orgId, orgId), isNull(sites.deletedAt)))
        .orderBy(desc(reportSchedules.createdAt));

      return rows.map((r) => ({
        ...r.schedule,
        siteName: r.siteName,
        clientName: r.clientName,
      }));
    },

    async listBySite(orgId: OrgId, siteId: string): Promise<ReportScheduleWithSite[]> {
      const rows = await db
        .select({
          schedule: reportSchedules,
          siteName: sites.name,
          clientName: sites.clientName,
        })
        .from(reportSchedules)
        .innerJoin(sites, eq(reportSchedules.siteId, sites.id))
        .where(
          and(
            eq(reportSchedules.orgId, orgId),
            eq(reportSchedules.siteId, siteId),
            isNull(sites.deletedAt),
          ),
        )
        .orderBy(desc(reportSchedules.createdAt));

      return rows.map((r) => ({
        ...r.schedule,
        siteName: r.siteName,
        clientName: r.clientName,
      }));
    },

    async findById(orgId: OrgId, id: string): Promise<ReportScheduleWithSite | null> {
      const [row] = await db
        .select({
          schedule: reportSchedules,
          siteName: sites.name,
          clientName: sites.clientName,
        })
        .from(reportSchedules)
        .innerJoin(sites, eq(reportSchedules.siteId, sites.id))
        .where(and(eq(reportSchedules.orgId, orgId), eq(reportSchedules.id, id)))
        .limit(1);

      if (!row) return null;

      return {
        ...row.schedule,
        siteName: row.siteName,
        clientName: row.clientName,
      };
    },

    async update(
      orgId: OrgId,
      id: string,
      patch: UpdateReportScheduleInput,
    ): Promise<ReportScheduleRow | null> {
      if (patch.dayOfMonth !== undefined && (patch.dayOfMonth < 1 || patch.dayOfMonth > 28)) {
        throw new Error('Day of month must be between 1 and 28');
      }
      if (
        patch.recipients !== undefined &&
        (patch.recipients.length === 0 || patch.recipients.length > 10)
      ) {
        throw new Error('Schedule must have between 1 and 10 recipients');
      }

      const [row] = await db
        .update(reportSchedules)
        .set({
          ...(patch.recipients !== undefined ? { recipients: patch.recipients } : {}),
          ...(patch.dayOfMonth !== undefined ? { dayOfMonth: patch.dayOfMonth } : {}),
          ...(patch.active !== undefined ? { active: patch.active } : {}),
          updatedAt: new Date(),
        })
        .where(and(eq(reportSchedules.orgId, orgId), eq(reportSchedules.id, id)))
        .returning();

      return row ?? null;
    },

    async delete(orgId: OrgId, id: string): Promise<boolean> {
      const [row] = await db
        .delete(reportSchedules)
        .where(and(eq(reportSchedules.orgId, orgId), eq(reportSchedules.id, id)))
        .returning();

      return Boolean(row);
    },

    async findDueSchedules(dayOfMonth: number) {
      return db
        .select({
          schedule: reportSchedules,
          org: organizations,
          site: sites,
        })
        .from(reportSchedules)
        .innerJoin(organizations, eq(reportSchedules.orgId, organizations.id))
        .innerJoin(sites, eq(reportSchedules.siteId, sites.id))
        .where(
          and(
            eq(reportSchedules.active, true),
            eq(reportSchedules.dayOfMonth, dayOfMonth),
            isNull(organizations.deletedAt),
            isNull(sites.deletedAt),
            notInArray(organizations.billingStatus, ['read_only', 'canceled']),
          ),
        );
    },

    async updateLastSent(id: string, sentAt: Date): Promise<void> {
      await db
        .update(reportSchedules)
        .set({
          lastSentAt: sentAt,
          updatedAt: new Date(),
        })
        .where(eq(reportSchedules.id, id));
    },
  };
}

export type ReportSchedulesRepository = ReturnType<typeof reportSchedulesRepository>;
