import { sql } from 'drizzle-orm';
import { boolean, check, index, inet, jsonb, pgTable, text, uuid } from 'drizzle-orm/pg-core';
import { citext, createdAt, id, timestamps } from './columns.js';
import { organizations, users } from './identity.js';

export const ACTOR_TYPES = ['user', 'staff', 'system', 'api_key'] as const;
export type ActorType = (typeof ACTOR_TYPES)[number];

/** Append-only: UPDATE and DELETE are blocked by a trigger (drizzle/0001_*.sql). */
export const auditLog = pgTable(
  'audit_log',
  {
    id: id(),
    orgId: uuid('org_id').references(() => organizations.id, { onDelete: 'cascade' }),
    actorId: uuid('actor_id').references(() => users.id, { onDelete: 'set null' }),
    actorType: text('actor_type').$type<ActorType>().notNull(),
    action: text('action').notNull(),
    targetType: text('target_type'),
    targetId: text('target_id'),
    ip: inet('ip'),
    userAgent: text('user_agent'),
    data: jsonb('data').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: createdAt(),
  },
  (t) => [
    index('audit_log_org_created_idx').on(t.orgId, t.createdAt.desc()),
    check(
      'audit_log_actor_type_check',
      sql`${t.actorType} in ('user', 'staff', 'system', 'api_key')`,
    ),
  ],
);

export const featureFlags = pgTable('feature_flags', {
  key: text('key').primaryKey(),
  enabled: boolean('enabled').notNull().default(false),
  orgIds: uuid('org_ids')
    .array()
    .notNull()
    .default(sql`'{}'::uuid[]`),
  ...timestamps(),
});

export const waitlist = pgTable('waitlist', {
  id: id(),
  email: citext('email').notNull().unique(),
  source: text('source'),
  consent: boolean('consent').notNull().default(false),
  ...timestamps(),
});

export interface FreeCheckIssue {
  ruleId: string;
  title: string;
  impact: 'critical' | 'serious' | 'moderate' | 'minor';
  wcagCriteria: string[];
  occurrences: number;
  whoIsAffected: string;
  selector?: string;
  htmlSnippet?: string;
}

export interface FreeCheckResultPayload {
  score: number;
  scoreBand: 'Good' | 'Needs work' | 'Poor';
  counts: {
    critical: number;
    serious: number;
    moderate: number;
    minor: number;
  };
  topIssues: FreeCheckIssue[];
  pageTitle?: string | null;
  checkedAt: string;
  loadMs?: number | null;
}

export const freeChecks = pgTable(
  'free_checks',
  {
    id: id(),
    url: text('url').notNull(),
    domain: text('domain').notNull(),
    email: citext('email'),
    ipHash: text('ip_hash').notNull(),
    status: text('status').$type<'pending' | 'running' | 'completed' | 'failed'>().notNull().default('pending'),
    result: jsonb('result').$type<FreeCheckResultPayload>(),
    reportKey: text('report_key'),
    marketingConsent: boolean('marketing_consent').notNull().default(false),
    convertedOrgId: uuid('converted_org_id').references(() => organizations.id, { onDelete: 'set null' }),
    errorMessage: text('error_message'),
    ...timestamps(),
  },
  (t) => [
    index('free_checks_ip_hash_created_idx').on(t.ipHash, t.createdAt.desc()),
    index('free_checks_domain_created_idx').on(t.domain, t.createdAt.desc()),
  ],
);
