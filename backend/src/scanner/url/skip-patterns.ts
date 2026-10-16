import picomatch from 'picomatch';

/** File extensions that are never HTML pages. */
const NON_HTML_EXTENSIONS = new Set([
  // documents
  'pdf',
  'doc',
  'docx',
  'xls',
  'xlsx',
  'ppt',
  'pptx',
  'odt',
  'ods',
  'csv',
  'txt',
  'rtf',
  'epub',
  // images
  'jpg',
  'jpeg',
  'png',
  'gif',
  'webp',
  'avif',
  'svg',
  'ico',
  'bmp',
  'tif',
  'tiff',
  'heic',
  // media
  'mp3',
  'mp4',
  'm4a',
  'm4v',
  'mov',
  'avi',
  'webm',
  'ogg',
  'ogv',
  'wav',
  'flac',
  'mkv',
  // archives and binaries
  'zip',
  'gz',
  'tgz',
  'rar',
  '7z',
  'tar',
  'dmg',
  'exe',
  'msi',
  'apk',
  'bin',
  'iso',
  // code and data
  'css',
  'js',
  'mjs',
  'json',
  'xml',
  'md',
  'markdown',
  'yml',
  'yaml',
  'ics',
  'vcf',
  'webmanifest',
  'gpx',
  'kml',
  'rss',
  'atom',
  'map',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'eot',
]);

/**
 * Paths that change state or are pointless to test (spec 6.2 step 4): logout,
 * add-to-cart, checkout steps, admin, feeds and search-result permutations.
 */
export const SKIP_PATTERNS: readonly RegExp[] = [
  /\/(log-?out|sign-?out)(?=[/?]|$)/i,
  /[?&](add-to-cart|add_to_cart|action=logout)=/i,
  /\/cart\/(add|change|update|clear)(?=[/?]|$)/i,
  /\/checkouts?\/[^/]+/i, // checkout steps (the checkout entry page itself is allowed)
  /\/(wp-admin|wp-login\.php|xmlrpc\.php|wp-json)(?=[/?]|$)/i,
  /\/(admin|administrator|user\/logout)(?=[/?]|$)/i,
  /\/feed(?=[/?]|$)/i,
  /\/(cdn-cgi|_next\/static|static\/chunks)\//i,
  /[?&](replytocom|share|print)=/i,
  /\/account\/(logout|addresses\/delete)/i,
];

export function hasNonHtmlExtension(pathname: string): boolean {
  const last = pathname.split('/').pop() ?? '';
  const dot = last.lastIndexOf('.');
  if (dot <= 0) return false;
  return NON_HTML_EXTENSIONS.has(last.slice(dot + 1).toLowerCase());
}

export function matchesSkipPattern(url: string): boolean {
  return SKIP_PATTERNS.some((pattern) => pattern.test(url));
}

/** Compiles the site's `excluded_paths` globs (e.g. `/blog/**`, `/tag/*`) into a matcher. */
export function createExcludedPathMatcher(globs: readonly string[]): (pathname: string) => boolean {
  if (globs.length === 0) return () => false;
  const matchers = globs.map((glob) =>
    picomatch(glob.startsWith('/') ? glob : `/${glob}`, { nocase: true, dot: true }),
  );
  return (pathname) => matchers.some((match) => match(pathname));
}

/** True when a URL should never be planned for scanning. */
export function shouldSkipUrl(
  url: string,
  isExcludedPath: (pathname: string) => boolean = () => false,
): boolean {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return true;
  }
  return (
    hasNonHtmlExtension(parsed.pathname) ||
    matchesSkipPattern(url) ||
    isExcludedPath(parsed.pathname)
  );
}
