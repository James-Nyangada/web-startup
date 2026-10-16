import { describe, expect, it } from 'vitest';
import {
  samplePages,
  type Candidate,
  type SampleInput,
} from '../../../src/scanner/sampling/sample.js';
import { templateKey } from '../../../src/scanner/templates/group.js';

const S = 'https://shop.example';
const templateOf = (url: string) => templateKey(url, 'shopify');

function shop(): Candidate[] {
  const urls = [
    `${S}/`,
    `${S}/cart`,
    `${S}/search`,
    `${S}/pages/contact`,
    `${S}/account/login`,
    ...Array.from({ length: 400 }, (_, i) => `${S}/products/p${String(i).padStart(3, '0')}`),
    ...Array.from({ length: 30 }, (_, i) => `${S}/collections/c${String(i).padStart(2, '0')}`),
    ...Array.from({ length: 12 }, (_, i) => `${S}/blogs/news/post-${String(i).padStart(2, '0')}`),
  ];
  return urls.map((url, i) => ({
    url,
    templateKey: templateOf(url),
    lastmod: url.endsWith('p007')
      ? '2026-10-01'
      : `2025-01-${String((i % 28) + 1).padStart(2, '0')}`,
  }));
}

const base = (overrides: Partial<SampleInput> = {}): SampleInput => ({
  homeUrl: `${S}/`,
  pinnedUrls: [],
  candidates: shop(),
  pageLimit: 50,
  seed: 'shop.example',
  templateOf,
  ...overrides,
});

describe('samplePages', () => {
  it('starts with home, then pinned, then key pages', () => {
    const planned = samplePages(
      base({ pinnedUrls: [`${S}/pages/size-guide`, `${S}/products/p399`] }),
    );
    expect(planned[0]).toEqual({ url: `${S}/`, templateKey: 'home', reason: 'home' });
    expect(planned.slice(1, 3).map((p) => p.reason)).toEqual(['pinned', 'pinned']);
    expect(planned[1]!.url).toBe(`${S}/pages/size-guide`);
    const keyPages = planned
      .filter((p) => p.reason === 'key-page')
      .map((p) => new URL(p.url).pathname);
    expect(keyPages).toEqual(['/cart', '/pages/contact', '/search', '/account/login']);
  });

  it('takes first, middle and most recently modified per template', () => {
    const planned = samplePages(base({ pageLimit: 20 }));
    const products = planned
      .filter((p) => p.templateKey === 'product' && p.reason === 'template')
      .map((p) => p.url);
    expect(products).toEqual([`${S}/products/p000`, `${S}/products/p199`, `${S}/products/p007`]);
  });

  it('orders templates by size and fills round-robin', () => {
    const planned = samplePages(base({ pageLimit: 40 }));
    const firstTemplateRows = planned
      .filter((p) => p.reason === 'template')
      .map((p) => p.templateKey);
    expect(firstTemplateRows.slice(0, 3)).toEqual(['product', 'product', 'product']);
    expect(firstTemplateRows.slice(3, 6)).toEqual(['collection', 'collection', 'collection']);
    const fill = planned.filter((p) => p.reason === 'fill').map((p) => p.templateKey);
    expect(fill.slice(0, 3)).toEqual(['product', 'collection', 'article']);
  });

  it('never exceeds the page limit and never repeats a URL', () => {
    for (const pageLimit of [1, 5, 10, 50, 250, 1_000]) {
      const planned = samplePages(base({ pageLimit }));
      expect(planned.length).toBe(Math.min(pageLimit, 447));
      expect(new Set(planned.map((p) => p.url)).size).toBe(planned.length);
    }
  });

  it('always includes home and pinned URLs (within the limit)', () => {
    const pinned = Array.from({ length: 30 }, (_, i) => `${S}/pages/pin-${i}`);
    const planned = samplePages(base({ pinnedUrls: pinned, pageLimit: 100 }));
    expect(planned[0]!.url).toBe(`${S}/`);
    // Spec 6.4: at most 25 pinned URLs are used.
    expect(planned.filter((p) => p.reason === 'pinned')).toHaveLength(25);
  });

  it('is deterministic for the same inputs and seed', () => {
    const previousUrls = samplePages(base({ pageLimit: 60 })).map((p) => p.url);
    const a = samplePages(base({ previousUrls, pageLimit: 60 }));
    const b = samplePages(base({ previousUrls, pageLimit: 60 }));
    expect(a).toEqual(b);
  });

  it('prefers previously scanned pages but rotates one pick in three', () => {
    const first = samplePages(base({ pageLimit: 60 }));
    const previousUrls = first.map((p) => p.url);
    const second = samplePages(base({ previousUrls, pageLimit: 60, seed: 'scan-2' }));

    const products = (list: typeof first) =>
      list.filter((p) => p.templateKey === 'product').map((p) => p.url);
    const before = new Set(products(first));
    const after = products(second);
    const reused = after.filter((url) => before.has(url)).length;
    const rotated = after.length - reused;

    expect(after.length).toBe(products(first).length);
    expect(rotated).toBeGreaterThan(0);
    expect(rotated).toBeLessThanOrEqual(Math.ceil(after.length / 3));
  });

  it('works with only a home page', () => {
    expect(samplePages(base({ candidates: [{ url: `${S}/`, templateKey: 'home' }] }))).toHaveLength(
      1,
    );
  });
});
