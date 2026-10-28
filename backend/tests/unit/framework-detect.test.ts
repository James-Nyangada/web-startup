import { describe, expect, it } from 'vitest';
import {
  detectFramework,
  detectFrameworkFromScript,
  firstPartyScripts,
} from '../../src/scanner/platform/framework.js';
import {
  aiCacheScope,
  buildAiPrompt,
  resolveStackProfile,
} from '../../src/ai/scrubber.js';

const detect = (html: string, headers: Record<string, string> = {}) =>
  detectFramework({ html, headers });

describe('detectFramework', () => {
  it('detects Next.js from pages-router and app-router markers', () => {
    expect(detect('<script id="__NEXT_DATA__" type="application/json"></script>').framework).toBe(
      'nextjs',
    );
    expect(detect('<script>self.__next_f.push([1,"x"])</script>').framework).toBe('nextjs');
    expect(detect('<html></html>', { 'x-powered-by': 'Next.js' }).framework).toBe('nextjs');
  });

  it('prefers the meta-framework over the library underneath', () => {
    const html = '<div id="__nuxt" data-server-rendered="true"></div><script src="/_nuxt/a.js">';
    expect(detect(html).framework).toBe('nuxt');
  });

  it('detects Angular, Vue and React', () => {
    expect(detect('<app-root ng-version="17.0.1"></app-root>').framework).toBe('angular');
    expect(detect('<div data-v-7ba5bd90 class="x"></div>').framework).toBe('vue');
    expect(detect('<div data-reactroot=""></div>').framework).toBe('react');
  });

  it('detects server frameworks from cookies and headers', () => {
    expect(detect('<html></html>', { 'set-cookie': 'laravel_session=abc; path=/' }).framework).toBe(
      'laravel',
    );
    expect(detect('<form><input name="csrfmiddlewaretoken"></form>').framework).toBe('django');
    expect(detect('<html></html>', { 'x-aspnet-version': '4.0' }).framework).toBe('aspnet');
    expect(detect('<html></html>', { 'x-powered-by': 'PHP/8.2' }).framework).toBe('php');
  });

  it('reads generator meta tags', () => {
    expect(detect('<meta name="generator" content="Astro v4">').framework).toBe('astro');
    expect(detect('<meta name="generator" content="Hugo 0.120">').framework).toBe('hugo');
  });

  it('reports client-rendered shells with low confidence', () => {
    const result = detect('<div id="root"></div><script type="module" src="/assets/index-a1.js">');
    expect(result).toMatchObject({ framework: 'react', confidence: 'low' });
  });

  it('falls back to plain HTML, and to null for an empty page', () => {
    expect(detect('<html><body><h1>Hi</h1></body></html>')).toMatchObject({
      framework: 'html',
      confidence: 'low',
    });
    expect(detect('  ').framework).toBeNull();
  });
});

describe('bundle detection', () => {
  it('identifies the runtime inside a bundle', () => {
    expect(detectFrameworkFromScript('x=Symbol.for("react.element");y')?.framework).toBe('react');
    expect(detectFrameworkFromScript('app.__vue_app__=1')?.framework).toBe('vue');
    expect(detectFrameworkFromScript('import "@angular/core"')?.framework).toBe('angular');
    expect(detectFrameworkFromScript('console.log(1)')).toBeNull();
  });

  it('only follows first-party scripts', () => {
    const html =
      '<script src="/assets/index-a.js"></script><script src="https://cdn.x.com/a.js"></script>';
    expect(firstPartyScripts(html, 'https://site.com/')).toEqual([
      'https://site.com/assets/index-a.js',
    ]);
  });
});

describe('framework-aware AI prompt', () => {
  const base = {
    ruleId: 'image-alt',
    ruleTitle: 'Images must have alt text',
    scrubbedSnippet: '<img src="/a.png">',
  };

  it('asks for source syntax of the detected framework', () => {
    const prompt = buildAiPrompt({ ...base, platform: 'custom', framework: 'nextjs' });
    expect(prompt).toContain('Next.js (React)');
    expect(prompt).toContain('```tsx');
    expect(prompt).toContain('className');
  });

  it('keeps CMS platforms on their own profile', () => {
    expect(resolveStackProfile('shopify', 'react').lang).toBe('liquid');
    expect(resolveStackProfile('custom', 'laravel').lang).toBe('blade');
    expect(resolveStackProfile('generic', null).lang).toBe('html');
  });

  it('puts the explanation before the code in the requested layout', () => {
    const prompt = buildAiPrompt({ ...base, platform: 'custom', framework: 'vue' });
    expect(prompt.indexOf('**Problem:**')).toBeLessThan(prompt.indexOf('**Fix:**'));
  });

  it('scopes the cache by framework only for custom sites', () => {
    expect(aiCacheScope('custom', 'nextjs')).toBe('custom:nextjs');
    expect(aiCacheScope('shopify', 'nextjs')).toBe('shopify');
    expect(aiCacheScope('custom', null)).toBe('custom');
  });
});
