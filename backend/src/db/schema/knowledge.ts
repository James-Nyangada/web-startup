import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  index,
  integer,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';
import { PLATFORMS, type Platform } from '../../scanner/types.js';
import { id, inList, timestamps } from './columns.js';
import { organizations } from './identity.js';

export const IMPACTS = ['critical', 'serious', 'moderate', 'minor'] as const;
export type Impact = (typeof IMPACTS)[number];

export const WCAG_LEVELS = ['A', 'AA'] as const;
export type WcagLevel = (typeof WCAG_LEVELS)[number];

export const FIX_GUIDE_SOURCES = ['written', 'ai_reviewed'] as const;
export type FixGuideSource = (typeof FIX_GUIDE_SOURCES)[number];

export const rules = pgTable(
  'rules',
  {
    ruleId: text('rule_id').primaryKey(),
    title: text('title').notNull(),
    description: text('description').notNull(),
    whoIsAffected: text('who_is_affected').notNull(),
    wcagCriteria: text('wcag_criteria')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    wcagLevel: text('wcag_level').$type<WcagLevel>().notNull(),
    defaultImpact: text('default_impact').$type<Impact>().notNull(),
    weight: smallint('weight').notNull(),
    helpUrl: text('help_url').notNull(),
    axeVersion: text('axe_version').notNull(),
    ...timestamps(),
  },
  (t) => [
    check('rules_wcag_level_check', sql`${t.wcagLevel} in ('A', 'AA')`),
    check('rules_default_impact_check', sql`${t.defaultImpact} in (${inList(IMPACTS)})`),
  ],
);

export const fixGuides = pgTable(
  'fix_guides',
  {
    id: id(),
    ruleId: text('rule_id')
      .notNull()
      .references(() => rules.ruleId, { onDelete: 'cascade' }),
    platform: text('platform').$type<Platform>().notNull(),
    slug: text('slug').notNull().unique(),
    title: text('title').notNull(),
    bodyMd: text('body_md').notNull(),
    source: text('source').$type<FixGuideSource>().notNull().default('written'),
    reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
    published: boolean('published').notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('fix_guides_rule_platform_unique').on(t.ruleId, t.platform),
    check('fix_guides_platform_check', sql`${t.platform} in (${inList(PLATFORMS)})`),
    check('fix_guides_source_check', sql`${t.source} in (${inList(FIX_GUIDE_SOURCES)})`),
  ],
);

export const aiSuggestions = pgTable(
  'ai_suggestions',
  {
    id: id(),
    cacheKey: text('cache_key').notNull().unique(),
    ruleId: text('rule_id').notNull(),
    platform: text('platform').$type<Platform>().notNull(),
    suggestionMd: text('suggestion_md').notNull(),
    model: text('model').notNull(),
    tokensIn: integer('tokens_in').notNull().default(0),
    tokensOut: integer('tokens_out').notNull().default(0),
    flagged: boolean('flagged').notNull().default(false),
    ...timestamps(),
  },
  (t) => [
    index('ai_suggestions_rule_platform_idx').on(t.ruleId, t.platform),
  ],
);

export const aiUsage = pgTable(
  'ai_usage',
  {
    id: id(),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    month: text('month').notNull(), // 'YYYY-MM'
    requests: integer('requests').notNull().default(0),
    ...timestamps(),
  },
  (t) => [
    uniqueIndex('ai_usage_org_month_unique').on(t.orgId, t.month),
  ],
);
