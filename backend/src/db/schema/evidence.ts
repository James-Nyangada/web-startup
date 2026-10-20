import { sql } from 'drizzle-orm';
import {
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, inList, timestamps } from './columns.js';
import { organizations, users } from './identity.js';
import { sites } from './scanning.js';

export const EVIDENCE_EVENT_TYPES = [
  'site_added',
  'site_verified',
  'scan_completed',
  'issue_fixed',
  'issue_regressed',
  'issue_ignored',
  'manual_check_logged',
  'statement_published',
  'report_generated',
  'report_sent',
  'plan_changed',
] as const;
export type EvidenceEventType = (typeof EVIDENCE_EVENT_TYPES)[number];

export const evidenceEvents = pgTable(
  'evidence_events',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    type: text('type').$type<EvidenceEventType>().notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    occurredAt: timestamp('occurred_at', { withTimezone: true }).notNull().defaultNow(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  },
  (t) => [
    index('evidence_events_org_site_occurred_idx').on(t.orgId, t.siteId, t.occurredAt.desc()),
    index('evidence_events_site_type_idx').on(t.siteId, t.type),
    check('evidence_events_type_check', sql`${t.type} in (${inList(EVIDENCE_EVENT_TYPES)})`),
  ],
);

export type EvidenceEventRow = typeof evidenceEvents.$inferSelect;
export type NewEvidenceEventRow = typeof evidenceEvents.$inferInsert;

export const MANUAL_CHECK_TYPES = [
  'keyboard',
  'screen_reader',
  'zoom_reflow',
  'color_contrast_manual',
  'captions',
  'forms',
  'other',
] as const;
export type ManualCheckType = (typeof MANUAL_CHECK_TYPES)[number];

export const MANUAL_CHECK_RESULTS = ['pass', 'issues_found', 'partial'] as const;
export type ManualCheckResult = (typeof MANUAL_CHECK_RESULTS)[number];

export const manualChecks = pgTable(
  'manual_checks',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    checkType: text('check_type').$type<ManualCheckType>().notNull(),
    performedAt: date('performed_at').notNull(),
    performedByName: text('performed_by_name').notNull(),
    tool: text('tool').notNull(),
    result: text('result').$type<ManualCheckResult>().notNull(),
    notes: text('notes').notNull(),
    attachmentKey: text('attachment_key'),
    createdBy: uuid('created_by')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (t) => [
    index('manual_checks_site_performed_idx').on(t.siteId, t.performedAt.desc()),
    index('manual_checks_org_id_idx').on(t.orgId),
    check('manual_checks_type_check', sql`${t.checkType} in (${inList(MANUAL_CHECK_TYPES)})`),
    check('manual_checks_result_check', sql`${t.result} in (${inList(MANUAL_CHECK_RESULTS)})`),
  ],
);

export type ManualCheckRow = typeof manualChecks.$inferSelect;
export type NewManualCheckRow = typeof manualChecks.$inferInsert;

export const STATEMENT_STATUSES = ['draft', 'published'] as const;
export type StatementStatus = (typeof STATEMENT_STATUSES)[number];

export const statements = pgTable(
  'statements',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    version: integer('version').notNull(),
    status: text('status').$type<StatementStatus>().notNull().default('draft'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    renderedHtml: text('rendered_html'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('statements_site_version_unique').on(t.siteId, t.version),
    index('statements_site_status_idx').on(t.siteId, t.status),
    check('statements_status_check', sql`${t.status} in (${inList(STATEMENT_STATUSES)})`),
  ],
);

export type StatementRow = typeof statements.$inferSelect;
export type NewStatementRow = typeof statements.$inferInsert;
