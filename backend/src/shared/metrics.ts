import { PLAN_DEFINITIONS, type PlanType } from './plans.js';

export const METRIC_KEYS = [
  'mrr',
  'active_subscriptions',
  'paying_orgs',
  'new_mrr',
  'expansion_mrr',
  'contraction_mrr',
  'churned_mrr',
  'net_mrr_change',
  'arpa',
  'trials_started',
  'trials_active',
  'activated_orgs',
  'new_paying_orgs',
  'trial_paid_conversion',
  'monthly_logo_churn',
  'weekly_active_orgs',
  'scans_total',
  'scans_failed',
  'scan_failure_rate',
  'scans_avg_duration_ms',
  'free_checks_total',
  'website_visitors',
  'website_page_views',
] as const;

export type MetricKey = (typeof METRIC_KEYS)[number];

export interface SubscriptionLike {
  plan: string;
  interval: string;
  status: string;
}

/**
 * Monthly recurring revenue in cents for one subscription.
 * Only 'active' and 'past_due' count; annual plans are divided by 12.
 */
export function calculateSubscriptionMrrCents(sub: SubscriptionLike | null | undefined): number {
  if (!sub || !['active', 'past_due'].includes(sub.status)) return 0;
  const def = PLAN_DEFINITIONS[sub.plan as PlanType];
  if (!def) return 0;
  return sub.interval === 'year'
    ? Math.round((def.priceAnnual * 100) / 12)
    : def.priceMonthly * 100;
}

/**
 * Calculates MRR (in USD dollars or cents) across an array of active subscriptions.
 */
export function calculateTotalMrrCents(subs: (SubscriptionLike | null | undefined)[]): number {
  return subs.reduce<number>((total, s) => total + calculateSubscriptionMrrCents(s), 0);
}

/**
 * Checks whether an organisation is activated within 7 days of signup.
 * Requires:
 * 1. >= 1 verified site
 * 2. >= 1 full scan completed (non-onboarding, status completed or partial)
 * 3. >= 1 issue marked fixed or rechecked
 */
export function isOrgActivated(
  createdAt: Date,
  milestones: {
    siteVerifiedAt: Date | null;
    fullScanCompletedAt: Date | null;
    issueFixedAt: Date | null;
  },
  _now = new Date(),
): { activated: boolean; activatedAt: Date | null; withinWeek: boolean } {
  const { siteVerifiedAt, fullScanCompletedAt, issueFixedAt } = milestones;
  if (!siteVerifiedAt || !fullScanCompletedAt || !issueFixedAt) {
    return { activated: false, activatedAt: null, withinWeek: false };
  }
  const maxTime = Math.max(
    siteVerifiedAt.getTime(),
    fullScanCompletedAt.getTime(),
    issueFixedAt.getTime(),
  );
  const activatedAt = new Date(maxTime);
  const diffMs = activatedAt.getTime() - createdAt.getTime();
  const weekMs = 7 * 24 * 60 * 60 * 1000;
  return {
    activated: true,
    activatedAt,
    withinWeek: diffMs <= weekMs && diffMs >= 0,
  };
}

/**
 * Calculates ARPA: MRR in cents divided by number of paying organisations.
 */
export function calculateArpaCents(totalMrrCents: number, payingOrgsCount: number): number {
  if (payingOrgsCount <= 0) return 0;
  return Math.round(totalMrrCents / payingOrgsCount);
}

/**
 * Scan failure rate: (failed + partial) / total.
 */
export function calculateScanFailureRate(total: number, failed: number, partial = 0): number {
  if (total <= 0) return 0;
  return (failed + partial) / total;
}

/**
 * Logo churn rate for a month: cancelled orgs in month / paying orgs at start of month.
 */
export function calculateMonthlyLogoChurnRate(cancelledCount: number, startPayingCount: number): number {
  if (startPayingCount <= 0) return 0;
  return cancelledCount / startPayingCount;
}

/**
 * Trial to paid conversion rate: orgs converting within 30 days / trials started in period.
 */
export function calculateTrialConversionRate(convertedCount: number, trialsStartedCount: number): number {
  if (trialsStartedCount <= 0) return 0;
  return convertedCount / trialsStartedCount;
}

/** Gauges are a state at a point in time (take the last value in a bucket); everything else is a flow (sum). */
export const GAUGE_METRICS: ReadonlySet<string> = new Set([
  'mrr',
  'active_subscriptions',
  'paying_orgs',
  'arpa',
  'trials_active',
  'trial_paid_conversion',
  'monthly_logo_churn',
  'weekly_active_orgs',
  'scan_failure_rate',
  'scans_avg_duration_ms',
]);

/** Revenue metrics need the "view revenue" permission (spec section 1). */
export const REVENUE_METRICS: ReadonlySet<string> = new Set([
  'mrr',
  'new_mrr',
  'expansion_mrr',
  'contraction_mrr',
  'churned_mrr',
  'net_mrr_change',
  'arpa',
]);

export type Granularity = 'day' | 'week' | 'month';

export interface MetricPoint {
  date: string;
  value: number;
}

function bucketStart(date: string, granularity: Granularity): string {
  if (granularity === 'day') return date;
  if (granularity === 'month') return `${date.slice(0, 7)}-01`;
  const d = new Date(`${date}T00:00:00Z`);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  d.setUTCDate(d.getUTCDate() - dow);
  return d.toISOString().slice(0, 10);
}

/** Rolls daily points up to weeks or months: gauges keep the last value, flows are summed. */
export function aggregatePoints(
  points: MetricPoint[],
  granularity: Granularity,
  metric: string,
): MetricPoint[] {
  if (granularity === 'day') return [...points].sort((a, b) => a.date.localeCompare(b.date));
  const gauge = GAUGE_METRICS.has(metric);
  const buckets = new Map<string, number>();
  for (const p of [...points].sort((a, b) => a.date.localeCompare(b.date))) {
    const key = bucketStart(p.date, granularity);
    buckets.set(key, gauge ? p.value : (buckets.get(key) ?? 0) + p.value);
  }
  return [...buckets.entries()].map(([date, value]) => ({ date, value }));
}

/** The previous period of equal length, ending the day before `from`. */
export function previousPeriod(from: string, to: string): { from: string; to: string } {
  const f = new Date(`${from}T00:00:00Z`).getTime();
  const t = new Date(`${to}T00:00:00Z`).getTime();
  const days = Math.round((t - f) / 86_400_000) + 1;
  const prevTo = new Date(f - 86_400_000);
  const prevFrom = new Date(prevTo.getTime() - (days - 1) * 86_400_000);
  return { from: prevFrom.toISOString().slice(0, 10), to: prevTo.toISOString().slice(0, 10) };
}

/** Percentage change from previous to current; null when there is nothing to compare with. */
export function changePct(current: number, previous: number | null | undefined): number | null {
  if (previous === null || previous === undefined || previous === 0) return null;
  return Math.round(((current - previous) / Math.abs(previous)) * 1000) / 10;
}

export interface FunnelCounts {
  visitors: number | null;
  freeChecks: number;
  signups: number;
  activated: number;
  paid: number;
}

/** Funnel steps with step-to-step conversion; steps with no data source are left out. */
export function buildFunnelSteps(c: FunnelCounts): {
  name: string;
  count: number;
  conversionPct: number;
  dropOffPct: number;
}[] {
  const raw: { name: string; count: number | null }[] = [
    { name: 'Website visitors', count: c.visitors },
    { name: 'Free checks', count: c.freeChecks },
    { name: 'Sign-ups', count: c.signups },
    { name: 'Activated', count: c.activated },
    { name: 'Paid', count: c.paid },
  ];
  const steps = raw.filter((s): s is { name: string; count: number } => s.count !== null);
  return steps.map((s, i) => {
    const prev = i === 0 ? null : steps[i - 1]!.count;
    const conversionPct = prev === null ? 100 : prev > 0 ? Math.round((s.count / prev) * 1000) / 10 : 0;
    return { ...s, conversionPct, dropOffPct: prev === null ? 0 : Math.round((100 - conversionPct) * 10) / 10 };
  });
}

export interface CohortSub {
  startedAt: Date;
  /** When the subscription stopped paying; null while still paying. */
  endedAt: Date | null;
}

/** Retention matrix: rows are the month of first payment, columns months 0..N, cells % still paying. */
export function buildCohortMatrix(
  subs: CohortSub[],
  now = new Date(),
  maxMonths = 12,
): { cohort: string; size: number; retention: number[] }[] {
  const byCohort = new Map<string, CohortSub[]>();
  for (const s of subs) {
    const key = s.startedAt.toISOString().slice(0, 7);
    byCohort.set(key, [...(byCohort.get(key) ?? []), s]);
  }
  return [...byCohort.keys()]
    .sort()
    .map((cohort) => {
      const members = byCohort.get(cohort)!;
      const [y, m] = cohort.split('-').map(Number) as [number, number];
      const monthsElapsed = (now.getUTCFullYear() - y) * 12 + (now.getUTCMonth() + 1 - m);
      const retention: number[] = [];
      for (let k = 0; k <= Math.min(monthsElapsed, maxMonths - 1); k++) {
        const cutoff = new Date(Date.UTC(y, m - 1 + k, 1));
        const kept = members.filter(
          (s) => k === 0 || s.endedAt === null || s.endedAt.getTime() >= cutoff.getTime(),
        ).length;
        retention.push(Math.round((kept / members.length) * 100));
      }
      return { cohort, size: members.length, retention };
    });
}

/**
 * Signed MRR change (cents) when a paying subscription moves to another plan or interval;
 * null when nothing changed or either side is not paying (new, cancelled and reactivated
 * subscriptions are new/churned MRR, not expansion or contraction).
 */
export function subscriptionMrrChangeCents(
  prev: SubscriptionLike | null | undefined,
  next: SubscriptionLike,
): number | null {
  if (!prev || (prev.plan === next.plan && prev.interval === next.interval)) return null;
  const before = calculateSubscriptionMrrCents(prev);
  const after = calculateSubscriptionMrrCents(next);
  if (before <= 0 || after <= 0 || before === after) return null;
  return after - before;
}

export interface SubscriptionFact extends SubscriptionLike {
  orgId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface MetricValue {
  metric: MetricKey;
  value: number;
  dimension?: string | null;
}

const PAYING_STATUSES = ['active', 'past_due'];
const DAY = 86_400_000;

/** Was this subscription paying at the moment `at`? Cancelled ones paid until their last update. */
export function isPayingAt(s: SubscriptionFact, at: Date): boolean {
  return s.createdAt < at && (PAYING_STATUSES.includes(s.status) || (s.status === 'canceled' && s.updatedAt >= at));
}

const mrrCents = (s: SubscriptionLike) => calculateSubscriptionMrrCents({ ...s, status: 'active' });

/**
 * Revenue metrics for one UTC day [start, end), all in cents (staff spec 4.2).
 * `expansionCents` and `contractionCents` are that day's upgrades and downgrades (positive numbers).
 */
export function revenueMetricsForDay(
  subs: SubscriptionFact[],
  start: Date,
  end: Date,
  moves: { expansionCents: number; contractionCents: number },
): MetricValue[] {
  const rows: MetricValue[] = [];
  const paying = subs.filter((s) => isPayingAt(s, end));
  const mrr = paying.reduce((t, s) => t + mrrCents(s), 0);
  rows.push({ metric: 'mrr', value: mrr });
  rows.push({ metric: 'paying_orgs', value: paying.length });
  rows.push({ metric: 'active_subscriptions', value: paying.length });
  rows.push({ metric: 'arpa', value: calculateArpaCents(mrr, paying.length) });
  for (const plan of new Set(paying.map((s) => s.plan))) {
    const inPlan = paying.filter((s) => s.plan === plan);
    rows.push({ metric: 'mrr', value: inPlan.reduce((t, s) => t + mrrCents(s), 0), dimension: plan });
    rows.push({ metric: 'paying_orgs', value: inPlan.length, dimension: plan });
  }

  const created = subs.filter((s) => s.createdAt >= start && s.createdAt < end);
  const churned = subs.filter((s) => s.status === 'canceled' && s.updatedAt >= start && s.updatedAt < end);
  const newMrr = created.reduce((t, s) => t + mrrCents(s), 0);
  const churnedMrr = churned.reduce((t, s) => t + mrrCents(s), 0);
  rows.push({ metric: 'new_mrr', value: newMrr });
  rows.push({ metric: 'new_paying_orgs', value: created.length });
  rows.push({ metric: 'churned_mrr', value: churnedMrr });
  rows.push({ metric: 'expansion_mrr', value: moves.expansionCents });
  rows.push({ metric: 'contraction_mrr', value: moves.contractionCents });
  rows.push({ metric: 'net_mrr_change', value: newMrr + moves.expansionCents - moves.contractionCents - churnedMrr });

  // Logo churn: cancellations in the 30 days to `end` over customers paying at the start of that window.
  const windowStart = new Date(end.getTime() - 30 * DAY);
  const startPaying = subs.filter((s) => isPayingAt(s, windowStart)).length;
  const cancelled30 = subs.filter((s) => s.status === 'canceled' && s.updatedAt >= windowStart && s.updatedAt < end).length;
  rows.push({ metric: 'monthly_logo_churn', value: calculateMonthlyLogoChurnRate(cancelled30, startPaying) });
  return rows;
}
