import { sql } from 'drizzle-orm';
import { boolean, check, index, integer, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { id, inList, timestamps } from './columns.js';
import { organizations } from './identity.js';

export const WEBHOOK_KINDS = ['slack', 'generic'] as const;
export type WebhookKind = (typeof WEBHOOK_KINDS)[number];

export const webhooks = pgTable(
  'webhooks',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<WebhookKind>().notNull(),
    urlEncrypted: text('url_encrypted').notNull(),
    events: text('events').array().notNull(),
    siteIds: uuid('site_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    active: boolean('active').notNull().default(true),
    lastStatus: integer('last_status'),
    lastError: text('last_error'),
    failureCount: integer('failure_count').notNull().default(0),
    secret: text('secret'),
    ...timestamps(),
  },
  (t) => [
    index('webhooks_org_id_idx').on(t.orgId),
    index('webhooks_active_idx').on(t.active),
    check('webhooks_kind_check', sql`${t.kind} in (${inList(WEBHOOK_KINDS)})`),
  ],
);

export type WebhookRow = typeof webhooks.$inferSelect;
export type NewWebhookRow = typeof webhooks.$inferInsert;
