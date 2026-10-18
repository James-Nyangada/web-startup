import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { PLATFORMS, STANDARDS, type Platform, type Standard } from '../../scanner/types.js';
import { createdAt, id, inList, timestamps } from './columns.js';
import { organizations, users } from './identity.js';
import { rules, type Impact, type WcagLevel } from './knowledge.js';

export const SITE_STATUSES = ['pending_verification', 'active', 'paused', 'error'] as const;
export type SiteStatus = (typeof SITE_STATUSES)[number];

export const VERIFY_METHODS = ['meta', 'dns', 'file', 'plugin', 'shopify'] as const;
export type VerifyMethod = (typeof VERIFY_METHODS)[number];

export const SCAN_FREQUENCIES = ['weekly', 'daily', 'manual'] as const;
export type ScanFrequency = (typeof SCAN_FREQUENCIES)[number];

export const SCAN_TRIGGERS = ['scheduled', 'manual', 'onboarding', 'api', 'plugin'] as const;
export type ScanTrigger = (typeof SCAN_TRIGGERS)[number];

export const SCAN_STATUSES = [
  'queued',
  'discovering',
  'scanning',
  'processing',
  'completed',
  'partial',
  'failed',
  'canceled',
] as const;
export type ScanStatus = (typeof SCAN_STATUSES)[number];

export const PAGE_RESULT_STATUSES = ['ok', 'timeout', 'http_error', 'blocked', 'skipped'] as const;
export type PageResultStatus = (typeof PAGE_RESULT_STATUSES)[number];

export const ISSUE_STATUSES = ['open', 'fixed', 'ignored'] as const;
export type IssueStatus = (typeof ISSUE_STATUSES)[number];

export const IGNORED_REASONS = [
  'false_positive',
  'not_applicable',
  'wont_fix',
  'accepted_risk',
] as const;
export type IgnoredReason = (typeof IGNORED_REASONS)[number];

export const ISSUE_EVENT_TYPES = [
  'created',
  'fixed',
  'regressed',
  'ignored',
  'unignored',
  'assigned',
  'due_date_set',
  'note_added',
  'rechecked',
] as const;
export type IssueEventType = (typeof ISSUE_EVENT_TYPES)[number];

export const sites = pgTable(
  'sites',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    rootUrl: text('root_url').notNull(),
    platform: text('platform').$type<Platform>().notNull().default('unknown'),
    clientName: text('client_name'),
    status: text('status').$type<SiteStatus>().notNull().default('pending_verification'),
    verifyMethod: text('verify_method').$type<VerifyMethod>(),
    verifyToken: text('verify_token').notNull(),
    verifiedAt: timestamp('verified_at', { withTimezone: true }),
    scanFrequency: text('scan_frequency').$type<ScanFrequency>().notNull().default('weekly'),
    scanDay: smallint('scan_day').notNull().default(1),
    scanHour: smallint('scan_hour').notNull().default(2),
    pageLimit: integer('page_limit').notNull().default(50),
    standard: text('standard').$type<Standard>().notNull().default('wcag22aa'),
    pinnedUrls: text('pinned_urls')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    excludedPaths: text('excluded_paths')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    authNote: text('auth_note'),
    lastScanId: uuid('last_scan_id').references((): AnyPgColumn => scans.id, {
      onDelete: 'set null',
    }),
    nextScanAt: timestamp('next_scan_at', { withTimezone: true }),
    score: smallint('score'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('sites_org_root_url_unique')
      .on(t.orgId, t.rootUrl)
      .where(sql`${t.deletedAt} is null`),
    index('sites_org_id_idx').on(t.orgId),
    check('sites_platform_check', sql`${t.platform} in (${inList(PLATFORMS)})`),
    check('sites_status_check', sql`${t.status} in (${inList(SITE_STATUSES)})`),
    check(
      'sites_verify_method_check',
      sql`${t.verifyMethod} is null or ${t.verifyMethod} in (${inList(VERIFY_METHODS)})`,
    ),
    check('sites_scan_frequency_check', sql`${t.scanFrequency} in (${inList(SCAN_FREQUENCIES)})`),
    check('sites_standard_check', sql`${t.standard} in (${inList(STANDARDS)})`),
  ],
);

export const scans = pgTable(
  'scans',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    trigger: text('trigger').$type<ScanTrigger>().notNull(),
    status: text('status').$type<ScanStatus>().notNull().default('queued'),
    queuedAt: timestamp('queued_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    pagesDiscovered: integer('pages_discovered').notNull().default(0),
    pagesPlanned: integer('pages_planned').notNull().default(0),
    pagesScanned: integer('pages_scanned').notNull().default(0),
    pagesFailed: integer('pages_failed').notNull().default(0),
    templatesFound: integer('templates_found').notNull().default(0),
    axeVersion: text('axe_version'),
    engineVersion: text('engine_version'),
    standard: text('standard').$type<Standard>().notNull().default('wcag22aa'),
    score: smallint('score'),
    counts: jsonb('counts').$type<Record<string, unknown>>().notNull().default({}),
    rawKey: text('raw_key'),
    errorCode: text('error_code'),
    errorMessage: text('error_message'),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [
    index('scans_site_queued_idx').on(t.siteId, t.queuedAt.desc()),
    index('scans_org_id_idx').on(t.orgId),
    check('scans_trigger_check', sql`${t.trigger} in (${inList(SCAN_TRIGGERS)})`),
    check('scans_status_check', sql`${t.status} in (${inList(SCAN_STATUSES)})`),
    check('scans_standard_check', sql`${t.standard} in (${inList(STANDARDS)})`),
  ],
);

export const pages = pgTable(
  'pages',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    url: text('url').notNull(),
    urlHash: text('url_hash').notNull(),
    templateKey: text('template_key').notNull(),
    title: text('title'),
    firstSeenScanId: uuid('first_seen_scan_id').references(() => scans.id, {
      onDelete: 'set null',
    }),
    lastScannedScanId: uuid('last_scanned_scan_id').references(() => scans.id, {
      onDelete: 'set null',
    }),
    lastStatusCode: integer('last_status_code'),
    isPinned: boolean('is_pinned').notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('pages_site_url_hash_unique').on(t.siteId, t.urlHash),
    index('pages_org_id_idx').on(t.orgId),
    index('pages_site_template_idx').on(t.siteId, t.templateKey),
  ],
);

export const pageResults = pgTable(
  'page_results',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scans.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    status: text('status').$type<PageResultStatus>().notNull(),
    httpStatus: integer('http_status'),
    loadMs: integer('load_ms'),
    violations: integer('violations').notNull().default(0),
    passes: integer('passes').notNull().default(0),
    incomplete: integer('incomplete').notNull().default(0),
    score: smallint('score'),
    screenshotKey: text('screenshot_key'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('page_results_scan_page_unique').on(t.scanId, t.pageId),
    index('page_results_org_id_idx').on(t.orgId),
    index('page_results_page_id_idx').on(t.pageId),
    check('page_results_status_check', sql`${t.status} in (${inList(PAGE_RESULT_STATUSES)})`),
  ],
);

export const issues = pgTable(
  'issues',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references(() => sites.id, { onDelete: 'cascade' }),
    fingerprint: text('fingerprint').notNull(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => rules.ruleId, { onDelete: 'restrict' }),
    impact: text('impact').$type<Impact>().notNull(),
    wcagCriteria: text('wcag_criteria')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    wcagLevel: text('wcag_level').$type<WcagLevel>().notNull(),
    templateKey: text('template_key').notNull(),
    selector: text('selector').notNull(),
    htmlSnippet: text('html_snippet'),
    failureSummary: text('failure_summary'),
    status: text('status').$type<IssueStatus>().notNull().default('open'),
    ignoredReason: text('ignored_reason').$type<IgnoredReason>(),
    ignoredNote: text('ignored_note'),
    ignoredBy: uuid('ignored_by').references(() => users.id, { onDelete: 'set null' }),
    ignoredAt: timestamp('ignored_at', { withTimezone: true }),
    isRegression: boolean('is_regression').notNull().default(false),
    regressionCount: integer('regression_count').notNull().default(0),
    firstSeenScanId: uuid('first_seen_scan_id').references(() => scans.id, {
      onDelete: 'set null',
    }),
    lastSeenScanId: uuid('last_seen_scan_id').references(() => scans.id, { onDelete: 'set null' }),
    fixedScanId: uuid('fixed_scan_id').references(() => scans.id, { onDelete: 'set null' }),
    fixedAt: timestamp('fixed_at', { withTimezone: true }),
    occurrenceCount: integer('occurrence_count').notNull().default(1),
    assigneeId: uuid('assignee_id').references(() => users.id, { onDelete: 'set null' }),
    dueDate: date('due_date'),
    needsReview: boolean('needs_review').notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('issues_site_fingerprint_unique').on(t.siteId, t.fingerprint),
    index('issues_site_status_impact_idx').on(t.siteId, t.status, t.impact),
    index('issues_org_assignee_idx').on(t.orgId, t.assigneeId),
    index('issues_org_id_idx').on(t.orgId),
    check('issues_impact_check', sql`${t.impact} in ('critical', 'serious', 'moderate', 'minor')`),
    check('issues_status_check', sql`${t.status} in ('open', 'fixed', 'ignored')`),
    check('issues_wcag_level_check', sql`${t.wcagLevel} in ('A', 'AA')`),
    check(
      'issues_ignored_reason_check',
      sql`${t.ignoredReason} is null or ${t.ignoredReason} in (${inList(IGNORED_REASONS)})`,
    ),
  ],
);

export const issueOccurrences = pgTable(
  'issue_occurrences',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    scanId: uuid('scan_id')
      .notNull()
      .references(() => scans.id, { onDelete: 'cascade' }),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    pageId: uuid('page_id')
      .notNull()
      .references(() => pages.id, { onDelete: 'cascade' }),
    target: text('target').notNull(),
    ...timestamps(),
  },
  (t) => [
    index('issue_occurrences_issue_scan_idx').on(t.issueId, t.scanId),
    index('issue_occurrences_org_id_idx').on(t.orgId),
    index('issue_occurrences_scan_id_idx').on(t.scanId),
    index('issue_occurrences_page_id_idx').on(t.pageId),
  ],
);

export const issueEvents = pgTable(
  'issue_events',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    type: text('type').$type<IssueEventType>().notNull(),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    scanId: uuid('scan_id').references(() => scans.id, { onDelete: 'set null' }),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index('issue_events_issue_created_idx').on(t.issueId, t.createdAt.desc()),
    index('issue_events_org_id_idx').on(t.orgId),
    check('issue_events_type_check', sql`${t.type} in (${inList(ISSUE_EVENT_TYPES)})`),
  ],
);

export const issueNotes = pgTable(
  'issue_notes',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    issueId: uuid('issue_id')
      .notNull()
      .references(() => issues.id, { onDelete: 'cascade' }),
    authorId: uuid('author_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    body: text('body').notNull(),
    visibleToClient: boolean('visible_to_client').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index('issue_notes_issue_id_idx').on(t.issueId),
    index('issue_notes_org_id_idx').on(t.orgId),
  ],
);
