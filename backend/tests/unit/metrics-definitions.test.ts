import { describe, expect, it } from 'vitest';
import {
  calculateArpaCents,
  calculateScanFailureRate,
  calculateTrialConversionRate,
  isOrgActivated,
  isPayingAt,
  revenueMetricsForDay,
  type MetricValue,
  type SubscriptionFact,
} from '../../src/shared/metrics.js';

/** Fixture prices (cents): store $29/mo or $290/yr, growth $79/mo, agency $199/mo. */
const d = (s: string) => new Date(`${s}T12:00:00Z`);
const sub = (over: Partial<SubscriptionFact> & { orgId: string }): SubscriptionFact => ({
  plan: 'store', interval: 'month', status: 'active',
  createdAt: d('2026-01-10'), updatedAt: d('2026-01-10'), ...over,
});
const value = (rows: MetricValue[], metric: string, dimension: string | null = null) =>
  rows.find((r) => r.metric === metric && (r.dimension ?? null) === dimension)?.value;

const DAY_START = new Date('2026-10-15T00:00:00Z');
const DAY_END = new Date('2026-10-16T00:00:00Z');
const none = { expansionCents: 0, contractionCents: 0 };

describe('MRR (spec 4.2)', () => {
  const subs = [
    sub({ orgId: 'a', plan: 'store', interval: 'month' }),               // 2900
    sub({ orgId: 'b', plan: 'store', interval: 'year' }),                // 29000 / 12 = 2417 (annual / 12, rounded)
    sub({ orgId: 'c', plan: 'agency', interval: 'month', status: 'past_due' }), // 19900 (past due still counts)
    sub({ orgId: 'd', plan: 'growth', status: 'paused' }),               // not active: excluded
    sub({ orgId: 'e', plan: 'growth', status: 'trialing' }),             // not active: excluded
  ];

  it('sums active and past-due subscriptions, with annual plans divided by 12', () => {
    const rows = revenueMetricsForDay(subs, DAY_START, DAY_END, none);
    expect(value(rows, 'mrr')).toBe(2900 + 2417 + 19900);
    expect(value(rows, 'paying_orgs')).toBe(3);
    expect(value(rows, 'arpa')).toBe(Math.round((2900 + 2417 + 19900) / 3));
  });

  it('splits MRR and customers by plan', () => {
    const rows = revenueMetricsForDay(subs, DAY_START, DAY_END, none);
    expect(value(rows, 'mrr', 'store')).toBe(2900 + 2417);
    expect(value(rows, 'paying_orgs', 'store')).toBe(2);
    expect(value(rows, 'mrr', 'agency')).toBe(19900);
  });

  it('matches a manual sum of active Paddle subscriptions', () => {
    const manual = subs
      .filter((s) => ['active', 'past_due'].includes(s.status))
      .reduce((t, s) => t + (s.plan === 'store' ? (s.interval === 'year' ? Math.round(29000 / 12) : 2900) : 19900), 0);
    expect(value(revenueMetricsForDay(subs, DAY_START, DAY_END, none), 'mrr')).toBe(manual);
  });

  it('is zero with no subscriptions and has a zero ARPA', () => {
    const rows = revenueMetricsForDay([], DAY_START, DAY_END, none);
    expect(value(rows, 'mrr')).toBe(0);
    expect(value(rows, 'arpa')).toBe(0);
    expect(calculateArpaCents(500, 0)).toBe(0);
  });
});

describe('MRR movement (new / expansion / contraction / churned)', () => {
  it('counts new subscribers and cancellations on the day they happen', () => {
    const subs = [
      sub({ orgId: 'new', plan: 'growth', createdAt: d('2026-10-15') }),
      sub({ orgId: 'gone', plan: 'agency', status: 'canceled', createdAt: d('2026-03-01'), updatedAt: d('2026-10-15') }),
      sub({ orgId: 'steady', plan: 'store' }),
    ];
    const rows = revenueMetricsForDay(subs, DAY_START, DAY_END, none);
    expect(value(rows, 'new_mrr')).toBe(7900);
    expect(value(rows, 'new_paying_orgs')).toBe(1);
    expect(value(rows, 'churned_mrr')).toBe(19900);
    expect(value(rows, 'net_mrr_change')).toBe(7900 - 19900);
    // The cancelled customer stopped paying today, so MRR excludes them.
    expect(value(rows, 'mrr')).toBe(7900 + 2900);
  });

  it('nets upgrades and downgrades into the change: new + expansion - contraction - churned', () => {
    const rows = revenueMetricsForDay([], DAY_START, DAY_END, { expansionCents: 5000, contractionCents: 1200 });
    expect(value(rows, 'expansion_mrr')).toBe(5000);
    expect(value(rows, 'contraction_mrr')).toBe(1200);
    expect(value(rows, 'net_mrr_change')).toBe(3800);
  });

  it('keeps a cancelled customer in earlier days MRR (history is not rewritten)', () => {
    const gone = sub({ orgId: 'gone', status: 'canceled', createdAt: d('2026-03-01'), updatedAt: d('2026-10-15') });
    expect(isPayingAt(gone, new Date('2026-10-10T00:00:00Z'))).toBe(true);
    expect(isPayingAt(gone, DAY_END)).toBe(false);
    expect(isPayingAt(sub({ orgId: 'x', createdAt: d('2026-10-20') }), DAY_END)).toBe(false);
  });
});

describe('logo churn and conversion', () => {
  it('is cancellations in the last 30 days over customers paying at the start of that window', () => {
    const subs = [
      ...['a', 'b', 'c', 'd'].map((id) => sub({ orgId: id, createdAt: d('2026-01-01') })),
      sub({ orgId: 'x', status: 'canceled', createdAt: d('2026-01-01'), updatedAt: d('2026-10-05') }),
    ];
    // Paying on 16 Sep: a, b, c, d and x (x cancelled later). One of five left in the window.
    expect(value(revenueMetricsForDay(subs, DAY_START, DAY_END, none), 'monthly_logo_churn')).toBeCloseTo(1 / 5);
  });

  it('is zero when nobody was paying at the start', () => {
    expect(value(revenueMetricsForDay([], DAY_START, DAY_END, none), 'monthly_logo_churn')).toBe(0);
  });

  it('converts trials that became paid, and handles no trials', () => {
    expect(calculateTrialConversionRate(3, 12)).toBe(0.25);
    expect(calculateTrialConversionRate(0, 0)).toBe(0);
  });

  it('measures the scan failure rate as failed plus partial over all scans', () => {
    expect(calculateScanFailureRate(100, 3, 2)).toBe(0.05);
    expect(calculateScanFailureRate(0, 0, 0)).toBe(0);
  });
});

describe('activation', () => {
  const created = d('2026-10-01');
  const at = (day: string) => d(day);

  it('needs all three milestones, completed within 7 days of sign-up to count as on time', () => {
    const onTime = isOrgActivated(created, {
      siteVerifiedAt: at('2026-10-01'), fullScanCompletedAt: at('2026-10-02'), issueFixedAt: at('2026-10-05'),
    });
    expect(onTime).toMatchObject({ activated: true, withinWeek: true });
    const late = isOrgActivated(created, {
      siteVerifiedAt: at('2026-10-01'), fullScanCompletedAt: at('2026-10-02'), issueFixedAt: at('2026-10-20'),
    });
    expect(late).toMatchObject({ activated: true, withinWeek: false });
    expect(
      isOrgActivated(created, { siteVerifiedAt: at('2026-10-01'), fullScanCompletedAt: null, issueFixedAt: at('2026-10-03') }).activated,
    ).toBe(false);
  });
});
