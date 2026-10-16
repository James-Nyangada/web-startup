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
} from 'drizzle-orm/pg-core';
import { citext, id, timestamps } from './columns.js';

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

export type Plan = (typeof PLANS)[number];
export type BillingStatus = (typeof BILLING_STATUSES)[number];
export type OrgRole = (typeof ORG_ROLES)[number];

const inList = (values: readonly string[]) => sql.raw(values.map((v) => `'${v}'`).join(', '));

export const users = pgTable('users', {
  id: id(),
  email: citext('email').notNull().unique(),
  name: text('name'),
  emailVerifiedAt: timestamp('email_verified_at', { withTimezone: true }),
  avatarUrl: text('avatar_url'),
  timeZone: text('time_zone').notNull().default('UTC'),
  isStaff: boolean('is_staff').notNull().default(false),
  // FK added in a later phase; a plain column avoids a users <-> organizations cycle here.
  lastActiveOrgId: uuid('last_active_org_id'),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  ...timestamps(),
});

export const organizations = pgTable(
  'organizations',
  {
    id: id(),
    name: text('name').notNull(),
    slug: citext('slug').unique(),
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
