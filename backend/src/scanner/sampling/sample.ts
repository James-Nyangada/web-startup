import { seededRandom } from './random.js';

export interface Candidate {
  url: string;
  templateKey: string;
  lastmod?: string | undefined;
}

export type PlanReason = 'home' | 'pinned' | 'key-page' | 'template' | 'fill';

export interface PlannedPage {
  url: string;
  templateKey: string;
  reason: PlanReason;
}

export interface SampleInput {
  homeUrl: string;
  /** Already normalised; at most 25 are used. */
  pinnedUrls: readonly string[];
  candidates: readonly Candidate[];
  pageLimit: number;
  /** URLs planned in the previous scan, for stability (spec 6.4 last paragraph). */
  previousUrls?: readonly string[];
  seed: string;
  templateOf: (url: string) => string;
}

const MAX_PINNED = 25;

/** Spec 6.4 step 3. Each pattern contributes at most one page. */
const KEY_PAGE_PATTERNS: readonly RegExp[] = [
  /\/cart\/?$/i,
  /\/(contact|contact-us|kontakt)\/?$/i,
  /\/search\/?$/i,
  /\/(account(\/login)?|login|sign-?in|my-account)\/?$/i,
  /\/checkout\/?$/i,
];

const lastmodTime = (candidate: Candidate) => {
  const time = candidate.lastmod ? Date.parse(candidate.lastmod) : NaN;
  return Number.isNaN(time) ? -Infinity : time;
};

/**
 * Yields one template's URLs in pick order. Without history: first, middle and
 * most recently modified, then the rest. With history: previously scanned URLs
 * are preferred, but every third pick rotates to a new URL so coverage grows.
 */
function templatePicker(
  urls: Candidate[],
  previous: ReadonlySet<string>,
  random: () => number,
): () => Candidate | undefined {
  const sorted = [...urls].sort((a, b) => a.url.localeCompare(b.url));
  const old = sorted.filter((c) => previous.has(c.url));
  const fresh = sorted.filter((c) => !previous.has(c.url));

  if (old.length === 0) {
    const order: Candidate[] = [];
    const add = (c: Candidate | undefined) => c && !order.includes(c) && order.push(c);
    add(sorted[0]);
    add(sorted[Math.floor((sorted.length - 1) / 2)]);
    add([...sorted].sort((a, b) => lastmodTime(b) - lastmodTime(a))[0]);
    sorted.forEach(add);
    let index = 0;
    return () => order[index++];
  }

  let pick = 0;
  return () => {
    const rotate = pick++ % 3 === 2;
    const takeFresh = () =>
      fresh.length ? fresh.splice(Math.floor(random() * fresh.length), 1)[0] : undefined;
    const takeOld = () => old.shift();
    return rotate ? (takeFresh() ?? takeOld()) : (takeOld() ?? takeFresh());
  };
}

/** Spec 6.4: the ordered list of pages to scan. Deterministic for the same input and seed. */
export function samplePages(input: SampleInput): PlannedPage[] {
  const limit = Math.max(0, Math.floor(input.pageLimit));
  const planned: PlannedPage[] = [];
  const taken = new Set<string>();
  const random = seededRandom(input.seed);
  const previous = new Set(input.previousUrls ?? []);

  const add = (url: string, templateKey: string, reason: PlanReason) => {
    if (planned.length >= limit || taken.has(url)) return;
    taken.add(url);
    planned.push({ url, templateKey, reason });
  };

  // 1–2. Home, then pinned URLs.
  add(input.homeUrl, 'home', 'home');
  for (const url of input.pinnedUrls.slice(0, MAX_PINNED))
    add(url, input.templateOf(url), 'pinned');

  // 3. Key pages.
  const byUrl = [...input.candidates].sort((a, b) => a.url.localeCompare(b.url));
  for (const pattern of KEY_PAGE_PATTERNS) {
    const match = byUrl.find((c) => !taken.has(c.url) && pattern.test(new URL(c.url).pathname));
    if (match) add(match.url, match.templateKey, 'key-page');
  }

  // 4. Up to 3 per template, biggest templates first.
  const groups = new Map<string, Candidate[]>();
  for (const candidate of input.candidates) {
    if (taken.has(candidate.url)) continue;
    const group = groups.get(candidate.templateKey) ?? [];
    group.push(candidate);
    groups.set(candidate.templateKey, group);
  }
  const templates = [...groups.entries()]
    .sort(([aKey, a], [bKey, b]) => b.length - a.length || aKey.localeCompare(bKey))
    .map(([key, urls]) => ({ key, next: templatePicker(urls, previous, random) }));

  const takeFrom = (template: (typeof templates)[number], reason: PlanReason) => {
    for (let c = template.next(); c; c = template.next()) {
      if (!taken.has(c.url)) {
        add(c.url, c.templateKey, reason);
        return true;
      }
    }
    return false;
  };

  for (const template of templates) {
    for (let i = 0; i < 3 && planned.length < limit; i++)
      if (!takeFrom(template, 'template')) break;
  }

  // 5. Round-robin fill.
  let active = templates;
  while (planned.length < limit && active.length > 0) {
    active = active.filter((template) => planned.length < limit && takeFrom(template, 'fill'));
  }

  return planned;
}
