import { sql } from 'drizzle-orm';
import { closeDb, getDb, type Database } from '../index.js';
import { fixGuides, rules } from '../schema/index.js';
import { loadAllFixGuides } from '../../fix-guides/loader.js';
import { RULE_CATALOG } from '../../scanner/rules/catalog.js';
import type { Platform } from '../../scanner/types.js';

export async function seedFixGuides(db: Database): Promise<{ count: number }> {
  // Ensure rules are populated first so foreign key references succeed
  for (const rule of RULE_CATALOG.values()) {
    await db
      .insert(rules)
      .values({
        ruleId: rule.ruleId,
        title: rule.title,
        description: rule.description,
        whoIsAffected: rule.whoIsAffected.join(', '),
        wcagCriteria: rule.wcagCriteria,
        wcagLevel: rule.wcagLevel,
        defaultImpact: rule.defaultImpact,
        weight: rule.weight,
        helpUrl: rule.helpUrl,
        axeVersion: rule.axeVersion,
      })
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

  const guides = loadAllFixGuides();
  let count = 0;

  for (const g of guides) {
    await db
      .insert(fixGuides)
      .values({
        ruleId: g.ruleId,
        platform: g.platform as Platform,
        slug: g.slug,
        title: g.title,
        bodyMd: g.bodyMd,
        source: 'written',
        reviewedAt: new Date(g.reviewedAt),
        published: true,
      })
      .onConflictDoUpdate({
        target: [fixGuides.ruleId, fixGuides.platform],
        set: {
          title: sql`excluded.title`,
          slug: sql`excluded.slug`,
          bodyMd: sql`excluded.body_md`,
          reviewedAt: sql`excluded.reviewed_at`,
          published: sql`excluded.published`,
          updatedAt: new Date(),
        },
      });
    count++;
  }

  return { count };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const res = await seedFixGuides(getDb().db);
    console.log(`Successfully seeded ${res.count} fix guides.`);
  } catch (error) {
    console.error('Fix guides seed failed:', error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
