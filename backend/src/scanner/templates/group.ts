import type { Platform } from '../types.js';

export interface TemplateContext {
  /** Shopify `/pages/<handle>` that get their own template (spec 6.3). */
  shopifyPageHandles: ReadonlySet<string>;
  /** WordPress top-level slugs linked from the main navigation. */
  wordpressNavSlugs: ReadonlySet<string>;
}

const MAX_NAMED_PAGES = 10;

/**
 * Spec 6.3 "the 10 most common handles": Shopify pages that themes commonly give
 * their own layout. Everything else under /pages is grouped as `page`.
 */
export const COMMON_SHOPIFY_PAGE_HANDLES: ReadonlySet<string> = new Set([
  'about-us',
  'contact',
  'contact-us',
  'faq',
  'shipping',
  'returns',
  'size-guide',
  'store-locator',
  'accessibility',
  'wholesale',
]);

export const emptyTemplateContext: TemplateContext = {
  shopifyPageHandles: COMMON_SHOPIFY_PAGE_HANDLES,
  wordpressNavSlugs: new Set(),
};

function segments(url: string): string[] {
  try {
    return new URL(url).pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => decodeURIComponent(segment).toLowerCase());
  } catch {
    return [];
  }
}

const UUID_LIKE = /^[0-9a-f]{8}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{4}-?[0-9a-f]{12}$/i;
const HEX_ID = /^[0-9a-f]{16,}$/i;

/** A path segment that varies per item rather than naming a section. */
function isVariableSegment(segment: string): boolean {
  return (
    /^\d+$/.test(segment) || UUID_LIKE.test(segment) || HEX_ID.test(segment) || segment.length > 30
  );
}

function shopifyTemplate(parts: string[], ctx: TemplateContext): string | null {
  const [first, second, third, fourth] = parts;
  switch (first) {
    case 'products':
      return 'product';
    case 'collections':
      return third === 'products' && fourth ? 'product' : 'collection';
    case 'pages':
      return second && ctx.shopifyPageHandles.has(second) ? `page:${second}` : 'page';
    case 'blogs':
      return third ? 'article' : 'blog-index';
    case 'cart':
    case 'search':
    case 'account':
      return first;
    default:
      return null;
  }
}

const WP_PREFIXES: Record<string, string> = {
  product: 'product',
  'product-category': 'product-category',
  'product-tag': 'product-tag',
  category: 'category',
  tag: 'tag',
  author: 'author',
};

function wordpressTemplate(parts: string[], ctx: TemplateContext): string {
  const [first] = parts as [string, ...string[]];
  const prefixed = WP_PREFIXES[first];
  if (prefixed) return prefixed;
  if (/^\d{4}$/.test(first) && /^\d{1,2}$/.test(parts[1] ?? '')) return 'post';
  if (first === 'page' && /^\d+$/.test(parts[1] ?? '')) return 'archive-page';
  if (parts.length === 1) return ctx.wordpressNavSlugs.has(first) ? `page:${first}` : 'page';
  // Deeper paths are usually custom post types (/plugins/x, /services/y): group them
  // by section rather than lumping every one into `page`.
  return genericTemplate(parts);
}

/**
 * Generic rule (spec 6.3 "Other"): variable segments become `*`. One segment
 * keeps its name (`about`); two become `section/*` (`blog/*`); deeper paths
 * keep two levels (`docs/api/*`).
 */
function genericTemplate(parts: string[]): string {
  const cleaned = parts.map((segment) => (isVariableSegment(segment) ? '*' : segment));
  if (cleaned.length === 1) return cleaned[0]!;
  if (cleaned.length === 2) return `${cleaned[0]}/*`;
  return `${cleaned[0]}/${cleaned[1]}/*`;
}

/** Spec 6.3: the template a URL belongs to. */
export function templateKey(
  url: string,
  platform: Platform,
  ctx: TemplateContext = emptyTemplateContext,
): string {
  const parts = segments(url);
  if (parts.length === 0) return 'home';

  if (platform === 'shopify') return shopifyTemplate(parts, ctx) ?? genericTemplate(parts);
  if (platform === 'wordpress' || platform === 'woocommerce') return wordpressTemplate(parts, ctx);
  return genericTemplate(parts);
}

/**
 * WordPress top-level pages linked from the main navigation get named templates
 * (max 10). Shopify uses the fixed COMMON_SHOPIFY_PAGE_HANDLES list.
 */
export function buildTemplateContext(
  platform: Platform,
  navLinks: readonly string[],
): TemplateContext {
  if (platform === 'wordpress' || platform === 'woocommerce') {
    const slugs = navLinks
      .map(segments)
      .filter((parts) => parts.length === 1 && !(parts[0]! in WP_PREFIXES))
      .map((parts) => parts[0]!);
    return { ...emptyTemplateContext, wordpressNavSlugs: new Set(slugs.slice(0, MAX_NAMED_PAGES)) };
  }
  return emptyTemplateContext;
}
