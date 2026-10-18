import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from 'drizzle-orm/pg-core';
import { citext, id, inList, timestamps } from './columns.js';
import { sites } from './scanning.js';

export const PLANS = ['trial', 'store', 'growth', 'agency', 'agency_pro'] as const;
export const BILLING_STATUSES = [
  'trialing',
  'active',
  'past_due',
  'paused',
  'canceled',
  'read_only',
] as const;
export const ORG_ROLES = ['owner', 'admin', 'member'] as const;
export const INVITATION_ROLES = ['admin', 'member', 'client_viewer'] as const;

export type Plan = (typeof PLANS)[number];
export const ORG_TYPES = ['agency', 'store'] as const;
export type OrgType = (typeof ORG_TYPES)[number];
export type BillingStatus = (typeof BILLING_STATUSES)[number];
export type OrgRole = (typeof ORG_ROLES)[number];
export type InvitationRole = (typeof INVITATION_ROLES)[number];

export const users = pgTable('users', {
  id: id(),
  email: citext('email').notNull().unique(),
  name: text('name'),
  /** Better Auth's verified flag; email_verified_at records when it happened. */
  emailVerified: boolean('email_verified').notNull().default(false),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  avatarUrl: text('avatar_url'),
  timeZone: text('time_zone').notNull().default('UTC'),
  isStaff: boolean('is_staff').notNull().default(false),
  lastActiveOrgId: uuid('last_active_org_id').references((): AnyPgColumn => organizations.id, {
    onDelete: 'set null',
  }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps(),
});

export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    name: text('name').notNull(),
    slug: citext('slug').unique(),
    /** Chosen in onboarding (S-14); drives agency defaults and the S-20 store redirect. */
    type: text('type').$type<OrgType>().notNull().default('store'),
    plan: text('plan').$type<Plan>().notNull().default('trial'),
    billingStatus: text('billing_status').$type<BillingStatus>().notNull().default('trialing'),
    trialEndsAt: timestamp('trial_ends_at', { withTimezone: true }),
    paddleCustomerId: text('paddle_customer_id').unique(),
    timeZone: text('time_zone').notNull().default('UTC'),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    check('organizations_plan_check', sql`${t.plan} in (${inList(PLANS)})`),
    check('organizations_type_check', sql`${t.type} in (${inList(ORG_TYPES)})`),
    check(
      'organizations_billing_status_check',
      sql`${t.billingStatus} in (${inList(BILLING_STATUSES)})`,
    ),
  ],
);

export const memberships = pgTable(
  'memberships',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    role: text('role').$type<OrgRole>().notNull(),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('memberships_org_user_unique').on(t.orgId, t.userId),
    // Exactly one owner per org: at most one here, at least one enforced in the service layer.
    uniqueIndex('memberships_one_owner_per_org')
      .on(t.orgId)
      .where(sql`${t.role} = 'owner'`),
    index('memberships_org_id_idx').on(t.orgId),
    index('memberships_user_id_idx').on(t.userId),
    check('memberships_role_check', sql`${t.role} in (${inList(ORG_ROLES)})`),
  ],
);

export const invitations = pgTable(
  'invitations',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    email: citext('email').notNull(),
    role: text('role').$type<InvitationRole>().notNull(),
    siteIds: uuid('site_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    tokenHash: text('token_hash').notNull().unique(),
    invitedBy: uuid('invited_by').references(() => users.id, { onDelete: 'set null' }),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    acceptedAt: timestamp('accepted_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    ...timestamps(),
  },
  (t) => [
    index('invitations_org_id_idx').on(t.orgId),
    check('invitations_role_check', sql`${t.role} in (${inList(INVITATION_ROLES)})`),
  ],
);

export const clientAccess = pgTable(
  'client_access',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    siteId: uuid('site_id')
      .notNull()
      .references((): AnyPgColumn => sites.id, { onDelete: 'cascade' }),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('client_access_user_site_unique').on(t.userId, t.siteId),
    index('client_access_org_id_idx').on(t.orgId),
    index('client_access_site_id_idx').on(t.siteId),
  ],
);

export const branding = pgTable('branding', {
  id: id(),
  orgId: uuid('org_id')
    .notNull()
    .unique()
    .references(() => organizations.id, { onDelete: 'cascade' }),
  displayName: text('display_name'),
  logoLightKey: text('logo_light_key'),
  logoDarkKey: text('logo_dark_key'),
  primaryColor: text('primary_color'),
  emailSenderName: text('email_sender_name'),
  reportFooter: text('report_footer'),
  hideProductBrand: boolean('hide_product_brand').notNull().default(false),
  customDomain: citext('custom_domain').unique(),
  customDomainVerifiedAt: timestamp('custom_domain_verified_at', { withTimezone: true }),
  customDomainVerifyToken: text('custom_domain_verify_token'),
  ...timestamps(),
});

export const sessions = pgTable(
  'sessions',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    token: text('token').notNull().unique(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    ...timestamps(),
  },
  (t) => [index('sessions_user_id_idx').on(t.userId)],
);

export const accounts = pgTable(
  'accounts',
  {
    id: text('id').primaryKey(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...timestamps(),
  },
  (t) => [index('accounts_user_id_idx').on(t.userId)],
);

export const verifications = pgTable(
  'verifications',
  {
    id: text('id').primaryKey(),
    identifier: text('identifier').notNull(),
    value: text('value').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    ...timestamps(),
  },
  (t) => [index('verifications_identifier_idx').on(t.identifier)],
);
