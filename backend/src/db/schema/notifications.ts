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
import { createdAt, id, inList, timestamps } from './columns.js';
import { organizations, users } from './identity.js';

export const SCAN_COMPLETED_PREFS = ['all', 'issues_only', 'off'] as const;
export type ScanCompletedPref = (typeof SCAN_COMPLETED_PREFS)[number];

export const notificationPreferences = pgTable(
  'notification_preferences',
  {
    id: id(),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    scanCompleted: text('scan_completed').$type<ScanCompletedPref>().notNull().default('all'),
    regressions: boolean('regressions').notNull().default(true),
    weeklyDigest: boolean('weekly_digest').notNull().default(true),
    productUpdates: boolean('product_updates').notNull().default(true),
    billing: boolean('billing').notNull().default(true),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('notification_preferences_user_org_unique').on(t.userId, t.orgId),
    index('notification_preferences_org_id_idx').on(t.orgId),
    check(
      'notification_prefs_scan_completed_check',
      sql`${t.scanCompleted} in (${inList(SCAN_COMPLETED_PREFS)})`,
    ),
  ],
);

export const inAppNotifications = pgTable(
  'in_app_notifications',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').notNull(),
    title: text('title').notNull(),
    body: text('body').notNull(),
    link: text('link'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [
    index('in_app_notifications_user_read_idx').on(t.userId, t.readAt),
    index('in_app_notifications_org_id_idx').on(t.orgId),
  ],
);
