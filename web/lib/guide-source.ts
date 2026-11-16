import { getAllFixGuides, getFixGuideBySlug, type FixGuideItem } from "@/lib/fix-guides-data";
import { getPost, getPosts, type CmsPost } from "@/lib/cms";

function codeSection(s: NonNullable<CmsPost["sections"]>): string {
  const lang = s.codeExample?.language ?? "";
  const parts: string[] = [];
  if (s.codeExample?.incorrect) parts.push(`### Incorrect\n\`\`\`${lang}\n${s.codeExample.incorrect}\n\`\`\``);
  if (s.codeExample?.correct) parts.push(`### Correct\n\`\`\`${lang}\n${s.codeExample.correct}\n\`\`\``);
  // Framework and CSS versions of the fix (Custom code guides).
  for (const x of s.extraExamples ?? []) parts.push(`### ${x.label}\n\`\`\`${x.language ?? ""}\n${x.code}\n\`\`\``);
  return parts.join("\n\n");
}

/** A CMS guide in the shape the guide pages already render. */
export function toGuideItem(p: CmsPost): FixGuideItem | null {
  const platform =
    p.platform === "shopify" || p.platform === "wordpress" || p.platform === "custom"
      ? p.platform
      : p.platform === "generic"
        ? "custom"
        : null;
  if (!platform || !p.ruleId || !p.sections) return null;
  return {
    ruleId: p.ruleId,
    platform,
    slug: p.slug,
    title: p.title,
    summary: p.excerpt ?? "",
    reviewedAt: p.reviewedAt ?? p.publishedAt ?? new Date(0).toISOString(),
    wrong: p.sections.whatsWrong,
    affects: p.sections.whoItAffects,
    howToFix: p.sections.howToFix,
    codeSnippet: codeSection(p.sections),
    howToCheck: p.sections.howToCheck,
    bodyMd: p.bodyMd,
  };
}

/** Published guides from the CMS; the guides shipped with the site only if the API is down. */
export async function loadGuides(): Promise<FixGuideItem[]> {
  const posts = await getPosts("guide");
  if (!posts) return getAllFixGuides();
  return posts.map(toGuideItem).filter((g): g is FixGuideItem => g !== null);
}

export async function loadGuide(slug: string): Promise<FixGuideItem | undefined> {
  const post = await getPost("guide", slug);
  if (post === null) return getFixGuideBySlug(slug);
  return post ? (toGuideItem(post) ?? undefined) : undefined;
}
