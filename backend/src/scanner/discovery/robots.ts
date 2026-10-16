import robotsParserModule from 'robots-parser';

// robots-parser is CommonJS with ESM-style typings: at runtime the default import
// is the function itself, but TypeScript (NodeNext) types it as the module.
const robotsParser = robotsParserModule as unknown as typeof robotsParserModule.default;
import type { GuardedFetch } from '../net/guarded-fetch.js';
import type { ScanLogger } from '../types.js';

export interface RobotsRules {
  found: boolean;
  isAllowed(url: string): boolean;
  /** Seconds, uncapped as published; the rate limiter applies the 5 s cap. */
  crawlDelay: number | undefined;
  sitemaps: string[];
}

/** The product token robots.txt groups are matched against, e.g. "PRODUCT_NAMEBot". */
export function robotsToken(userAgent: string): string {
  return userAgent.split('/')[0]?.trim() || userAgent;
}

export function parseRobots(robotsUrl: string, body: string, userAgent: string): RobotsRules {
  const robots = robotsParser(robotsUrl, body);
  const token = robotsToken(userAgent);
  return {
    found: true,
    // robots-parser falls back to the `*` group when our token has no group.
    isAllowed: (url) => robots.isAllowed(url, token) !== false,
    crawlDelay: robots.getCrawlDelay(token),
    sitemaps: robots.getSitemaps(),
  };
}

const allowAll: RobotsRules = {
  found: false,
  isAllowed: () => true,
  crawlDelay: undefined,
  sitemaps: [],
};

/**
 * Missing robots.txt (4xx) means everything is allowed. A server error means we
 * cannot know, so we are conservative and allow only the home page.
 */
export async function fetchRobots(
  rootUrl: string,
  fetch: GuardedFetch,
  userAgent: string,
  log: ScanLogger,
): Promise<RobotsRules> {
  const robotsUrl = new URL('/robots.txt', rootUrl).href;
  try {
    const response = await fetch(robotsUrl, { accept: 'text/plain,*/*;q=0.5' });
    if (response.status >= 200 && response.status < 300) {
      return parseRobots(response.url, response.text(), userAgent);
    }
    if (response.status >= 500) {
      log.warn('robots.txt returned a server error; scanning the home page only', {
        status: response.status,
      });
      const home = new URL('/', rootUrl).href;
      return {
        found: false,
        isAllowed: (url) => url === home,
        crawlDelay: undefined,
        sitemaps: [],
      };
    }
    return allowAll;
  } catch (error) {
    log.warn('robots.txt could not be fetched; treating as allow-all', { error: String(error) });
    return allowAll;
  }
}
