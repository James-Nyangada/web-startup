import { describe, expect, it } from 'vitest';
import {
  createExcludedPathMatcher,
  hasNonHtmlExtension,
  shouldSkipUrl,
} from '../../../src/scanner/url/skip-patterns.js';

describe('non-HTML extensions', () => {
  it.each([
    '/a.pdf',
    '/img/photo.JPG',
    '/x.svg',
    '/f.zip',
    '/feed.xml',
    '/app.js',
    '/s.css',
    '/v.mp4',
    '/agents.md',
    '/doc.docx',
  ])('skips %s', (path) => expect(hasNonHtmlExtension(path)).toBe(true));

  it.each([
    '/',
    '/about',
    '/blog/post',
    '/page.html',
    '/index.php',
    '/a.aspx',
    '/v1.2/release',
    '/.well-known',
  ])('keeps %s', (path) => expect(hasNonHtmlExtension(path)).toBe(false));
});

describe('skip patterns', () => {
  it.each([
    'https://e.com/logout',
    'https://e.com/account/logout',
    'https://e.com/sign-out',
    'https://e.com/cart/add?id=1',
    'https://e.com/cart/change',
    'https://e.com/shop?add-to-cart=12',
    'https://e.com/checkouts/abc123/information',
    'https://e.com/wp-admin/',
    'https://e.com/wp-login.php',
    'https://e.com/wp-json/wp/v2/posts',
    'https://e.com/feed',
    'https://e.com/blog/feed/',
    'https://e.com/post?replytocom=5',
    'https://e.com/logout?next=/',
  ])('skips %s', (url) => expect(shouldSkipUrl(url)).toBe(true));

  it.each([
    'https://e.com/',
    'https://e.com/cart',
    'https://e.com/checkout',
    'https://e.com/account',
    'https://e.com/account/login',
    'https://e.com/products/feed-bag',
    'https://e.com/blog/administrative-tips',
  ])('keeps %s', (url) => expect(shouldSkipUrl(url)).toBe(false));
});

describe('excluded paths', () => {
  const matcher = createExcludedPathMatcher(['/blog/**', 'tag/*', '/legal']);

  it('matches globs, with or without a leading slash', () => {
    expect(matcher('/blog/2026/post')).toBe(true);
    expect(matcher('/tag/news')).toBe(true);
    expect(matcher('/legal')).toBe(true);
    expect(matcher('/BLOG/x')).toBe(true);
  });

  it('treats /blog/** as the blog index and everything under it', () => {
    expect(matcher('/blog')).toBe(true);
    expect(matcher('/blogroll')).toBe(false);
  });

  it('does not over-match', () => {
    expect(matcher('/tag/a/b')).toBe(false);
    expect(matcher('/legal/terms')).toBe(false);
    expect(matcher('/about')).toBe(false);
  });

  it('applies through shouldSkipUrl', () => {
    expect(shouldSkipUrl('https://e.com/blog/x', matcher)).toBe(true);
    expect(shouldSkipUrl('https://e.com/shop', matcher)).toBe(false);
  });

  it('matches nothing when empty', () => {
    expect(createExcludedPathMatcher([])('/anything')).toBe(false);
  });
});
