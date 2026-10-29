import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { and, eq, inArray } from 'drizzle-orm';
import { closeDb, getDb, type Database } from '../index.js';
import { contentPosts, rules, staffMembers } from '../schema/index.js';
import { loadAllFixGuides } from '../../fix-guides/loader.js';
import { parseGuideSections } from '../../lib/guide-markdown.js';
import { blogPostToMarkdown, parseBlogDate, type StaticBlogPost } from '../../lib/content-import.js';

export interface ImportResult {
  guidesImported: number;
  guidesSkipped: string[];
  blogImported: number;
  existing: number;
}

/**
 * One-off import of the existing blog posts and fix guides into the CMS tables, keeping every
 * slug and date so no URL changes. Safe to re-run: rows that already exist (same type + slug)
 * are left alone, so staff edits are never overwritten.
 */
export async function importContent(
  db: Database,
  blogPosts: StaticBlogPost[],
  log: (msg: string) => void = console.log,
): Promise<ImportResult> {
  const [owner] = await db
    .select({ id: staffMembers.id })
    .from(staffMembers)
    .where(and(eq(staffMembers.role, 'owner'), eq(staffMembers.active, true)))
    .limit(1);
  if (!owner) throw new Error('Create the owner staff member first (the import needs an author).');

  const staff = await db.select({ id: staffMembers.id, name: staffMembers.displayName }).from(staffMembers);
  const authorFor = (name: string) =>
    staff.find((s) => s.name?.trim().toLowerCase() === name.trim().toLowerCase())?.id ?? owner.id;

  const result: ImportResult = { guidesImported: 0, guidesSkipped: [], blogImported: 0, existing: 0 };

  const guides = loadAllFixGuides();
  const knownRules = new Set(
    (await db.select({ id: rules.ruleId }).from(rules).where(inArray(rules.ruleId, guides.map((g) => g.ruleId)))).map(
      (r) => r.id,
    ),
  );
  for (const g of guides) {
    if (!knownRules.has(g.ruleId)) {
      result.guidesSkipped.push(`${g.slug} (rule "${g.ruleId}" is not in the rules table; run db:seed first)`);
      continue;
    }
    const inserted = await db
      .insert(contentPosts)
      .values({
        type: 'guide',
        slug: g.slug,
        title: g.title,
        excerpt: g.summary,
        bodyMd: g.bodyMd,
        authorStaffId: owner.id,
        status: 'published',
        publishedAt: new Date(g.reviewedAt),
        ruleId: g.ruleId,
        platform: g.platform,
        sections: parseGuideSections(g.bodyMd),
        reviewedAt: new Date(g.reviewedAt),
      })
      .onConflictDoNothing()
      .returning({ id: contentPosts.id });
    if (inserted.length) result.guidesImported++;
    else result.existing++;
  }

  for (const p of blogPosts) {
    const publishedAt = parseBlogDate(p.date);
    const inserted = await db
      .insert(contentPosts)
      .values({
        type: 'blog',
        slug: p.slug,
        title: p.title,
        excerpt: p.summary,
        bodyMd: blogPostToMarkdown(p),
        authorStaffId: authorFor(p.author.name),
        tags: p.tags,
        status: 'published',
        publishedAt,
      })
      .onConflictDoNothing()
      .returning({ id: contentPosts.id });
    if (inserted.length) result.blogImported++;
    else result.existing++;
  }

  log(
    `Imported ${result.guidesImported} guides and ${result.blogImported} blog posts; ${result.existing} already existed.`,
  );
  for (const s of result.guidesSkipped) log(`Skipped guide: ${s}`);
  return result;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const blogPath = path.resolve(process.cwd(), process.argv[2] ?? '../web/lib/blog-data.ts');
    const mod = (await import(pathToFileURL(blogPath).href)) as { BLOG_POSTS: StaticBlogPost[] };
    await importContent(getDb().db, mod.BLOG_POSTS);
  } catch (error) {
    console.error('Import failed:', error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
