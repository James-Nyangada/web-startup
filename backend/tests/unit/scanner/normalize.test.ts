import { describe, expect, it } from 'vitest';
import {
  isSameSite,
  normalizeUrl,
  rootUrlOf,
  siteHostKey,
} from '../../../src/scanner/url/normalize.js';

describe('normalizeUrl', () => {
  it.each([
    // scheme and host case, default ports
    ['HTTPS://Example.COM/Path', 'https://example.com/Path'],
    ['http://example.com:80/a', 'http://example.com/a'],
    ['https://example.com:443/a', 'https://example.com/a'],
    ['https://example.com:8443/a', 'https://example.com:8443/a'],
    ['http://example.com:443/a', 'http://example.com:443/a'],
    ['https://example.com./a', 'https://example.com/a'],
    // fragments
    ['https://example.com/a#section', 'https://example.com/a'],
    ['https://example.com/#', 'https://example.com/'],
    ['https://example.com/a?x=1#y', 'https://example.com/a?x=1'],
    // trailing slashes
    ['https://example.com', 'https://example.com/'],
    ['https://example.com/', 'https://example.com/'],
    ['https://example.com/a/', 'https://example.com/a'],
    ['https://example.com/a/b///', 'https://example.com/a/b'],
    ['https://example.com//a//b', 'https://example.com/a/b'],
    // tracking parameters
    ['https://example.com/?utm_source=x', 'https://example.com/'],
    ['https://example.com/a?utm_source=x&utm_medium=y&utm_campaign=z', 'https://example.com/a'],
    ['https://example.com/a?UTM_Source=x', 'https://example.com/a'],
    ['https://example.com/a?gclid=abc', 'https://example.com/a'],
    ['https://example.com/a?fbclid=abc', 'https://example.com/a'],
    ['https://example.com/a?ref=nav', 'https://example.com/a'],
    ['https://example.com/a?msclkid=1', 'https://example.com/a'],
    ['https://example.com/a?page=2&utm_term=x', 'https://example.com/a?page=2'],
    // Shopify variant is kept
    [
      'https://shop.example/products/tee?variant=123',
      'https://shop.example/products/tee?variant=123',
    ],
    [
      'https://shop.example/products/tee?variant=1&utm_source=x',
      'https://shop.example/products/tee?variant=1',
    ],
    // query sorting
    ['https://example.com/s?b=2&a=1', 'https://example.com/s?a=1&b=2'],
    ['https://example.com/s?a=2&a=1', 'https://example.com/s?a=1&a=2'],
    ['https://example.com/s?z=1&m=2&a=3', 'https://example.com/s?a=3&m=2&z=1'],
    ['https://example.com/s?', 'https://example.com/s'],
    // path case is significant
    ['https://example.com/About', 'https://example.com/About'],
    // encoding is canonical
    ['https://example.com/a b', 'https://example.com/a%20b'],
    ['https://example.com/caf%C3%A9', 'https://example.com/caf%C3%A9'],
    ['https://例え.jp/', 'https://xn--r8jz45g.jp/'],
    // whitespace
    ['  https://example.com/a  ', 'https://example.com/a'],
    // IP hosts
    ['http://93.184.216.34/', 'http://93.184.216.34/'],
  ])('%s → %s', (input, expected) => {
    expect(normalizeUrl(input)).toBe(expected);
  });

  it.each([
    'mailto:someone@example.com',
    'tel:+15551234',
    'javascript:alert(1)',
    'ftp://example.com/file',
    'data:text/html,hi',
    'file:///etc/passwd',
    'not a url',
    '',
    'https://user:pass@example.com/',
  ])('rejects %s', (input) => {
    expect(normalizeUrl(input)).toBeNull();
  });

  it.each([
    ['/about', 'https://example.com/shop/', 'https://example.com/about'],
    ['about', 'https://example.com/shop/', 'https://example.com/shop/about'],
    ['../x', 'https://example.com/a/b/', 'https://example.com/a/x'],
    ['//cdn.example.com/x', 'https://example.com/', 'https://cdn.example.com/x'],
    ['?page=2', 'https://example.com/blog', 'https://example.com/blog?page=2'],
    ['#top', 'https://example.com/a', 'https://example.com/a'],
  ])('resolves %s against %s', (input, base, expected) => {
    expect(normalizeUrl(input, base)).toBe(expected);
  });

  it('is idempotent', () => {
    const once = normalizeUrl('HTTPS://Example.com:443/a/?b=2&a=1&utm_x=1#f')!;
    expect(normalizeUrl(once)).toBe(once);
  });
});

describe('rootUrlOf', () => {
  it('keeps scheme + host only (spec P2-06 example)', () => {
    expect(rootUrlOf('https://www.example.com/shop?x=1')).toBe('https://www.example.com');
    expect(rootUrlOf('HTTP://Example.com:8080/a/')).toBe('http://example.com:8080');
    expect(rootUrlOf('mailto:x@y.z')).toBeNull();
  });
});

describe('site identity', () => {
  it('treats www and apex as the same site', () => {
    expect(siteHostKey('www.example.com')).toBe('example.com');
    expect(isSameSite('https://www.example.com/a', 'https://example.com')).toBe(true);
    expect(isSameSite('http://example.com/a', 'https://www.example.com')).toBe(true);
  });

  it('treats other subdomains and hosts as different sites', () => {
    expect(isSameSite('https://shop.example.com/', 'https://example.com')).toBe(false);
    expect(isSameSite('https://example.org/', 'https://example.com')).toBe(false);
    expect(isSameSite('https://wwwexample.com/', 'https://example.com')).toBe(false);
    expect(isSameSite('not a url', 'https://example.com')).toBe(false);
  });
});
