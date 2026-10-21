import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, inList, timestamps } from './columns.js';
import { organizations, users } from './identity.js';
import { scans, sites } from './scanning.js';

export const REPORT_TYPES = [
  'scan_summary',
  'full',
  'evidence_pack',
  'client_monthly',
  'agency_overview',
] as const;
export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_STATUSES = ['queued', 'rendering', 'ready', 'failed'] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

export const reports = pgTable(
  'reports',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'cascade' }),
    scanId: uuid('scan_id').references(() => scans.id, { onDelete: 'set null' }),
    type: text('type').$type<ReportType>().notNull(),
    status: text('status').$type<ReportStatus>().notNull().default('queued'),
    fileKey: text('file_key'),
    fileSize: integer('file_size'),
    branded: boolean('branded').notNull().default(false),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    /** Period covered (inclusive, YYYY-MM-DD). Set for evidence packs (R-03). */
    dateFrom: date('date_from'),
    dateTo: date('date_to'),
    ...timestamps(),
  },
  (t) => [
    index('reports_org_created_idx').on(t.orgId, t.createdAt.desc()),
    check(
      'reports_date_range_check',
      sql`${t.dateFrom} is null or ${t.dateTo} is null or ${t.dateFrom} <= ${t.dateTo}`,
    ),
    index('reports_site_id_idx').on(t.siteId),
    check('reports_type_check', sql`${t.type} in (${inList(REPORT_TYPES)})`),
    check('reports_status_check', sql`${t.status} in (${inList(REPORT_STATUSES)})`),
  ],
);

export type ReportRow = typeof reports.$inferSelect;
export type NewReportRow = typeof reports.$inferInsert;

export const reportSchedules = pgTable(
  'report_schedules',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    recipients: text('recipients').array().notNull(),
    dayOfMonth: integer('day_of_month').notNull(),
    type: text('type').$type<'client_monthly'>().notNull().default('client_monthly'),
    active: boolean('active').notNull().default(true),
    lastSentAt: timestamp('last_sent_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index('report_schedules_org_site_idx').on(t.orgId, t.siteId),
    index('report_schedules_day_active_idx').on(t.dayOfMonth, t.active),
    check('report_schedules_day_check', sql`${t.dayOfMonth} >= 1 and ${t.dayOfMonth} <= 28`),
  ],
);

export type ReportScheduleRow = typeof reportSchedules.$inferSelect;
export type NewReportScheduleRow = typeof reportSchedules.$inferInsert;
