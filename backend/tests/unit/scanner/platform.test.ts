import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { createGuardedFetch } from '../../../src/scanner/net/guarded-fetch.js';
import { detectPlatform } from '../../../src/scanner/platform/detect.js';
import type { Platform } from '../../../src/scanner/types.js';

describe('detectPlatform', () => {
  it.each<[string, Platform, string, Record<string, string>]>([
    ['Shopify header', 'shopify', '<html></html>', { 'x-shopid': '123' }],
    ['Shopify.theme', 'shopify', '<script>Shopify.theme = {"name":"Dawn"}</script>', {}],
    ['Shopify CDN', 'shopify', '<link href="//cdn.shopify.com/s/files/1/theme.css">', {}],
    ['WordPress generator', 'wordpress', '<meta name="generator" content="WordPress 6.8.1">', {}],
    [
      'WordPress assets',
      'wordpress',
      '<link href="/wp-content/themes/twentytwentyfive/style.css">',
      {},
    ],
    [
      'WordPress wp-json link header',
      'wordpress',
      '<html></html>',
      { link: '<https://e.com/wp-json/>; rel="https://api.w.org/"' },
    ],
    [
      'WooCommerce generator',
      'woocommerce',
      '<meta name="generator" content="WordPress 6.8"><meta name="generator" content="WooCommerce 9.0">',
      {},
    ],
    [
      'WooCommerce plugin assets',
      'woocommerce',
      '<script src="/wp-content/plugins/woocommerce/assets/js/x.js"></script>',
      {},
    ],
    [
      'WooCommerce body class',
      'woocommerce',
      '<body class="home woocommerce-js"><link href="/wp-content/x.css">',
      {},
    ],
    ['Webflow generator', 'webflow', '<meta content="Webflow" name="generator">', {}],
    ['Webflow attribute', 'webflow', '<html data-wf-page="abc" data-wf-site="def">', {}],
    ['Wix generator', 'wix', '<meta name="generator" content="Wix.com Website Builder">', {}],
    ['Wix static', 'wix', '<img src="https://static.wixstatic.com/media/a.jpg">', {}],
    ['Squarespace context', 'squarespace', '<script>Static.SQUARESPACE_CONTEXT = {};</script>', {}],
    ['Squarespace CDN', 'squarespace', '<img src="https://images.squarespace-cdn.com/x.jpg">', {}],
    ['plain HTML', 'custom', '<html><body><h1>Hello</h1></body></html>', {}],
    ['empty', 'unknown', '', {}],
  ])('%s → %s', (_label, expected, html, headers) => {
    expect(detectPlatform({ html, headers }).platform).toBe(expected);
  });

  it('does not call a blog post about WooCommerce a WooCommerce store', () => {
    const html =
      '<link href="/wp-content/themes/t/style.css"><article>How to set up WooCommerce in 2026</article>';
    expect(detectPlatform({ html, headers: {} }).platform).toBe('wordpress');
  });

  it('accepts a Headers object', () => {
    expect(detectPlatform({ html: '', headers: new Headers({ 'X-ShopId': '1' }) }).platform).toBe(
      'shopify',
    );
  });
});

// P1-05 acceptance: 20 real reference sites. Network-dependent, so opt-in.
const reference = JSON.parse(
  readFileSync(new URL('../../fixtures/platforms.json', import.meta.url), 'utf8'),
) as { sites: { url: string; platform: Platform }[] };

describe.skipIf(!process.env.SCANNER_NETWORK_TESTS)(
  'detectPlatform on real reference sites',
  () => {
    const fetch = createGuardedFetch({
      userAgent: 'Mozilla/5.0 PRODUCT_NAMEBot/1.0',
      timeoutMs: 20_000,
    });

    it('lists 20 sites', () => {
      expect(reference.sites).toHaveLength(20);
    });

    it.each(reference.sites)(
      '$url → $platform',
      async ({ url, platform }) => {
        const response = await fetch(url);
        expect(detectPlatform({ html: response.text(), headers: response.headers }).platform).toBe(
          platform,
        );
      },
      30_000,
    );
  },
);
