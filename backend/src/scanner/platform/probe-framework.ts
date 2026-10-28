import { createGuardedFetch } from '../net/guarded-fetch.js';
import {
  detectFramework,
  detectFrameworkFromScript,
  firstPartyScripts,
  type FrameworkResult,
} from './framework.js';

const guardedFetch = createGuardedFetch({
  userAgent: 'Mozilla/5.0 (compatible; EveryVisitorBot/1.0; +https://everyvisitor.app/bot)',
  timeoutMs: 8000,
  maxBytes: 1024 * 1024,
});

/** Platforms whose markup the user writes themselves, so the framework matters. */
export const isCustomPlatform = (platform: string | null | undefined) =>
  platform === 'custom' || platform === 'unknown';

const MAX_BUNDLES = 3;

/**
 * Low-confidence results (an empty #root shell, or no markers at all) get a second
 * look: the page's first-party JS bundles are fetched and searched for the runtime.
 */
export async function refineFramework(
  result: FrameworkResult,
  html: string,
  pageUrl: string,
): Promise<FrameworkResult> {
  if (result.confidence !== 'low') return result;
  for (const src of firstPartyScripts(html, pageUrl).slice(0, MAX_BUNDLES)) {
    try {
      const script = await guardedFetch(src, { accept: 'application/javascript,*/*' });
      if (script.status !== 200) continue;
      const found = detectFrameworkFromScript(script.text());
      if (found) return found;
    } catch {
      // a blocked or failing bundle just means we keep the HTML-based answer
    }
  }
  return result;
}

/** Fetches the home page and detects its framework; `null` when it cannot be read. */
export async function probeFramework(rootUrl: string): Promise<FrameworkResult | null> {
  try {
    const response = await guardedFetch(rootUrl);
    if (response.status !== 200) return null;
    const html = response.text();
    const result = detectFramework({ html, headers: response.headers });
    return await refineFramework(result, html, response.url);
  } catch {
    return null;
  }
}
