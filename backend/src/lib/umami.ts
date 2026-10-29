/**
 * Minimal client for a self-hosted Umami instance (staff spec section 4.1).
 * Needs UMAMI_API_URL, UMAMI_API_TOKEN and UMAMI_WEBSITE_ID; without all three
 * `isUmamiConfigured()` is false and callers show "not connected" instead of numbers.
 */

export interface UmamiConfig {
  baseUrl: string;
  token: string;
  websiteId: string;
}

export function umamiConfig(env: NodeJS.ProcessEnv = process.env): UmamiConfig | null {
  const baseUrl = env.UMAMI_API_URL?.replace(/\/+$/, '');
  const token = env.UMAMI_API_TOKEN;
  const websiteId = env.UMAMI_WEBSITE_ID;
  if (!baseUrl || !token || !websiteId) return null;
  return { baseUrl, token, websiteId };
}

export function isUmamiConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return umamiConfig(env) !== null;
}

type Fetch = typeof fetch;

async function get<T>(cfg: UmamiConfig, path: string, params: Record<string, string | number>, f: Fetch): Promise<T> {
  const url = new URL(`${cfg.baseUrl}/api/websites/${cfg.websiteId}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  const res = await f(url, {
    headers: { Authorization: `Bearer ${cfg.token}`, Accept: 'application/json' },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`Umami ${path} responded ${res.status}`);
  return (await res.json()) as T;
}

const range = (from: string, to: string) => ({
  startAt: new Date(`${from}T00:00:00Z`).getTime(),
  endAt: new Date(`${to}T23:59:59.999Z`).getTime(),
});

export interface TrafficReport {
  configured: true;
  fetchedAt: string;
  totals: { visitors: number; pageViews: number; bounces: number; visits: number; totalTimeSeconds: number };
  daily: { date: string; visitors: number; pageViews: number }[];
  pages: { path: string; visitors: number }[];
  referrers: { name: string; visitors: number }[];
  countries: { name: string; visitors: number }[];
  devices: { name: string; visitors: number }[];
  campaigns: { name: string; visitors: number }[];
}

interface MetricRow {
  x: string | null;
  y: number;
}

/** Fetches the full traffic report for a date range. Any failed request rejects the whole report. */
export async function fetchTrafficReport(
  from: string,
  to: string,
  cfg: UmamiConfig,
  f: Fetch = fetch,
): Promise<TrafficReport> {
  const r = range(from, to);
  const metric = (type: string, limit = 15) =>
    get<MetricRow[]>(cfg, '/metrics', { ...r, type, limit }, f).then((rows) =>
      rows.map((row) => ({ name: row.x || 'direct', visitors: row.y })),
    );

  const [stats, pageviews, pages, referrers, countries, devices, campaigns] = await Promise.all([
    get<{
      pageviews: number | { value: number };
      visitors: number | { value: number };
      visits: number | { value: number };
      bounces: number | { value: number };
      totaltime: number | { value: number };
    }>(cfg, '/stats', r, f),
    get<{
      pageviews: { x: string; y: number }[];
      sessions: { x: string; y: number }[];
    }>(cfg, '/pageviews', { ...r, unit: 'day', timezone: 'UTC' }, f),
    metric('path', 25).then((rows) => rows.map((p) => ({ path: p.name, visitors: p.visitors }))),
    metric('referrer'),
    metric('country'),
    metric('device', 5),
    metric('utmCampaign'),
  ]);

  // Umami v1 returns plain numbers, v2 returns { value, prev }.
  const n = (v: number | { value: number } | undefined) => (typeof v === 'object' ? v.value : (v ?? 0));
  const byDay = new Map<string, { visitors: number; pageViews: number }>();
  for (const p of pageviews.pageviews ?? []) {
    byDay.set(p.x.slice(0, 10), { visitors: 0, pageViews: p.y });
  }
  for (const s of pageviews.sessions ?? []) {
    const day = s.x.slice(0, 10);
    byDay.set(day, { pageViews: byDay.get(day)?.pageViews ?? 0, visitors: s.y });
  }

  return {
    configured: true,
    fetchedAt: new Date().toISOString(),
    totals: {
      visitors: n(stats.visitors),
      pageViews: n(stats.pageviews),
      visits: n(stats.visits),
      bounces: n(stats.bounces),
      totalTimeSeconds: n(stats.totaltime),
    },
    daily: [...byDay.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, v]) => ({ date, ...v })),
    pages,
    referrers,
    countries,
    devices,
    campaigns,
  };
}
