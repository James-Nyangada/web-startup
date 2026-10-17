import { sql } from 'drizzle-orm';
import {
  boolean,
  check,
  pgTable,
  smallint,
  text,
  timestamp,
  uniqueIndex,
} from 'drizzle-orm/pg-core';
import { PLATFORMS, type Platform } from '../../scanner/types.js';
import { id, inList, timestamps } from './columns.js';

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
