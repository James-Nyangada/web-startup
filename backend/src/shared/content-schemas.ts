import { z } from 'zod';
import { guideUrlSegment } from './platforms.js';

export const homeHeroSchema = z.object({
  headline: z.string().trim().min(1).max(150),
  subheadline: z.string().trim().min(1).max(300),
  ctaButtonLabel: z.string().trim().min(1).max(50).default('Check my store free'),
  trustLine: z.string().trim().max(200).default('No credit card · Results in 60 seconds · Zero tracking cookies'),
});

export const homeFactItemSchema = z.object({
  statement: z.string().trim().min(1).max(300),
  sourceName: z.string().trim().min(1).max(100),
  sourceUrl: z.string().url('Source URL must be a valid URL'),
});

export const homeFactsSchema = z.object({
  items: z.array(homeFactItemSchema).min(1).max(3),
});

export const homeStepSchema = z.object({
  stepNumber: z.number().int().min(1).max(4),
  title: z.string().trim().min(1).max(80),
  description: z.string().trim().min(1).max(250),
  screenshotUrl: z.string().optional(),
  screenshotAlt: z.string().trim().min(1, 'Alt text is required for screenshots'),
});

export const homeHowItWorksSchema = z.object({
  steps: z.array(homeStepSchema).length(4, 'Exactly 4 steps required'),
});

export const homeAgencySchema = z.object({
  headline: z.string().trim().min(1).max(120),
  subtext: z.string().trim().min(1).max(300),
  bullets: z.array(z.string().trim().min(1).max(150)).length(3, 'Exactly 3 bullets required'),
  imageUrl: z.string().optional(),
  imageAlt: z.string().trim().min(1, 'Alt text is required for agency image'),
});

export const overlayComparisonRowSchema = z.object({
  label: z.string().trim().min(1).max(100),
  overlayValue: z.string().trim().min(1).max(200),
  everyVisitorValue: z.string().trim().min(1).max(200),
});

export const overlayComparisonSchema = z.object({
  rows: z.array(overlayComparisonRowSchema).min(1),
});

export const faqItemSchema = z.object({
  id: z.string().optional(),
  question: z.string().trim().min(1).max(200),
  answerMd: z.string().trim().min(1),
  order: z.number().int().default(0),
  pages: z.array(z.enum(['home', 'pricing'])).min(1),
});

export const faqListSchema = z.object({
  items: z.array(faqItemSchema),
});

export const pricingCopySchema = z.object({
  planDescriptions: z.record(z.string(), z.string().trim()),
  mostPopularBadgePlan: z.string().trim().default('growth'),
});

export const footerLinkSchema = z.object({
  label: z.string().trim().min(1).max(50),
  url: z.string().trim().min(1),
});

export const footerLinkGroupSchema = z.object({
  title: z.string().trim().min(1).max(50),
  links: z.array(footerLinkSchema),
});

export const footerSchema = z.object({
  tagline: z.string().trim().max(200),
  linkGroups: z.array(footerLinkGroupSchema),
});

export const legalPageSchema = z.object({
  title: z.string().trim().min(1).max(100),
  effectiveDate: z.string().optional(),
  bodyMd: z.string().trim().min(1),
  summaryOfChanges: z.string().trim().optional(),
});

export const PAGE_SCHEMAS: Record<string, z.ZodTypeAny> = {
  'home.hero': homeHeroSchema,
  'home.facts': homeFactsSchema,
  'home.howItWorks': homeHowItWorksSchema,
  'home.agency': homeAgencySchema,
  'home.overlayComparison': overlayComparisonSchema,
  'home.faq': faqListSchema,
  'pricing.copy': pricingCopySchema,
  'footer': footerSchema,
  'legal.terms': legalPageSchema,
  'legal.privacy': legalPageSchema,
  'legal.refunds': legalPageSchema,
  'legal.dpa': legalPageSchema,
  'legal.subprocessors': legalPageSchema,
  'legal.bot': legalPageSchema,
  'legal.accessibility': legalPageSchema,
};

export function validatePageContent(pageKey: string, data: unknown) {
  const schema = PAGE_SCHEMAS[pageKey];
  if (!schema) {
    if (pageKey.startsWith('legal.')) return legalPageSchema.safeParse(data);
    return { success: true, data } as const;
  }
  return schema.safeParse(data);
}

/**
 * The 301 to create when a post's slug changes after it has gone live (staff spec 3.2), so old
 * links keep working. Blog posts live at /blog/<slug>, guides at /fix/<platform>/<slug>
 * (`/fix/custom-code/<slug>` for Custom code guides).
 */
export function slugChangeRedirect(
  current: { type: string; platform?: string | null; slug: string; status: string },
  next: { slug?: string; status?: string },
): { from: string; to: string } | null {
  if (!next.slug || next.slug === current.slug) return null;
  if (current.status !== 'published' && next.status !== 'published') return null;
  const prefix = current.type === 'guide' ? `/fix/${guideUrlSegment(current.platform)}` : '/blog';
  return { from: `${prefix}/${current.slug}`, to: `${prefix}/${next.slug}` };
}
