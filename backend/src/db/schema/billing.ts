import {
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from 'drizzle-orm/pg-core';
import { id, timestamps } from './columns.js';
import { organizations } from './identity.js';

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' })
      .unique(),
    paddleSubscriptionId: text('paddle_subscription_id').notNull().unique(),
    paddlePriceId: text('paddle_price_id').notNull(),
    plan: text('plan').notNull(),
    interval: text('interval').notNull(), // 'month' | 'year'
    status: text('status').notNull(), // 'active', 'past_due', 'paused', 'canceled', 'trialing'
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }),
    cancelAtPeriodEnd: boolean('cancel_at_period_end').notNull().default(false),
    scheduledChange: jsonb('scheduled_change').$type<Record<string, unknown> | null>(),
    ...timestamps(),
  },
  (t) => [
    index('subscriptions_org_id_idx').on(t.orgId),
    index('subscriptions_paddle_sub_id_idx').on(t.paddleSubscriptionId),
  ],
);

export const paddleEvents = pgTable(
  'paddle_events',
  {
    eventId: text('event_id').primaryKey(),
    eventType: text('event_type').notNull(),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    payload: jsonb('payload').notNull(),
    error: text('error'),
  },
  (t) => [
    index('paddle_events_type_idx').on(t.eventType),
    index('paddle_events_received_at_idx').on(t.receivedAt),
  ],
);

export const invoices = pgTable(
  'invoices',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    paddleTransactionId: text('paddle_transaction_id').notNull().unique(),
    amountCents: integer('amount_cents').notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status').notNull(), // 'paid', 'past_due', 'pending', 'void', 'completed'
    billedAt: timestamp('billed_at', { withTimezone: true }).notNull(),
    invoiceUrl: text('invoice_url'),
    ...timestamps(),
  },
  (t) => [
    index('invoices_org_id_idx').on(t.orgId),
    index('invoices_billed_at_idx').on(t.billedAt.desc()),
  ],
);
