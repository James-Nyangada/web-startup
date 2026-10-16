import { gzipSync } from 'node:zlib';
import { afterEach, describe, expect, it } from 'vitest';
import { discover } from '../../../src/scanner/discovery/discover.js';
import { extractLinks } from '../../../src/scanner/discovery/html-links.js';
import { parseRobots, robotsToken } from '../../../src/scanner/discovery/robots.js';
import { parseSitemap } from '../../../src/scanner/discovery/sitemap.js';
import { createGuardedFetch } from '../../../src/scanner/net/guarded-fetch.js';
import { HostRateLimiter } from '../../../src/scanner/net/rate-limiter.js';
import { silentLogger } from '../../../src/scanner/types.js';
import {
  fixturePolicy,
  html,
  startFixtureServer,
  type FixtureServer,
  type Route,
} from '../../helpers/fixture-server.js';

const UA = 'PRODUCT_NAMEBot/1.0 (+https://example.com/bot)';

describe('robots.txt', () => {
  const body = [
    'User-agent: *',
    'Disallow: /private',
    'Crawl-delay: 2',
    '',
    'User-agent: PRODUCT_NAMEBot',
    'Disallow: /no-bots',
    'Crawl-delay: 9',
    '',
    'Sitemap: https://e.com/sitemap-a.xml',
    'Sitemap: https://e.com/sitemap-b.xml',
  ].join('\n');

  it('uses the product token for matching', () => {
    expect(robotsToken(UA)).toBe('PRODUCT_NAMEBot');
  });

  it('applies our own group when present', () => {
    const robots = parseRobots('https://e.com/robots.txt', body, UA);
    expect(robots.isAllowed('https://e.com/no-bots/x')).toBe(false);
    expect(robots.isAllowed('https://e.com/private')).toBe(true); // our group replaces *
    expect(robots.crawlDelay).toBe(9);
    expect(robots.sitemaps).toEqual(['https://e.com/sitemap-a.xml', 'https://e.com/sitemap-b.xml']);
  });

  it('falls back to the * group', () => {
    const robots = parseRobots(
      'https://e.com/robots.txt',
      'User-agent: *\nDisallow: /private\n',
      UA,
    );
    expect(robots.isAllowed('https://e.com/private/page')).toBe(false);
    expect(robots.isAllowed('https://e.com/public')).toBe(true);
  });
});

describe('parseSitemap', () => {
  it('reads a urlset with lastmod, CDATA and namespaced children', () => {
    const xml = `<?xml version="1.0"?>
      <urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">
        <url><loc>https://e.com/a</loc><lastmod>2026-01-02</lastmod>
          <image:image><image:loc>https://cdn.e.com/a.jpg</image:loc></image:image></url>
        <url><loc><![CDATA[https://e.com/b?x=1&y=2]]></loc></url>
        <url><loc>  https://e.com/c  </loc></url>
      </urlset>`;
    const parsed = parseSitemap(xml, 100);
    expect(parsed.kind).toBe('urlset');
    expect(parsed.locs).toEqual([
      { url: 'https://e.com/a', lastmod: '2026-01-02' },
      { url: 'https://e.com/b?x=1&y=2' },
      { url: 'https://e.com/c' },
    ]);
  });

  it('reads a sitemap index', () => {
    const xml = `<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
      <sitemap><loc>https://e.com/s1.xml</loc></sitemap><sitemap><loc>https://e.com/s2.xml.gz</loc></sitemap>
    </sitemapindex>`;
    const parsed = parseSitemap(xml, 100);
    expect(parsed.kind).toBe('sitemapindex');
    expect(parsed.locs.map((l) => l.url)).toEqual([
      'https://e.com/s1.xml',
      'https://e.com/s2.xml.gz',
    ]);
  });

  it('keeps URLs read before malformed XML', () => {
    const parsed = parseSitemap(
      '<urlset><url><loc>https://e.com/ok</loc></url><url><loc>broken</url',
      100,
    );
    expect(parsed.locs.map((l) => l.url)).toEqual(['https://e.com/ok']);
    expect(parsed.error).toBeDefined();
  });

  it('respects the entry cap', () => {
    const urls = Array.from(
      { length: 50 },
      (_, i) => `<url><loc>https://e.com/${i}</loc></url>`,
    ).join('');
    expect(parseSitemap(`<urlset>${urls}</urlset>`, 10).locs).toHaveLength(10);
  });

  it('returns unknown for non-sitemap documents', () => {
    expect(parseSitemap('<html><body>hi</body></html>', 10).kind).toBe('unknown');
  });
});

describe('extractLinks', () => {
  it('normalises links, honours <base>, skips nofollow and templates, and collects nav links', () => {
    const page = html(
      `<header><nav><a href="/about/">About</a></nav></header>
       <a href="/blog?utm_source=x#top">Blog</a>
       <a href="https://other.com/">Other</a>
       <a href="mailto:a@b.c">Mail</a>
       <a href="/secret" rel="nofollow">No</a>
       <template><a href="/in-template">T</a></template>
       <a href="relative">Rel</a>`,
      '<base href="https://e.com/dir/">',
    );
    const result = extractLinks(page, 'https://e.com/start');
    expect(result.links).toEqual([
      'https://e.com/about',
      'https://e.com/blog',
      'https://other.com/',
      'https://e.com/dir/relative',
    ]);
    expect(result.navLinks).toEqual(['https://e.com/about']);
    expect(result.title).toBe('Fixture');
  });
});

describe('HostRateLimiter', () => {
  it('spaces request starts per host and caps concurrency', async () => {
    let clock = 0;
    const starts: number[] = [];
    let active = 0;
    let maxActive = 0;
    const limiter = new HostRateLimiter(
      1_000,
      2,
      () => clock,
      (ms) => {
        clock += ms;
        return Promise.resolve();
      },
    );
    const task = async () => {
      starts.push(clock);
      active++;
      maxActive = Math.max(maxActive, active);
      await Promise.resolve();
      active--;
    };
    await Promise.all(Array.from({ length: 5 }, () => limiter.schedule('e.com', task)));
    expect(maxActive).toBeLessThanOrEqual(2);
    for (let i = 1; i < starts.length; i++)
      expect(starts[i]! - starts[i - 1]!).toBeGreaterThanOrEqual(1_000);
  });

  it('applies crawl-delay, capped at 5 seconds and never faster than the default', () => {
    const limiter = new HostRateLimiter(1_000);
    limiter.applyCrawlDelay(30);
    expect(limiter.intervalMs).toBe(5_000);
    const other = new HostRateLimiter(1_000);
    other.applyCrawlDelay(0.2);
    expect(other.intervalMs).toBe(1_000);
  });
});

describe('discover (fixture sites)', () => {
  let server: FixtureServer | undefined;
  afterEach(async () => {
    await server?.close();
    server = undefined;
  });

  const run = async (
    routes: (base: string) => Record<string, Route>,
    extra: Partial<Parameters<typeof discover>[0]> = {},
  ) => {
    // Routes need the base URL, so start the server first, then install them.
    const table: Record<string, Route> = {};
    server = await startFixtureServer(table);
    Object.assign(table, routes(server.url));
    return discover({
      rootUrl: server.url,
      fetch: createGuardedFetch({ userAgent: UA, policy: fixturePolicy(server.port) }),
      userAgent: UA,
      log: silentLogger,
      limiter: new HostRateLimiter(0, 2),
      ...extra,
    });
  };

  it('uses sitemaps from robots.txt, follows indexes, reads .gz and drops disallowed and off-site URLs', async () => {
    const result = await run((base) => ({
      '/robots.txt': {
        headers: { 'content-type': 'text/plain' },
        body: `User-agent: *\nDisallow: /private\nSitemap: ${base}/index.xml\n`,
      },
      '/': html('<p>home</p>'),
      '/index.xml': {
        headers: { 'content-type': 'application/xml' },
        body: `<sitemapindex><sitemap><loc>${base}/pages.xml</loc></sitemap><sitemap><loc>${base}/products.xml.gz</loc></sitemap></sitemapindex>`,
      },
      '/pages.xml': {
        headers: { 'content-type': 'application/xml' },
        body: `<urlset>${['/about', '/private/x', '/contact', '/file.pdf']
          .map((p) => `<url><loc>${base}${p}</loc></url>`)
          .join('')}<url><loc>https://elsewhere.test/x</loc></url></urlset>`,
      },
      '/products.xml.gz': {
        headers: { 'content-type': 'application/octet-stream' },
        body: gzipSync(
          `<urlset>${Array.from({ length: 25 }, (_, i) => `<url><loc>${base}/products/p${i}</loc><lastmod>2026-0${(i % 9) + 1}-01</lastmod></url>`).join('')}</urlset>`,
        ),
      },
    }));

    const paths = result.urls.map((u) => new URL(u.url).pathname);
    expect(result.robots.found).toBe(true);
    expect(result.sitemapsRead).toHaveLength(3);
    expect(result.crawled).toBe(false);
    expect(paths).toContain('/about');
    expect(paths).toContain('/products/p24');
    expect(paths).not.toContain('/private/x');
    expect(paths).not.toContain('/file.pdf');
    expect(result.urls.some((u) => u.url.includes('elsewhere'))).toBe(false);
    expect(result.urls.find((u) => u.url.endsWith('/products/p1'))?.lastmod).toBe('2026-02-01');
  });

  it('falls back to default sitemap locations', async () => {
    const result = await run((base) => ({
      '/': html('home'),
      '/sitemap.xml': {
        headers: { 'content-type': 'application/xml' },
        body: `<urlset>${Array.from({ length: 30 }, (_, i) => `<url><loc>${base}/p/${i}</loc></url>`).join('')}</urlset>`,
      },
    }));
    expect(result.sitemapsRead).toEqual([`${server!.url}/sitemap.xml`]);
    expect(result.urls.length).toBe(31);
  });

  it('crawls when sitemaps give fewer than 20 URLs, staying on host and within depth 3', async () => {
    const result = await run((base) => ({
      '/': html(
        `<nav><a href="/a">A</a></nav><a href="https://elsewhere.test/">ext</a><a href="/logout">out</a>`,
      ),
      '/a': html('<a href="/a/b">B</a><a href="/blocked">X</a>'),
      '/a/b': html('<a href="/a/b/c">C</a>'),
      '/a/b/c': html('<a href="/a/b/c/d">D</a>'),
      '/a/b/c/d': html('<a href="/too-deep">E</a>'),
      '/robots.txt': {
        headers: { 'content-type': 'text/plain' },
        body: 'User-agent: *\nDisallow: /blocked\n',
      },
      [`/unused?${base}`]: '',
    }));
    const paths = result.urls.map((u) => new URL(u.url).pathname).sort();
    expect(result.crawled).toBe(true);
    expect(paths).toEqual(['/', '/a', '/a/b', '/a/b/c', '/a/b/c/d']);
    expect(server!.requests.map((r) => r.path)).not.toContain('/blocked');
    expect(server!.requests.map((r) => r.path)).not.toContain('/logout');
    expect(result.navLinks).toEqual([`${server!.url}/a`]);
  });

  it('applies excluded paths and keeps pinned URLs', async () => {
    const result = await run(
      (base) => ({
        '/': html('home'),
        '/sitemap.xml': {
          headers: { 'content-type': 'application/xml' },
          body: `<urlset>${Array.from({ length: 25 }, (_, i) => `<url><loc>${base}/blog/${i}</loc></url>`).join('')}<url><loc>${base}/shop</loc></url></urlset>`,
        },
      }),
      { excludedPaths: ['/blog/**'], pinnedUrls: [] },
    );
    const paths = result.urls.map((u) => new URL(u.url).pathname);
    expect(paths.some((p) => p.startsWith('/blog'))).toBe(false);
    expect(paths).toContain('/shop');
  });

  it('keys www/apex and http/https variants of a page on the home origin', async () => {
    const result = await run((base) => {
      const port = new URL(base).port;
      return {
        '/': html('home'),
        '/sitemap.xml': {
          headers: { 'content-type': 'application/xml' },
          body: `<urlset>${Array.from({ length: 20 }, (_, i) => `<url><loc>${base}/p/${i}</loc></url>`).join('')}<url><loc>http://www.site.test:${port}/p/1</loc></url></urlset>`,
        },
      };
    });
    expect(result.urls).toHaveLength(21);
    expect(result.urls.every((u) => u.url.startsWith(server!.url))).toBe(true);
  });

  it('detects the platform from the home page', async () => {
    const result = await run(() => ({
      '/': html(
        '<link rel="stylesheet" href="/wp-content/themes/x/style.css">',
        '<meta name="generator" content="WordPress 6.8">',
      ),
    }));
    expect(result.platform.platform).toBe('wordpress');
  });

  it('only scans the home page when robots.txt errors', async () => {
    const result = await run((base) => ({
      '/robots.txt': { status: 503, body: 'down' },
      '/': html(`<a href="${base}/a">a</a>`),
      '/a': html('a'),
    }));
    expect(result.urls.map((u) => new URL(u.url).pathname)).toEqual(['/']);
  });
});
