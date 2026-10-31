import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps, createdAt, citext } from './columns.js';
import { organizations, users } from './identity.js';
import { rules } from './knowledge.js';

export const STAFF_ROLES = ['owner', 'admin', 'editor', 'support', 'analyst'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export const CONTENT_POST_TYPES = ['blog', 'guide'] as const;
export type ContentPostType = (typeof CONTENT_POST_TYPES)[number];

export const CONTENT_POST_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const;
export type ContentPostStatus = (typeof CONTENT_POST_STATUSES)[number];

export const CHANGELOG_TYPES = ['new', 'improved', 'fixed'] as const;
export type ChangelogType = (typeof CHANGELOG_TYPES)[number];

export const BANNER_SURFACES = ['site', 'app', 'both'] as const;
export type BannerSurface = (typeof BANNER_SURFACES)[number];

export const BANNER_STYLES = ['info', 'success', 'warning'] as const;
export type BannerStyle = (typeof BANNER_STYLES)[number];

export const SITE_DEPLOY_STATUSES = ['queued', 'building', 'live', 'failed'] as const;
export type SiteDeployStatus = (typeof SITE_DEPLOY_STATUSES)[number];

export const HEALTH_BANDS = ['good', 'at_risk', 'poor'] as const;
export type HealthBand = (typeof HEALTH_BANDS)[number];

export const staffMembers = pgTable(
  'staff_members',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .unique()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<StaffRole>().notNull().default('admin'),
    displayName: text('display_name'),
    jobTitle: text('job_title'),
    bio: text('bio'),
    avatarKey: text('avatar_key'),
    active: boolean('active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    check(
      'staff_members_role_check',
      sql`${t.role} in ('owner', 'admin', 'editor', 'support', 'analyst')`,
    ),
  ],
);

/** Pending email invitations to join staff; the account is created when the link is accepted. */
export const staffInvitations = pgTable(
  'staff_invitations',
  {
    id: id(),
    email: citext('email').notNull(),
    role: text('role').$type<StaffRole>().notNull(),
    displayName: text('display_name'),
    jobTitle: text('job_title'),
    bio: text('bio'),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index('staff_invitations_email_idx').on(t.email),
    check(
      'staff_invitations_role_check',
      sql`${t.role} in ('owner', 'admin', 'editor', 'support', 'analyst')`,
    ),
  ],
);

export const mediaAssets = pgTable('media_assets', {
  id: id(),
  key: text('key').notNull().unique(),
  filename: text('filename').notNull(),
  mime: text('mime').notNull(),
  size: integer('size').notNull(),
  width: integer('width'),
  height: integer('height'),
  variants: jsonb('variants').$type<Record<string, unknown>>().default({}),
  altText: text('alt_text'),
  isDecorative: boolean('is_decorative').notNull().default(false),
  caption: text('caption'),
  credit: text('credit'),
  uploadedBy: uuid('uploaded_by').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps(),
});

export const contentPosts = pgTable(
  'content_posts',
  {
    id: id(),
    type: text('type').$type<ContentPostType>().notNull().default('blog'),
    slug: text('slug').notNull(),
    title: text('title').notNull(),
    excerpt: text('excerpt'),
    bodyMd: text('body_md').notNull().default(''),
    coverMediaId: uuid('cover_media_id').references(() => mediaAssets.id, { onDelete: 'set null' }),
    coverAlt: text('cover_alt'),
    authorStaffId: uuid('author_staff_id')
      .notNull()
      .references(() => staffMembers.id, { onDelete: 'restrict' }),
    tags: text('tags')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    seoTitle: text('seo_title'),
    seoDescription: text('seo_description'),
    ogMediaId: uuid('og_media_id').references(() => mediaAssets.id, { onDelete: 'set null' }),
    canonicalUrl: text('canonical_url'),
    noindex: boolean('noindex').notNull().default(false),
    status: text('status').$type<ContentPostStatus>().notNull().default('draft'),
    publishAt: timestamp('publish_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    updatedBy: uuid('updated_by').references(() => users.id, { onDelete: 'set null' }),

    // Guide-specific fields
    ruleId: text('rule_id').references(() => rules.ruleId, { onDelete: 'set null' }),
    platform: text('platform'),
    sections: jsonb('sections').$type<{
      whatsWrong: string;
      whoItAffects: string;
      howToFix: string;
      codeExample?: { incorrect?: string; correct?: string; language?: string };
      howToCheck: string;
    }>(),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),

    ...timestamps(),
  },
  (t) => [
    uniqueIndex('content_posts_type_slug_unique').on(t.type, t.slug),
    check('content_posts_type_check', sql`${t.type} in ('blog', 'guide')`),
    check(
      'content_posts_status_check',
      sql`${t.status} in ('draft', 'scheduled', 'published', 'archived')`,
    ),
  ],
);

export const contentRevisions = pgTable(
  'content_revisions',
  {
    id: id(),
    postId: uuid('post_id').references(() => contentPosts.id, { onDelete: 'cascade' }),
    pageKey: text('page_key'),
    version: integer('version').notNull(),
    data: jsonb('data').$type<Record<string, unknown>>().notNull(),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    note: text('note'),
    /** Site pages: when this published version takes effect (legal pages). */
    effectiveDate: timestamp('effective_date', { withTimezone: true }),
    /** Legal pages: plain-language summary of what changed. */
    changeSummary: text('change_summary'),
    ...timestamps(),
  },
  (t) => [
    index('content_revisions_post_id_idx').on(t.postId),
    uniqueIndex('content_revisions_page_version_unique')
      .on(t.pageKey, t.version)
      .where(sql`${t.pageKey} is not null`),
  ],
);

export const contentPages = pgTable('content_pages', {
  id: id(),
  pageKey: text('page_key').notNull().unique(),
  data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
  status: text('status').notNull().default('draft'),
  publishedVersion: integer('published_version').notNull().default(1),
  effectiveDate: timestamp('effective_date', { withTimezone: true }),
  publishedAt: timestamp('published_at', { withTimezone: true }),
  publishedBy: uuid('published_by').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps(),
});

export const redirects = pgTable('redirects', {
  id: id(),
  fromPath: text('from_path').notNull().unique(),
  toPath: text('to_path').notNull(),
  statusCode: integer('status_code').notNull().default(301),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps(),
});

export const changelogEntries = pgTable(
  'changelog_entries',
  {
    id: id(),
    date: text('date').notNull(),
    title: text('title').notNull(),
    type: text('type').$type<ChangelogType>().notNull().default('new'),
    bodyMd: text('body_md').notNull().default(''),
    showInApp: boolean('show_in_app').notNull().default(false),
    status: text('status').notNull().default('draft'),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [check('changelog_entries_type_check', sql`${t.type} in ('new', 'improved', 'fixed')`)],
);

export const banners = pgTable(
  'banners',
  {
    id: id(),
    surface: text('surface').$type<BannerSurface>().notNull().default('both'),
    message: text('message').notNull(),
    linkUrl: text('link_url'),
    style: text('style').$type<BannerStyle>().notNull().default('info'),
    audience: jsonb('audience')
      .$type<{ everyone?: boolean; loggedIn?: boolean; trial?: boolean; plans?: string[] }>()
      .notNull()
      .default({}),
    startsAt: timestamp('starts_at', { withTimezone: true }),
    endsAt: timestamp('ends_at', { withTimezone: true }),
    dismissible: boolean('dismissible').notNull().default(true),
    active: boolean('active').notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    check('banners_surface_check', sql`${t.surface} in ('site', 'app', 'both')`),
    check('banners_style_check', sql`${t.style} in ('info', 'success', 'warning')`),
  ],
);

export const siteSettings = pgTable('site_settings', {
  id: text('id').primaryKey().default('default'),
  supportEmail: text('support_email').notNull().default('support@everyvisitor.app'),
  bannedWords: text('banned_words')
    .array()
    .notNull()
    .default(
      sql`array['compliant', 'compliance guaranteed', 'ada-proof', 'lawsuit-proof', 'certified', '100% accessible']::text[]`,
    ),
  maintenanceMode: boolean('maintenance_mode').notNull().default(false),
  deployHookConfigured: boolean('deploy_hook_configured').notNull().default(false),
  ...timestamps(),
});

export const siteDeploys = pgTable(
  'site_deploys',
  {
    id: id(),
    trigger: text('trigger').$type<'publish' | 'manual' | 'schedule'>().notNull(),
    requestedBy: uuid('requested_by').references(() => users.id, { onDelete: 'set null' }),
    cfDeploymentId: text('cf_deployment_id'),
    status: text('status').$type<SiteDeployStatus>().notNull().default('queued'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    error: text('error'),
    ...timestamps(),
  },
  (t) => [
    check(
      'site_deploys_status_check',
      sql`${t.status} in ('queued', 'building', 'live', 'failed')`,
    ),
  ],
);

export const metricsDaily = pgTable(
  'metrics_daily',
  {
    id: id(),
    date: text('date').notNull(), // 'YYYY-MM-DD'
    metric: text('metric').notNull(),
    dimension: text('dimension'),
    value: numeric('value').notNull().default('0'),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('metrics_daily_date_metric_dimension_unique').on(
      t.date,
      t.metric,
      sql`coalesce(${t.dimension}, '')`,
    ),
    index('metrics_daily_metric_date_idx').on(t.metric, t.date),
  ],
);

export const analyticsCache = pgTable('analytics_cache', {
  id: id(),
  cacheKey: text('cache_key').notNull().unique(),
  payload: jsonb('payload').notNull(),
  fetchedAt: timestamp('fetched_at', { withTimezone: true }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...timestamps(),
});

export const orgNotes = pgTable(
  'org_notes',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    authorStaffId: uuid('author_staff_id')
      .notNull()
      .references(() => staffMembers.id, { onDelete: 'cascade' }),
    bodyMd: text('body_md').notNull(),
    ...timestamps(),
  },
  (t) => [index('org_notes_org_id_idx').on(t.orgId)],
);

export const orgTags = pgTable(
  'org_tags',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    tag: text('tag').notNull(),
    ...timestamps(),
  },
  (t) => [uniqueIndex('org_tags_org_tag_unique').on(t.orgId, t.tag)],
);

export const orgHealth = pgTable(
  'org_health',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .unique()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    score: integer('score').notNull(),
    band: text('band').$type<HealthBand>().notNull(),
    reasons: jsonb('reasons').$type<string[]>().notNull().default([]),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [check('org_health_band_check', sql`${t.band} in ('good', 'at_risk', 'poor')`)],
);

export const staffEmails = pgTable(
  'staff_emails',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    toEmail: text('to_email').notNull(),
    template: text('template').notNull(),
    subject: text('subject').notNull(),
    bodyMd: text('body_md').notNull(),
    sentBy: uuid('sent_by')
      .notNull()
      .references(() => staffMembers.id, { onDelete: 'cascade' }),
    resendId: text('resend_id'),
    status: text('status').notNull().default('sent'),
    ...timestamps(),
  },
  (t) => [index('staff_emails_org_id_idx').on(t.orgId)],
);

export const cancellationReasons = pgTable(
  'cancellation_reasons',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    reason: text('reason').notNull(),
    comment: text('comment'),
    createdAt: createdAt(),
  },
  (t) => [index('cancellation_reasons_org_id_idx').on(t.orgId)],
);

export const savedSegments = pgTable('saved_segments', {
  id: id(),
  name: text('name').notNull(),
  filters: jsonb('filters').$type<Record<string, unknown>>().notNull().default({}),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps(),
});

export const LEGAL_NOTICE_STATUSES = ['queued', 'sending', 'sent', 'failed'] as const;
export type LegalNoticeStatus = (typeof LEGAL_NOTICE_STATUSES)[number];

/** A "we changed our Terms / Privacy / Refunds" email to all customers (staff spec 3.5). */
export const legalNotices = pgTable('legal_notices', {
  id: id(),
  pageKey: text('page_key').notNull(),
  version: integer('version').notNull(),
  summary: text('summary').notNull(),
  linkUrl: text('link_url').notNull(),
  status: text('status').$type<LegalNoticeStatus>().notNull().default('queued'),
  recipientsTotal: integer('recipients_total').notNull().default(0),
  sentCount: integer('sent_count').notNull().default(0),
  error: text('error'),
  createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
  ...timestamps(),
});

/** A paying subscription changed plan or billing interval; the signed MRR change feeds expansion/contraction. */
export const subscriptionChanges = pgTable(
  'subscription_changes',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    fromPlan: text('from_plan').notNull(),
    fromInterval: text('from_interval').notNull(),
    toPlan: text('to_plan').notNull(),
    toInterval: text('to_interval').notNull(),
    /** New MRR minus old MRR, in cents (negative for a downgrade). */
    mrrDeltaCents: integer('mrr_delta_cents').notNull(),
    changedAt: timestamp('changed_at', { withTimezone: true }).notNull().defaultNow(),
    createdAt: createdAt(),
  },
  (t) => [index('subscription_changes_changed_at_idx').on(t.changedAt)],
);
