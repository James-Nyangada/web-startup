import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, inList, timestamps, citext } from './columns.js';
import { organizations, users } from './identity.js';
import { sites } from './scanning.js';

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
    /** HMAC signing secret for generic webhooks, AES-GCM encrypted (lib/encryption). */
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

/** Delivery log behind S-46's "last 20 deliveries"; pruned after 30 days by retention.prune. */
export const webhookDeliveries = pgTable(
  'webhook_deliveries',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    webhookId: uuid('webhook_id')
      .notNull()
      .references(() => webhooks.id, { onDelete: 'cascade' }),
    event: text('event').notNull(),
    status: integer('status'),
    error: text('error'),
    durationMs: integer('duration_ms').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('webhook_deliveries_webhook_created_idx').on(t.webhookId, t.createdAt.desc()),
    index('webhook_deliveries_created_idx').on(t.createdAt),
  ],
);

export type WebhookDeliveryRow = typeof webhookDeliveries.$inferSelect;

export const API_KEY_SCOPES = ['read', 'scan:write', 'plugin'] as const;
export type ApiKeyScope = (typeof API_KEY_SCOPES)[number];

/** Public REST API keys (Agency Pro, P6-06). Only the SHA-256 hash of the secret is stored. */
export const apiKeys = pgTable(
  'api_keys',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    /** First characters of the secret, shown in the UI so keys can be told apart. */
    prefix: text('prefix').notNull(),
    keyHash: text('key_hash').notNull().unique(),
    scopes: text('scopes').array().$type<ApiKeyScope[]>().notNull(),
    /** Site IDs this key is restricted to. Empty array means org-wide key. */
    siteIds: uuid('site_ids')
      .array()
      .notNull()
      .default(sql`'{}'::uuid[]`),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => users.id, { onDelete: 'set null' }),
    ...timestamps(),
  },
  (t) => [index('api_keys_org_id_idx').on(t.orgId)],
);

export type ApiKeyRow = typeof apiKeys.$inferSelect;

/** Shopify app sessions (P7-02). Stored in DB to survive multi-instance & container restarts. */
export const shopifySessions = pgTable(
  'shopify_sessions',
  {
    shop: citext('shop').primaryKey(),
    accessToken: text('access_token').notNull(),
    scope: text('scope').notNull(),
    siteId: uuid('site_id').references(() => sites.id, { onDelete: 'set null' }),
    apiKey: text('api_key'),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    plan: text('plan').notNull().default('trial'),
    subscriptionId: text('subscription_id'),
    installedAt: timestamp('installed_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('shopify_sessions_org_id_idx').on(t.orgId),
    index('shopify_sessions_site_id_idx').on(t.siteId),
  ],
);

export type ShopifySessionRow = typeof shopifySessions.$inferSelect;
export type NewShopifySessionRow = typeof shopifySessions.$inferInsert;
