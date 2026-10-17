import { sql } from 'drizzle-orm';
import type { Database } from './client.js';
import { rules } from './schema/index.js';
import { RULE_CATALOG } from '../scanner/rules/catalog.js';

/**
 * Ensures all rules from the catalog are present in the database.
 * Idempotent: safe to run multiple times.
 */
export async function ensureRulesSeeded(db: Database): Promise<void> {
  const allRules = Array.from(RULE_CATALOG.values());
  const chunkSize = 25;

  for (let i = 0; i < allRules.length; i += chunkSize) {
    const chunk = allRules.slice(i, i + chunkSize);
    const rows = chunk.map((r) => ({
      ruleId: r.ruleId,
      title: r.title,
      description: r.description,
      whoIsAffected: r.whoIsAffected.join(', '),
      wcagCriteria: r.wcagCriteria,
      wcagLevel: r.wcagLevel,
      defaultImpact: r.defaultImpact,
      weight: r.weight,
      helpUrl: r.helpUrl,
      axeVersion: r.axeVersion,
    }));

    await db
      .insert(rules)
      .values(rows)
      .onConflictDoUpdate({
        target: rules.ruleId,
        set: {
          title: sql`excluded.title`,
          description: sql`excluded.description`,
          whoIsAffected: sql`excluded.who_is_affected`,
          wcagCriteria: sql`excluded.wcag_criteria`,
          wcagLevel: sql`excluded.wcag_level`,
          defaultImpact: sql`excluded.default_impact`,
          weight: sql`excluded.weight`,
          helpUrl: sql`excluded.help_url`,
          axeVersion: sql`excluded.axe_version`,
        },
      });
  }
}
