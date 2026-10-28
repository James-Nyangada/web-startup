import type { PlatformSignals } from './detect.js';

/**
 * What a "custom" site is built with. Kept separate from `Platform` (which is a
 * closed, DB-constrained set) so new frameworks never need a platform migration.
 */
export const FRAMEWORKS = [
  'nextjs',
  'nuxt',
  'gatsby',
  'remix',
  'astro',
  'sveltekit',
  'angular',
  'react',
  'vue',
  'svelte',
  'laravel',
  'symfony',
  'django',
  'rails',
  'aspnet',
  'php',
  'drupal',
  'joomla',
  'magento',
  'ghost',
  'hugo',
  'jekyll',
  'html',
] as const;

export type Framework = (typeof FRAMEWORKS)[number];

export interface FrameworkResult {
  /** `null` when the page gave us nothing to go on (e.g. it could not be fetched). */
  framework: Framework | null;
  /** `high` = a framework-specific marker; `medium` = an indirect or shared marker. */
  confidence: 'high' | 'medium' | 'low';
  evidence: string[];
}

function header(headers: PlatformSignals['headers'], name: string): string {
  if (typeof (headers as Headers).get === 'function') {
    return (headers as Headers).get(name) ?? '';
  }
  const record = headers as Record<string, string | undefined>;
  return record[name] ?? record[name.toLowerCase()] ?? '';
}

const generatorOf = (html: string) =>
  [...html.matchAll(/<meta\b[^>]*>/gi)]
    .map(([tag]) => tag)
    .filter((tag) => /name=["']generator["']/i.test(tag))
    .map((tag) => /content=["']([^"']+)["']/i.exec(tag)?.[1] ?? '')
    .join(' ')
    .toLowerCase();

interface Rule {
  framework: Framework;
  confidence: FrameworkResult['confidence'];
  /** Label → test. The first rule with any matching test wins. */
  tests: Record<string, (s: Signals) => boolean>;
}

interface Signals {
  html: string;
  gen: string;
  powered: string;
  cookies: string;
  header: (name: string) => string;
}

/**
 * Ordered most-specific first: meta-frameworks before the library they sit on
 * (Next.js before React, Nuxt before Vue), and frameworks before the bare language.
 */
const RULES: Rule[] = [
  {
    framework: 'nextjs',
    confidence: 'high',
    tests: {
      '__NEXT_DATA__ script': (s) => /id=["']__NEXT_DATA__["']/.test(s.html),
      '/_next/static assets': (s) => /\/_next\/(static|image)\//.test(s.html),
      'self.__next_f flight data': (s) => /self\.__next_f\b/.test(s.html),
      'x-powered-by: Next.js': (s) => s.powered.includes('next.js'),
    },
  },
  {
    framework: 'nuxt',
    confidence: 'high',
    tests: {
      '__NUXT__ state': (s) => /window\.__NUXT__|id=["']__NUXT_DATA__["']/.test(s.html),
      '/_nuxt/ assets': (s) => /\/_nuxt\//.test(s.html),
      'id="__nuxt" root': (s) => /id=["']__nuxt["']/.test(s.html),
    },
  },
  {
    framework: 'gatsby',
    confidence: 'high',
    tests: {
      'generator: Gatsby': (s) => s.gen.includes('gatsby'),
      'id="___gatsby" root': (s) => /id=["']___gatsby["']/.test(s.html),
    },
  },
  {
    framework: 'remix',
    confidence: 'high',
    tests: {
      '__remixContext': (s) => /__remixContext|__remixManifest/.test(s.html),
    },
  },
  {
    framework: 'astro',
    confidence: 'high',
    tests: {
      'generator: Astro': (s) => s.gen.includes('astro'),
      'astro-island element': (s) => /<astro-island\b/.test(s.html),
      '/_astro/ assets': (s) => /\/_astro\//.test(s.html),
      'data-astro-cid attribute': (s) => /\bdata-astro-cid-/.test(s.html),
    },
  },
  {
    framework: 'sveltekit',
    confidence: 'high',
    tests: {
      '/_app/immutable assets': (s) => /\/_app\/immutable\//.test(s.html),
      'data-sveltekit attribute': (s) => /data-sveltekit-/.test(s.html),
      '__sveltekit global': (s) => /__sveltekit_/.test(s.html),
    },
  },
  {
    framework: 'angular',
    confidence: 'high',
    tests: {
      'ng-version attribute': (s) => /\bng-version=["']/.test(s.html),
      'ng-server-context attribute': (s) => /\bng-server-context=/.test(s.html),
      '<app-root> with Angular bundles': (s) =>
        /<app-root\b/.test(s.html) && /\b(runtime|polyfills|main)(\.[a-z0-9]+)?\.js/.test(s.html),
    },
  },
  {
    framework: 'laravel',
    confidence: 'high',
    tests: {
      'laravel_session cookie': (s) => /laravel_session/.test(s.cookies),
      'Livewire wire: attributes': (s) => /\swire:(id|model|click|init)\b/.test(s.html),
      'Inertia data-page root': (s) => /id=["']app["'][^>]*\bdata-page=/.test(s.html),
      'XSRF-TOKEN cookie with PHP': (s) =>
        /XSRF-TOKEN/.test(s.cookies) && s.powered.includes('php'),
    },
  },
  {
    framework: 'symfony',
    confidence: 'high',
    tests: {
      'x-debug-token header': (s) => !!s.header('x-debug-token'),
      'Symfony session cookie': (s) => /\bsf_redirect\b|\bsymfony\b/i.test(s.cookies),
    },
  },
  {
    framework: 'django',
    confidence: 'high',
    tests: {
      'csrfmiddlewaretoken field': (s) => /name=["']csrfmiddlewaretoken["']/.test(s.html),
      'csrftoken cookie': (s) => /\bcsrftoken=/.test(s.cookies),
    },
  },
  {
    framework: 'rails',
    confidence: 'high',
    tests: {
      'csrf-param meta tag': (s) => /<meta[^>]+name=["']csrf-param["']/.test(s.html),
      'x-runtime + Rails session': (s) =>
        !!s.header('x-runtime') && /_session=/.test(s.cookies),
      'Rails asset digest': (s) => /\/assets\/application-[a-f0-9]{8,}\.(css|js)/.test(s.html),
    },
  },
  {
    framework: 'aspnet',
    confidence: 'high',
    tests: {
      'x-aspnet-version header': (s) => !!s.header('x-aspnet-version'),
      'x-powered-by: ASP.NET': (s) => s.powered.includes('asp.net'),
      '__VIEWSTATE field': (s) => /name=["']__VIEWSTATE["']/.test(s.html),
      'ASP.NET session cookie': (s) => /ASP\.NET_SessionId|\.AspNetCore\./.test(s.cookies),
    },
  },
  {
    framework: 'drupal',
    confidence: 'high',
    tests: {
      'generator: Drupal': (s) => s.gen.includes('drupal'),
      'x-generator: Drupal': (s) => s.header('x-generator').toLowerCase().includes('drupal'),
      '/sites/default/files assets': (s) => /\/sites\/default\/files\//.test(s.html),
    },
  },
  {
    framework: 'joomla',
    confidence: 'high',
    tests: {
      'generator: Joomla': (s) => s.gen.includes('joomla'),
      '/media/system/js assets': (s) => /\/media\/system\/js\//.test(s.html),
    },
  },
  {
    framework: 'magento',
    confidence: 'high',
    tests: {
      'Magento static paths': (s) => /\/static\/version\d+\/frontend\/|\/pub\/static\//.test(s.html),
      'mage-cache-storage': (s) => /mage-cache-storage|Magento_/.test(s.html),
    },
  },
  {
    framework: 'ghost',
    confidence: 'high',
    tests: { 'generator: Ghost': (s) => s.gen.startsWith('ghost') },
  },
  {
    framework: 'hugo',
    confidence: 'high',
    tests: { 'generator: Hugo': (s) => s.gen.startsWith('hugo') },
  },
  {
    framework: 'jekyll',
    confidence: 'high',
    tests: { 'generator: Jekyll': (s) => s.gen.startsWith('jekyll') },
  },
  // --- Client-side libraries without a meta-framework. Markers are weaker. ---
  {
    framework: 'vue',
    confidence: 'high',
    tests: {
      'data-v-* scoped style attributes': (s) => /\sdata-v-[0-9a-f]{6,8}\b/.test(s.html),
      'data-server-rendered': (s) => /data-server-rendered=["']true["']/.test(s.html),
      'Vue runtime script': (s) =>
        /<script[^>]+src=["'][^"']*(\/vue(@[\d.]+)?(\/dist)?\/vue(\.global|\.runtime)?(\.prod)?(\.min)?\.js|vue\.(min\.)?js)/i.test(
          s.html,
        ),
    },
  },
  {
    framework: 'svelte',
    confidence: 'high',
    tests: { 'svelte-* scoped classes': (s) => /class=["'][^"']*\bsvelte-[a-z0-9]{4,8}\b/.test(s.html) },
  },
  {
    framework: 'react',
    confidence: 'high',
    tests: {
      'data-reactroot / data-reactid': (s) => /\bdata-react(root|id)\b/.test(s.html),
      'create-react-app meta': (s) => /create-react-app/i.test(s.html),
      'React runtime script': (s) =>
        /<script[^>]+src=["'][^"']*(react(-dom)?(\.production|\.development)?(\.min)?\.js|\/react@|\/react-dom@)/i.test(
          s.html,
        ),
      'CRA bundle (static/js/main.*.js)': (s) => /\/static\/js\/(main|bundle)\.[a-z0-9]*\.?js/.test(s.html),
    },
  },
  {
    framework: 'php',
    confidence: 'medium',
    tests: {
      'x-powered-by: PHP': (s) => s.powered.includes('php'),
      'PHPSESSID cookie': (s) => /PHPSESSID/.test(s.cookies),
    },
  },
];

/**
 * A bare `<div id="root">`/`#app` shell with module bundles is a client-rendered
 * app. The mount id is only a convention (`root` is React's, `app` is Vue's), so
 * the result is reported as low confidence.
 */
function spaShellMount(html: string): 'root' | 'app' | null {
  const mount = /<div\b[^>]*\bid=["'](root|app)["'][^>]*>\s*<\/div>/i.exec(html)?.[1];
  const hasBundle =
    /<script[^>]+type=["']module["'][^>]+src=|<script[^>]+src=["'][^"']*\/assets\/index-[\w-]+\.js/i.test(
      html,
    );
  return mount && hasBundle ? (mount.toLowerCase() as 'root' | 'app') : null;
}

/**
 * Pure framework detection from the home page's HTML and response headers.
 * Intended for sites whose platform is `custom` or `unknown`; hosted builders
 * (Shopify, Wix, …) are identified by `detectPlatform` first.
 */
export function detectFramework({ html, headers }: PlatformSignals): FrameworkResult {
  if (!html.trim()) return { framework: null, confidence: 'low', evidence: [] };

  const signals: Signals = {
    html,
    gen: generatorOf(html),
    powered: header(headers, 'x-powered-by').toLowerCase(),
    cookies: header(headers, 'set-cookie'),
    header: (name) => header(headers, name),
  };

  for (const rule of RULES) {
    const evidence = Object.entries(rule.tests)
      .filter(([, test]) => test(signals))
      .map(([label]) => label);
    if (evidence.length > 0) {
      // A single indirect signal for a library is weaker than two agreeing ones.
      const confidence =
        rule.confidence === 'high' && evidence.length === 1 && rule.framework === 'react'
          ? 'medium'
          : rule.confidence;
      return { framework: rule.framework, confidence, evidence };
    }
  }

  const mount = spaShellMount(html);
  if (mount) {
    return {
      framework: mount === 'root' ? 'react' : 'vue',
      confidence: 'low',
      evidence: [`Client-rendered #${mount} shell (library not confirmed)`],
    };
  }

  // Server-side frameworks (Django, Rails, Symfony…) leave no trace in HTML when no
  // cookies/headers give them away, so this is a safe default rather than a finding.
  return { framework: 'html', confidence: 'low', evidence: ['No framework markers found'] };
}

/**
 * Signatures inside a first-party JavaScript bundle. A client-rendered app's HTML
 * is an empty shell, but its bundle always contains its runtime. Ordered so the
 * more specific framework wins (Angular and Svelte before the generic checks).
 */
const BUNDLE_SIGNATURES: { framework: Framework; label: string; test: RegExp }[] = [
  { framework: 'angular', label: '@angular/core runtime', test: /\u0275\u0275defineComponent|@angular\/core|ɵɵdefineComponent/ },
  { framework: 'svelte', label: 'Svelte runtime', test: /svelte\/internal|\$\$_?invalidate|SvelteComponent/ },
  { framework: 'vue', label: 'Vue runtime', test: /__vue_app__|__VUE__|__VUE_OPTIONS_API__|createApp\(|vue-router/ },
  {
    framework: 'react',
    label: 'React runtime',
    test: /Symbol\.for\(["']react\.(element|transitional\.element)["']\)|__reactFiber\$|_reactRootContainer|react-dom|__REACT_DEVTOOLS_GLOBAL_HOOK__/,
  },
];

/** Detects the client-side library from the text of a JavaScript bundle. */
export function detectFrameworkFromScript(js: string): FrameworkResult | null {
  for (const { framework, label, test } of BUNDLE_SIGNATURES) {
    if (test.test(js)) return { framework, confidence: 'high', evidence: [`${label} in JS bundle`] };
  }
  return null;
}

/** First-party `<script src>` URLs from a page, in document order. */
export function firstPartyScripts(html: string, pageUrl: string): string[] {
  let origin: string;
  try {
    origin = new URL(pageUrl).origin;
  } catch {
    return [];
  }
  const urls: string[] = [];
  for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc=["']([^"']+)["']/gi)) {
    try {
      const url = new URL(src!, pageUrl);
      if (url.origin === origin && !urls.includes(url.href)) urls.push(url.href);
    } catch {
      // ignore malformed src
    }
  }
  return urls;
}
