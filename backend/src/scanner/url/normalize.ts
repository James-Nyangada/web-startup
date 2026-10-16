/**
 * URL normalisation (spec 6.1). Everything the scanner stores or compares goes
 * through `normalizeUrl` so that the same page always has the same key.
 */

const TRACKING_PARAMS = new Set(['gclid', 'fbclid', 'ref', 'msclkid', 'dclid', 'mc_cid', 'mc_eid']);

const DEFAULT_PORTS: Record<string, string> = { 'http:': '80', 'https:': '443' };

function isTrackingParam(name: string): boolean {
  const lower = name.toLowerCase();
  return lower.startsWith('utm_') || TRACKING_PARAMS.has(lower);
}

/**
 * Returns the normalised absolute URL, or null when the input is not an
 * http(s) URL. `base` resolves relative links found on a page.
 */
export function normalizeUrl(input: string, base?: string): string | null {
  let url: URL;
  try {
    url = new URL(input.trim(), base);
  } catch {
    return null;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
  if (url.username || url.password) return null;

  // URL already lower-cases scheme and host and drops default ports; be explicit anyway.
  url.hostname = url.hostname.toLowerCase().replace(/\.$/, '');
  if (url.port === DEFAULT_PORTS[url.protocol]) url.port = '';
  url.hash = '';

  const kept = [...url.searchParams.entries()].filter(([name]) => !isTrackingParam(name));
  kept.sort(([a, av], [b, bv]) => (a === b ? av.localeCompare(bv) : a.localeCompare(b)));
  url.search = '';
  for (const [name, value] of kept) url.searchParams.append(name, value);

  // Collapse duplicate slashes, then drop the trailing slash except on the root.
  url.pathname = url.pathname.replace(/\/{2,}/g, '/');
  if (url.pathname.length > 1 && url.pathname.endsWith('/')) {
    url.pathname = url.pathname.replace(/\/+$/, '');
  }

  return url.toString();
}

/** Scheme + host (+ non-default port), no path or trailing slash: the form stored in `sites.root_url`. */
export function rootUrlOf(input: string): string | null {
  const normalized = normalizeUrl(input);
  if (!normalized) return null;
  return new URL(normalized).origin;
}

/** `www.` and the apex are the same site; other subdomains are separate sites. */
export function siteHostKey(hostname: string): string {
  const lower = hostname.toLowerCase().replace(/\.$/, '');
  return lower.startsWith('www.') ? lower.slice(4) : lower;
}

export function isSameSite(url: string, rootUrl: string): boolean {
  try {
    return siteHostKey(new URL(url).hostname) === siteHostKey(new URL(rootUrl).hostname);
  } catch {
    return false;
  }
}
