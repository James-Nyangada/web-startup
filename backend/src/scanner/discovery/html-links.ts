import { Parser } from 'htmlparser2';
import { normalizeUrl } from '../url/normalize.js';

export interface PageLinks {
  links: string[];
  /** Links inside <nav> or <header>; WordPress uses these to name `page:<slug>` templates. */
  navLinks: string[];
  title: string | undefined;
}

/**
 * Extracts normalised `<a href>` targets from server-rendered HTML. Honours
 * `<base href>`, skips `rel="nofollow"` and links inside <template>.
 */
export function extractLinks(html: string, pageUrl: string): PageLinks {
  const links = new Set<string>();
  const navLinks = new Set<string>();
  let base = pageUrl;
  let navDepth = 0;
  let templateDepth = 0;
  let inTitle = false;
  let title = '';

  const parser = new Parser(
    {
      onopentag(name, attrs) {
        if (name === 'base' && attrs.href) {
          // Not normalised: the trailing slash of a base URL changes how relative links resolve.
          try {
            base = new URL(attrs.href, pageUrl).href;
          } catch {
            // keep the page URL
          }
        }
        if (name === 'nav' || name === 'header') navDepth++;
        if (name === 'template') templateDepth++;
        if (name === 'title') inTitle = true;
        if (name !== 'a' || !attrs.href || templateDepth > 0) return;
        if (/\bnofollow\b/i.test(attrs.rel ?? '')) return;
        const url = normalizeUrl(attrs.href, base);
        if (!url) return;
        links.add(url);
        if (navDepth > 0) navLinks.add(url);
      },
      ontext(text) {
        if (inTitle) title += text;
      },
      onclosetag(name) {
        if (name === 'nav' || name === 'header') navDepth = Math.max(0, navDepth - 1);
        if (name === 'template') templateDepth = Math.max(0, templateDepth - 1);
        if (name === 'title') inTitle = false;
      },
    },
    { decodeEntities: true },
  );
  parser.write(html);
  parser.end();

  return { links: [...links], navLinks: [...navLinks], title: title.trim() || undefined };
}
