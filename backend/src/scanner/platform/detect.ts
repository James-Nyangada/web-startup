import type { Platform } from '../types.js';

export interface PlatformSignals {
  html: string;
  headers: Headers | Record<string, string | undefined>;
}

export interface PlatformResult {
  platform: Platform;
  /** Which signals matched, for debugging and the "detected because…" hint in the UI. */
  evidence: string[];
}

function header(headers: PlatformSignals['headers'], name: string): string | undefined {
  if (typeof (headers as Headers).get === 'function')
    return (headers as Headers).get(name) ?? undefined;
  const record = headers as Record<string, string | undefined>;
  return record[name] ?? record[name.toLowerCase()];
}

/** All <meta name="generator"> values joined: WordPress + WooCommerce emit one each. */
const generator = (html: string) =>
  [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .filter((tag) => /name=["']generator["']/i.test(tag))
    .map((tag) => /content=["']([^"']+)["']/i.exec(tag)?.[1] ?? '')
    .join(' ');

/** Pure detection from the home page's HTML and response headers (P1-05). */
export function detectPlatform({ html, headers }: PlatformSignals): PlatformResult {
  const gen = generator(html).toLowerCase();
  const evidence: string[] = [];
  const check = (label: string, matched: boolean) => {
    if (matched) evidence.push(label);
    return matched;
  };

  const shopify =
    check('x-shopid header', !!header(headers, 'x-shopid')) ||
    check('x-shopify-stage header', !!header(headers, 'x-shopify-stage')) ||
    check('Shopify.theme script', /Shopify\.theme\b/.test(html)) ||
    check('cdn.shopify.com assets', /cdn\.shopify\.com/i.test(html));
  if (shopify) return { platform: 'shopify', evidence };

  const wordpress =
    check('generator: WordPress', gen.includes('wordpress')) ||
    check('wp-content assets', /\/wp-content\//i.test(html)) ||
    check(
      'wp-json link',
      /\/wp-json\//i.test(html) || /wp-json/i.test(header(headers, 'link') ?? ''),
    );
  if (wordpress) {
    const woo =
      check('generator: WooCommerce', gen.includes('woocommerce')) ||
      check('woocommerce plugin assets', /\/wp-content\/plugins\/woocommerce\//.test(html)) ||
      // Body classes WooCommerce adds; matching the bare word would catch blog posts about it.
      check(
        'woocommerce body class',
        /class=["'][^"']*\bwoocommerce-(js|no-js|page|active)\b/.test(html),
      );
    return { platform: woo ? 'woocommerce' : 'wordpress', evidence };
  }

  if (
    check('generator: Webflow', gen.includes('webflow')) ||
    check('data-wf-site attribute', /data-wf-(site|page)=/i.test(html))
  ) {
    return { platform: 'webflow', evidence };
  }

  if (
    check('generator: Wix', gen.includes('wix.com')) ||
    check('x-wix-request-id header', !!header(headers, 'x-wix-request-id')) ||
    check(
      'static.wixstatic.com assets',
      /static\.wixstatic\.com|static\.parastorage\.com/i.test(html),
    )
  ) {
    return { platform: 'wix', evidence };
  }

  if (
    check('generator: Squarespace', gen.includes('squarespace')) ||
    check('Static.SQUARESPACE_CONTEXT', /SQUARESPACE_CONTEXT/.test(html)) ||
    check('squarespace-cdn assets', /squarespace-cdn\.com|static1\.squarespace\.com/i.test(html))
  ) {
    return { platform: 'squarespace', evidence };
  }

  return { platform: html.trim() ? 'custom' : 'unknown', evidence };
}

/**
 * Fallback when the home page could not be read (e.g. rate-limited): platforms
 * name their sitemap files distinctively.
 */
export function detectPlatformFromSitemaps(sitemapUrls: readonly string[]): PlatformResult | null {
  const paths = sitemapUrls.map((url) => {
    try {
      return new URL(url).pathname.toLowerCase();
    } catch {
      return '';
    }
  });
  if (paths.some((p) => /\/sitemap_(products|collections|pages|blogs)_\d+\.xml$/.test(p))) {
    return { platform: 'shopify', evidence: ['Shopify sitemap naming'] };
  }
  if (
    paths.some((p) => /\/product-sitemap\d*\.xml$/.test(p)) &&
    paths.some((p) => /(post|page)-sitemap/.test(p))
  ) {
    return { platform: 'woocommerce', evidence: ['WooCommerce sitemap naming'] };
  }
  if (paths.some((p) => /\/wp-sitemap|\/(post|page)-sitemap\d*\.xml$/.test(p))) {
    return { platform: 'wordpress', evidence: ['WordPress sitemap naming'] };
  }
  return null;
}
