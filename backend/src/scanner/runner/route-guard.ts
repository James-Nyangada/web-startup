import type { CDPSession, Page } from 'playwright';
import { assertPublicUrl, BlockedUrlError, type GuardPolicy } from '../net/guard.js';

/**
 * Spec 11.2 step 4: every browser request is checked, including each redirect
 * hop, subresources, iframes and worker requests.
 *
 * Playwright's page.route() does not see redirect hops, and re-fetching through
 * route.fetch() to walk them made pages ~3× slower. Chrome's own interception
 * (CDP Fetch domain) pauses every request *and* every redirect hop before it is
 * sent, so the guard checks each one and the browser follows redirects natively.
 *
 * Requires all frames in one renderer process: launch Chromium with
 * CHROMIUM_GUARD_ARGS (site isolation off), otherwise cross-site iframes would
 * run in a separate process this session does not intercept.
 */
export const CHROMIUM_GUARD_ARGS = [
  '--disable-features=IsolateOrigins,site-per-process',
  '--disable-site-isolation-trials',
];

/** Analytics and ad hosts: irrelevant to accessibility and slow to load (spec 6.5 step 2). */
const BLOCKED_HOST_SUFFIXES = [
  'google-analytics.com',
  'googletagmanager.com',
  'googleadservices.com',
  'doubleclick.net',
  'googlesyndication.com',
  'adservice.google.com',
  'connect.facebook.net',
  'hotjar.com',
  'hotjar.io',
  'clarity.ms',
  'segment.io',
  'segment.com',
  'mixpanel.com',
  'amplitude.com',
  'fullstory.com',
  'bat.bing.com',
  'analytics.tiktok.com',
  'ads-twitter.com',
  'snap.licdn.com',
  'px.ads.linkedin.com',
  'ct.pinterest.com',
  'criteo.com',
  'taboola.com',
  'outbrain.com',
];

/** CDP resource types we never load: audio and video (spec 6.5 step 2). */
const BLOCKED_RESOURCE_TYPES = new Set(['Media']);

export function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase();
  return BLOCKED_HOST_SUFFIXES.some((suffix) => host === suffix || host.endsWith(`.${suffix}`));
}

export interface RouteGuardState {
  /** Set when the main document (or one of its redirect hops) was refused. */
  mainFrameBlocked?: string;
  blockedRequests: number;
}

interface RequestPausedEvent {
  requestId: string;
  request: { url: string };
  frameId: string;
  resourceType: string;
}

/** Installs the guard on a page before its first navigation. */
export async function installRouteGuard(page: Page, policy: GuardPolicy): Promise<RouteGuardState> {
  const state: RouteGuardState = { blockedRequests: 0 };
  const cdp: CDPSession = await page.context().newCDPSession(page);
  const { frameTree } = (await cdp.send('Page.getFrameTree')) as {
    frameTree: { frame: { id: string } };
  };
  const mainFrameId = frameTree.frame.id;

  // One DNS check per origin per page.
  const checks = new Map<string, Promise<void>>();
  const check = (url: URL) => {
    let pending = checks.get(url.origin);
    if (!pending) {
      pending = assertPublicUrl(url, policy).then(() => undefined);
      checks.set(url.origin, pending);
    }
    return pending;
  };

  const block = async (event: RequestPausedEvent, reason: string) => {
    state.blockedRequests++;
    if (event.resourceType === 'Document' && event.frameId === mainFrameId)
      state.mainFrameBlocked = reason;
    await cdp
      .send('Fetch.failRequest', { requestId: event.requestId, errorReason: 'BlockedByClient' })
      .catch(() => undefined);
  };

  cdp.on('Fetch.requestPaused', (event: RequestPausedEvent) => {
    void (async () => {
      let url: URL;
      try {
        url = new URL(event.request.url);
      } catch {
        return block(event, 'invalid URL');
      }
      if (url.protocol === 'data:' || url.protocol === 'blob:') {
        await cdp
          .send('Fetch.continueRequest', { requestId: event.requestId })
          .catch(() => undefined);
        return;
      }
      if (BLOCKED_RESOURCE_TYPES.has(event.resourceType) || isBlockedHost(url.hostname)) {
        return block(event, 'blocked resource');
      }
      try {
        await check(url);
      } catch (error) {
        return block(event, error instanceof BlockedUrlError ? error.reason : 'blocked');
      }
      await cdp
        .send('Fetch.continueRequest', { requestId: event.requestId })
        .catch(() => undefined);
    })();
  });

  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', requestStage: 'Request' }] });
  return state;
}
