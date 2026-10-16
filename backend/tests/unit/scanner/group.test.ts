import { describe, expect, it } from 'vitest';
import { buildTemplateContext, templateKey } from '../../../src/scanner/templates/group.js';

const S = 'https://shop.example';

describe('templateKey: Shopify', () => {
  it.each([
    ['/', 'home'],
    ['/products/blue-tee', 'product'],
    ['/collections/summer', 'collection'],
    ['/collections/summer/products/blue-tee', 'product'],
    ['/collections/all', 'collection'],
    ['/pages/contact', 'page:contact'],
    ['/pages/faq', 'page:faq'],
    ['/pages/our-story-2019', 'page'],
    ['/blogs/news', 'blog-index'],
    ['/blogs/news/', 'blog-index'],
    ['/blogs/news/launch-day', 'article'],
    ['/cart', 'cart'],
    ['/search', 'search'],
    ['/account', 'account'],
    ['/account/login', 'account'],
    ['/policies/refund-policy', 'policies/*'],
  ])('%s → %s', (path, expected) => {
    expect(templateKey(`${S}${path}`, 'shopify')).toBe(expected);
  });

  it('groups 400 product URLs into one template', () => {
    const keys = new Set(
      Array.from({ length: 400 }, (_, i) => templateKey(`${S}/products/item-${i}`, 'shopify')),
    );
    expect([...keys]).toEqual(['product']);
  });
});

describe('templateKey: WordPress / WooCommerce', () => {
  const ctx = buildTemplateContext('wordpress', [
    'https://wp.example/about',
    'https://wp.example/services',
    'https://wp.example/category/news',
  ]);

  it.each([
    ['/', 'home'],
    ['/product/red-mug', 'product'],
    ['/product-category/mugs', 'product-category'],
    ['/category/news', 'category'],
    ['/category/news/local', 'category'],
    ['/tag/tips', 'tag'],
    ['/author/sam', 'author'],
    ['/2026/03/hello-world', 'post'],
    ['/2026/3/hello-world', 'post'],
    ['/about', 'page:about'],
    ['/services', 'page:services'],
    ['/privacy-policy', 'page'],
    ['/services/web-design', 'services/*'],
    ['/plugins/akismet', 'plugins/*'],
    ['/page/2', 'archive-page'],
  ])('%s → %s', (path, expected) => {
    expect(templateKey(`https://wp.example${path}`, 'wordpress', ctx)).toBe(expected);
  });

  it('uses the same rules for WooCommerce', () => {
    expect(templateKey('https://wp.example/product/x', 'woocommerce')).toBe('product');
  });

  it('only names nav pages that are top-level and not taxonomy prefixes', () => {
    expect([...ctx.wordpressNavSlugs]).toEqual(['about', 'services']);
  });

  it('caps named WordPress pages at 10', () => {
    const nav = Array.from({ length: 15 }, (_, i) => `https://wp.example/page-${i}`);
    expect(buildTemplateContext('wordpress', nav).wordpressNavSlugs.size).toBe(10);
  });
});

describe('templateKey: other platforms', () => {
  it.each([
    ['/', 'home'],
    ['/about', 'about'],
    ['/blog/my-long-post-title', 'blog/*'],
    ['/blog/2026', 'blog/*'],
    ['/docs/api/authentication', 'docs/api/*'],
    ['/docs/api/auth/tokens', 'docs/api/*'],
    ['/orders/12345/items', 'orders/*/*'],
    ['/u/0b9e7a3c-1d2f-4c5a-9e8b-7a6c5d4e3f21', 'u/*'],
    ['/a/this-segment-is-definitely-longer-than-thirty-chars/x', 'a/*/*'],
    ['/About', 'about'],
  ])('%s → %s', (path, expected) => {
    expect(templateKey(`https://site.example${path}`, 'custom')).toBe(expected);
  });

  it('ignores the query string', () => {
    expect(templateKey('https://site.example/blog/post?page=2', 'custom')).toBe('blog/*');
  });
});
