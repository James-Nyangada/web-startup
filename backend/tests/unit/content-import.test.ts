import { describe, expect, it } from 'vitest';
import { composeGuideBody, parseGuideSections } from '../../src/lib/guide-markdown.js';
import { blogPostToMarkdown, parseBlogDate, type StaticBlogPost } from '../../src/lib/content-import.js';
import { loadAllFixGuides } from '../../src/fix-guides/loader.js';

describe('guide sections', () => {
  it('splits every shipped guide into the five template sections and rebuilds the same content', () => {
    const guides = loadAllFixGuides();
    expect(guides.length).toBeGreaterThan(0);
    for (const g of guides) {
      const s = parseGuideSections(g.bodyMd);
      expect(s.whatsWrong, g.slug).not.toBe('');
      expect(s.whoItAffects, g.slug).not.toBe('');
      expect(s.howToFix, g.slug).not.toBe('');
      expect(s.howToCheck, g.slug).not.toBe('');
      const rebuilt = composeGuideBody(g.title, g.platform, s);
      const again = parseGuideSections(rebuilt);
      expect(again, g.slug).toEqual(s);
      for (const req of ["## What's wrong", '## Who it affects', '## How to fix on', '## Code example', '## How to check your fix']) {
        expect(rebuilt, g.slug).toContain(req);
      }
    }
  });
});

describe('blog import', () => {
  const post: StaticBlogPost = {
    slug: 's', title: 'T', summary: 'S', date: 'October 14, 2026', readingTime: '6 min read',
    author: { name: 'A', role: 'R', avatar: 'A' }, tags: [],
    content: [
      { sectionTitle: 'One', paragraphs: ['p1', 'p2'] },
      { sectionTitle: 'Two', paragraphs: ['p3'], codeBlock: { language: 'html', code: '<a></a>', caption: 'Example' } },
    ],
  };

  it('turns sections into headings, paragraphs and fenced code', () => {
    expect(blogPostToMarkdown(post)).toBe('## One\n\np1\n\np2\n\n## Two\n\np3\n\n*Example*\n\n```html\n<a></a>\n```');
  });

  it('keeps the original publishing day', () => {
    expect(parseBlogDate('October 14, 2026').toISOString()).toBe('2026-10-14T09:00:00.000Z');
    expect(() => parseBlogDate('someday')).toThrow();
  });
});

import { slugChangeRedirect } from '../../src/shared/content-schemas.js';

describe('slug change redirects', () => {
  it('redirects the old address of a live blog post or guide', () => {
    expect(slugChangeRedirect({ type: 'blog', slug: 'old', status: 'published' }, { slug: 'new' })).toEqual({ from: '/blog/old', to: '/blog/new' });
    expect(slugChangeRedirect({ type: 'guide', platform: 'shopify', slug: 'shopify-a', status: 'published' }, { slug: 'shopify-b' })).toEqual({
      from: '/fix/shopify/shopify-a',
      to: '/fix/shopify/shopify-b',
    });
  });

  it('does nothing for drafts, unchanged slugs, or when the post is going live with the change', () => {
    expect(slugChangeRedirect({ type: 'blog', slug: 'a', status: 'draft' }, { slug: 'b' })).toBeNull();
    expect(slugChangeRedirect({ type: 'blog', slug: 'a', status: 'published' }, { slug: 'a' })).toBeNull();
    expect(slugChangeRedirect({ type: 'blog', slug: 'a', status: 'published' }, {})).toBeNull();
    expect(slugChangeRedirect({ type: 'blog', slug: 'a', status: 'draft' }, { slug: 'b', status: 'published' })).not.toBeNull();
  });
});
