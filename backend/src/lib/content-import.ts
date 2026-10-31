/** Converts the site's existing static blog posts into Markdown for the CMS (staff spec 3.1, migration). */

export interface StaticBlogPost {
  slug: string;
  title: string;
  summary: string;
  date: string;
  readingTime: string;
  author: { name: string; role: string; avatar: string };
  tags: string[];
  content: {
    sectionTitle: string;
    paragraphs: string[];
    codeBlock?: { language: string; code: string; caption?: string };
  }[];
}

export function blogPostToMarkdown(post: StaticBlogPost): string {
  return post.content
    .map((s) => {
      const parts = [`## ${s.sectionTitle}`, ...s.paragraphs];
      if (s.codeBlock) {
        if (s.codeBlock.caption) parts.push(`*${s.codeBlock.caption}*`);
        parts.push(`\`\`\`${s.codeBlock.language}\n${s.codeBlock.code}\n\`\`\``);
      }
      return parts.join('\n\n');
    })
    .join('\n\n');
}

/** "October 14, 2026" -> that day at 09:00 UTC; the original day is kept, no time zone drift. */
export function parseBlogDate(text: string): Date {
  const parsed = new Date(`${text} 09:00:00 UTC`);
  if (Number.isNaN(parsed.getTime())) throw new Error(`Cannot read the date "${text}".`);
  return parsed;
}

export interface StaticChangelogEntry {
  version: string;
  date: string;
  title: string;
  badge: 'Major' | 'Feature' | 'Improvement' | 'Security';
  summary: string;
  highlights: string[];
}

/** The CMS changelog has three types; the old static badges map onto them. */
export function changelogTypeFor(badge: StaticChangelogEntry['badge']): 'new' | 'improved' | 'fixed' {
  return badge === 'Major' || badge === 'Feature' ? 'new' : 'improved';
}

/** "October 18, 2026" -> "2026-10-18" (the CMS stores changelog dates as plain days). */
export function changelogDay(text: string): string {
  return parseBlogDate(text).toISOString().slice(0, 10);
}

export function changelogToMarkdown(entry: StaticChangelogEntry): string {
  return [`**${entry.version}** — ${entry.summary}`, entry.highlights.map((h) => `- ${h}`).join('\n')].join('\n\n');
}
