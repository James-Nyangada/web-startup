import { and, desc, eq, gte, inArray, isNull, lt, sql } from 'drizzle-orm';
import type { PgColumn, PgTable } from 'drizzle-orm/pg-core';
import type { Database } from '../client.js';
import {
  aiSuggestions,
  apiKeys,
  cancellationReasons,
  contentPosts,
  freeChecks,
  invoices,
  issues,
  manualChecks,
  memberships,
  metricsDaily,
  organizations,
  reportSchedules,
  reports,
  scans,
  sessions,
  sites,
  statements,
  subscriptionChanges,
  subscriptions,
  webhooks,
} from '../schema/index.js';
import {
  buildCohortMatrix,
  buildFunnelSteps,
  calculateScanFailureRate,
  calculateSubscriptionMrrCents,
  calculateTrialConversionRate,
  changePct,
  revenueMetricsForDay,
  type MetricKey,
} from '../../shared/metrics.js';
import { computeHealth } from '../../shared/health.js';
import type { OrgId } from './org-scope.js';
import { newId } from '../../lib/ids.js';

const DAY_MS = 86_400_000;
const PAYING = ['active', 'past_due'];

export interface MetricRow {
  metric: MetricKey;
  value: number;
  dimension?: string | null;
}

function dayBounds(date: string): { start: Date; end: Date } {
  const start = new Date(`${date}T00:00:00.000Z`);
  return { start, end: new Date(start.getTime() + DAY_MS) };
}

export function todayUtc(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/**
 * Snapshot, funnel, cohort and dashboard queries for the staff analytics screens.
 *
 * Subscriptions keep only their current state, so for past days the revenue gauges are
 * reconstructed: a subscription counts as paying on a day if it was created before the day
 * ended and either still pays or was cancelled (updated_at) after the day ended.
 */
export function staffAnalyticsRepository(db: Database) {
  async function upsertMetricRows(date: string, rows: MetricRow[]) {
    if (rows.length === 0) return;
    const values = rows.map(
      (r) =>
        sql`(${newId()}::uuid, ${date}::text, ${r.metric}::text, ${r.dimension ?? null}::text, ${String(Number.isFinite(r.value) ? r.value : 0)}::numeric)`,
    );
    await db.execute(sql`
      insert into metrics_daily (id, date, metric, dimension, value)
      values ${sql.join(values, sql`, `)}
      on conflict (date, metric, (coalesce(dimension, '')))
      do update set value = excluded.value, updated_at = now()
    `);
  }

  async function loadSubscriptions() {
    return db
      .select({
        orgId: subscriptions.orgId,
        plan: subscriptions.plan,
        interval: subscriptions.interval,
        status: subscriptions.status,
        createdAt: subscriptions.createdAt,
        updatedAt: subscriptions.updatedAt,
      })
      .from(subscriptions);
  }

  type SubRow = Awaited<ReturnType<typeof loadSubscriptions>>[number];

  const mrrOf = (s: SubRow) => calculateSubscriptionMrrCents({ ...s, status: 'active' });

  async function count(query: Promise<{ n: number }[]>): Promise<number> {
    return (await query)[0]?.n ?? 0;
  }

  async function computeMetricsForDate(date: string): Promise<number> {
    const { start, end } = dayBounds(date);
    const monthAgo = new Date(end.getTime() - 30 * DAY_MS);
    const weekAgo = new Date(end.getTime() - 7 * DAY_MS);
    const rows: MetricRow[] = [];
    const subs = await loadSubscriptions();

    // Revenue (cents, USD). Upgrades and downgrades come from subscription_changes, recorded
    // since that tracking shipped; earlier ones are not recoverable.
    const [moves] = await db
      .select({
        up: sql<number>`coalesce(sum(${subscriptionChanges.mrrDeltaCents}) filter (where ${subscriptionChanges.mrrDeltaCents} > 0), 0)::int`,
        down: sql<number>`coalesce(-sum(${subscriptionChanges.mrrDeltaCents}) filter (where ${subscriptionChanges.mrrDeltaCents} < 0), 0)::int`,
      })
      .from(subscriptionChanges)
      .where(and(gte(subscriptionChanges.changedAt, start), lt(subscriptionChanges.changedAt, end)));
    rows.push(
      ...revenueMetricsForDay(subs, start, end, {
        expansionCents: moves?.up ?? 0,
        contractionCents: moves?.down ?? 0,
      }),
    );

    // Sign-ups, by first-touch source
    const signups = await db
      .select({
        source: sql<string>`coalesce(${organizations.firstUtm}->>'source', 'direct')`,
        n: sql<number>`count(*)::int`,
      })
      .from(organizations)
      .where(and(gte(organizations.createdAt, start), lt(organizations.createdAt, end)))
      .groupBy(sql`1`);
    rows.push({ metric: 'trials_started', value: signups.reduce((t, r) => t + r.n, 0) });
    for (const r of signups) rows.push({ metric: 'trials_started', value: r.n, dimension: r.source });

    if (date === todayUtc()) {
      rows.push({
        metric: 'trials_active',
        value: await count(
          db
            .select({ n: sql<number>`count(*)::int` })
            .from(organizations)
            .where(and(eq(organizations.billingStatus, 'trialing'), isNull(organizations.deletedAt))),
        ),
      });
    }

    // Activation: the day the third milestone was reached
    const activated = await db.execute<{ source: string; n: number }>(sql`
      select coalesce(o.first_utm->>'source', 'direct') as source, count(*)::int as n
      from ${organizations} o
      where o.deleted_at is null and o.created_at >= ${new Date(start.getTime() - 7 * DAY_MS).toISOString()}::timestamptz
        and greatest(
          (select min(si.verified_at) from ${sites} si where si.org_id = o.id and si.deleted_at is null),
          (select min(sc.finished_at) from ${scans} sc where sc.org_id = o.id and sc.trigger <> 'onboarding' and sc.status in ('completed', 'partial')),
          (select min(i.fixed_at) from ${issues} i where i.org_id = o.id and i.status = 'fixed')
        ) >= ${start.toISOString()}::timestamptz
        and greatest(
          (select min(si.verified_at) from ${sites} si where si.org_id = o.id and si.deleted_at is null),
          (select min(sc.finished_at) from ${scans} sc where sc.org_id = o.id and sc.trigger <> 'onboarding' and sc.status in ('completed', 'partial')),
          (select min(i.fixed_at) from ${issues} i where i.org_id = o.id and i.status = 'fixed')
        ) < ${end.toISOString()}::timestamptz
      group by 1
    `);
    rows.push({ metric: 'activated_orgs', value: activated.rows.reduce((t, r) => t + r.n, 0) });
    for (const r of activated.rows) {
      rows.push({ metric: 'activated_orgs', value: r.n, dimension: r.source });
    }

    // Trial -> paid within 30 days, for orgs that signed up in the trailing 30 days
    const trialOrgs = await db
      .select({ id: organizations.id, createdAt: organizations.createdAt })
      .from(organizations)
      .where(and(gte(organizations.createdAt, monthAgo), lt(organizations.createdAt, end)));
    const firstPaid = new Map(subs.map((s) => [s.orgId, s.createdAt]));
    const converted = trialOrgs.filter((o) => {
      const paidAt = firstPaid.get(o.id);
      return paidAt && paidAt.getTime() - o.createdAt.getTime() <= 30 * DAY_MS;
    }).length;
    rows.push({
      metric: 'trial_paid_conversion',
      value: calculateTrialConversionRate(converted, trialOrgs.length),
    });

    // Weekly active orgs: a member signed in or a report was generated in the last 7 days
    const wao = await db.execute<{ n: number }>(sql`
      select count(*)::int as n from (
        select m.org_id from ${memberships} m
          join ${sessions} s on s.user_id = m.user_id
          where s.updated_at >= ${weekAgo.toISOString()}::timestamptz and s.updated_at < ${end.toISOString()}::timestamptz
        union
        select r.org_id from ${reports} r
          where r.created_at >= ${weekAgo.toISOString()}::timestamptz and r.created_at < ${end.toISOString()}::timestamptz
      ) x
    `);
    rows.push({ metric: 'weekly_active_orgs', value: wao.rows[0]?.n ?? 0 });

    // Scans
    const [sc] = await db
      .select({
        total: sql<number>`count(*)::int`,
        failed: sql<number>`count(*) filter (where ${scans.status} = 'failed')::int`,
        partial: sql<number>`count(*) filter (where ${scans.status} = 'partial')::int`,
        avgMs: sql<number | null>`(avg(extract(epoch from (${scans.finishedAt} - ${scans.startedAt}))) filter (where ${scans.status} in ('completed', 'partial') and ${scans.startedAt} is not null and ${scans.finishedAt} is not null) * 1000)::int`,
      })
      .from(scans)
      .where(and(gte(scans.queuedAt, start), lt(scans.queuedAt, end)));
    rows.push({ metric: 'scans_total', value: sc?.total ?? 0 });
    rows.push({ metric: 'scans_failed', value: (sc?.failed ?? 0) + (sc?.partial ?? 0) });
    rows.push({
      metric: 'scan_failure_rate',
      value: calculateScanFailureRate(sc?.total ?? 0, sc?.failed ?? 0, sc?.partial ?? 0),
    });
    if (sc?.avgMs !== null && sc?.avgMs !== undefined) {
      rows.push({ metric: 'scans_avg_duration_ms', value: sc.avgMs });
    }

    rows.push({
      metric: 'free_checks_total',
      value: await count(
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(freeChecks)
          .where(and(gte(freeChecks.createdAt, start), lt(freeChecks.createdAt, end))),
      ),
    });

    await upsertMetricRows(date, rows);
    return rows.length;
  }

  async function seriesTotal(metric: string, from: string, to: string, dimension?: string | null) {
    const [r] = await db
      .select({ v: sql<number>`coalesce(sum(${metricsDaily.value}), 0)::float` })
      .from(metricsDaily)
      .where(
        and(
          eq(metricsDaily.metric, metric),
          gte(metricsDaily.date, from),
          sql`${metricsDaily.date} <= ${to}`,
          dimension === undefined
            ? isNull(metricsDaily.dimension)
            : dimension === null
              ? isNull(metricsDaily.dimension)
              : eq(metricsDaily.dimension, dimension),
        ),
      );
    return r?.v ?? 0;
  }

  async function latestValue(metric: string, onOrBefore: string): Promise<number | null> {
    const [r] = await db
      .select({ v: sql<number>`${metricsDaily.value}::float` })
      .from(metricsDaily)
      .where(
        and(
          eq(metricsDaily.metric, metric),
          isNull(metricsDaily.dimension),
          sql`${metricsDaily.date} <= ${onOrBefore}`,
        ),
      )
      .orderBy(desc(metricsDaily.date))
      .limit(1);
    return r?.v ?? null;
  }

  function shiftDate(date: string, days: number): string {
    return new Date(new Date(`${date}T00:00:00Z`).getTime() + days * DAY_MS)
      .toISOString()
      .slice(0, 10);
  }

  return {
    computeMetricsForDate,

    async hasMetricsForDate(date: string): Promise<boolean> {
      const [r] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(metricsDaily)
        .where(eq(metricsDaily.date, date));
      return (r?.n ?? 0) > 0;
    },

    /** Stores Umami visitor and page-view totals for a day. */
    async recordTrafficDay(date: string, visitors: number, pageViews: number) {
      await upsertMetricRows(date, [
        { metric: 'website_visitors', value: visitors },
        { metric: 'website_page_views', value: pageViews },
      ]);
    },

    /** Scores every live organisation (spec section 5) and returns how many were written. */
    async computeAllOrgHealth(
      write: (orgId: OrgId, score: number, band: 'good' | 'at_risk' | 'poor', reasons: string[]) => Promise<unknown>,
      now = new Date(),
    ): Promise<number> {
      const fortnightAgo = new Date(now.getTime() - 14 * DAY_MS).toISOString();
      const monthAgo = new Date(now.getTime() - 30 * DAY_MS).toISOString();
      const result = await db.execute<{
        org_id: string;
        billing_status: string;
        last_sign_in: Date | null;
        scans_14d: number;
        critical_now: number;
        critical_14d_ago: number;
        reports_30d: number;
      }>(sql`
        select o.id as org_id, o.billing_status,
          (select max(s.updated_at) from ${sessions} s join ${memberships} m on m.user_id = s.user_id where m.org_id = o.id) as last_sign_in,
          (select count(*)::int from ${scans} sc where sc.org_id = o.id and sc.queued_at >= ${fortnightAgo}::timestamptz) as scans_14d,
          (select count(*)::int from ${issues} i where i.org_id = o.id and i.impact = 'critical' and i.status = 'open') as critical_now,
          (select count(*)::int from ${issues} i where i.org_id = o.id and i.impact = 'critical'
             and i.created_at < ${fortnightAgo}::timestamptz
             and (i.status = 'open' or i.fixed_at >= ${fortnightAgo}::timestamptz or i.ignored_at >= ${fortnightAgo}::timestamptz)) as critical_14d_ago,
          (select count(*)::int from ${reports} r where r.org_id = o.id and r.created_at >= ${monthAgo}::timestamptz) as reports_30d
        from ${organizations} o
        where o.deleted_at is null and o.billing_status in ('trialing', 'active', 'past_due', 'read_only')
      `);
      for (const r of result.rows) {
        const lastSignIn = r.last_sign_in ? new Date(r.last_sign_in) : null;
        const h = computeHealth({
          daysSinceSignIn: lastSignIn ? Math.floor((now.getTime() - lastSignIn.getTime()) / DAY_MS) : null,
          scansLast14d: r.scans_14d,
          openCriticalIssues: r.critical_now,
          openCriticalIssues14dAgo: r.critical_14d_ago,
          reportsLast30d: r.reports_30d,
          billingStatus: r.billing_status,
        });
        await write(r.org_id as OrgId, h.score, h.band, h.reasons);
      }
      return result.rows.length;
    },

    /** Dashboard stat cards, 12-month MRR, weekly sign-ups, daily visitors (all from metrics_daily). */
    async dashboard(today = todayUtc()) {
      const from30 = shiftDate(today, -29);
      const prev30From = shiftDate(today, -59);
      const prev30To = shiftDate(today, -30);

      const gauge = async (m: string) => {
        const cur = await latestValue(m, today);
        const prev = await latestValue(m, prev30To);
        return { cur, prev };
      };
      const [mrr, paying, trials, conv, churn, fail7] = await Promise.all([
        gauge('mrr'),
        gauge('paying_orgs'),
        gauge('trials_active'),
        gauge('trial_paid_conversion'),
        gauge('monthly_logo_churn'),
        gauge('scan_failure_rate'),
      ]);
      const [visitors, visitorsPrev, hasVisitors, checks, checksPrev] = await Promise.all([
        seriesTotal('website_visitors', from30, today),
        seriesTotal('website_visitors', prev30From, prev30To),
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(metricsDaily)
          .where(eq(metricsDaily.metric, 'website_visitors'))
          .then((r) => (r[0]?.n ?? 0) > 0),
        seriesTotal('free_checks_total', from30, today),
        seriesTotal('free_checks_total', prev30From, prev30To),
      ]);

      type Card = { value: number | null; prev: number | null; label: string; format: string };
      const cards: Record<string, Card> = {
        mrr: { label: 'MRR', value: mrr.cur, prev: mrr.prev, format: 'currency' },
        payingCustomers: { label: 'Paying customers', value: paying.cur, prev: paying.prev, format: 'number' },
        trialsActive: { label: 'Trials active', value: trials.cur, prev: trials.prev, format: 'number' },
        trialConversion: {
          label: 'Trial → paid (30d)',
          value: conv.cur === null ? null : conv.cur * 100,
          prev: conv.prev === null ? null : conv.prev * 100,
          format: 'percent',
        },
        churn: {
          label: 'Monthly churn',
          value: churn.cur === null ? null : churn.cur * 100,
          prev: churn.prev === null ? null : churn.prev * 100,
          format: 'percent',
        },
        visitors: {
          label: 'Visitors (30d)',
          value: hasVisitors ? visitors : null,
          prev: hasVisitors ? visitorsPrev : null,
          format: 'number',
        },
        freeChecks: { label: 'Free checks (30d)', value: checks, prev: checksPrev, format: 'number' },
        scanFailureRate: {
          label: 'Scan failure rate',
          value: fail7.cur === null ? null : fail7.cur * 100,
          prev: fail7.prev === null ? null : fail7.prev * 100,
          format: 'percent',
        },
      };
      const statCards = Object.fromEntries(
        Object.entries(cards).map(([k, c]) => [
          k,
          {
            label: c.label,
            format: c.format,
            value: c.value,
            changePct: c.value === null ? null : changePct(c.value, c.prev),
          },
        ]),
      );

      const mrrMonthly = await db.execute<{ month: string; mrr_cents: number }>(sql`
        select distinct on (to_char(date::date, 'YYYY-MM'))
          to_char(date::date, 'YYYY-MM') as month, value::float::int as mrr_cents
        from ${metricsDaily}
        where metric = 'mrr' and dimension is null and date >= ${shiftDate(today, -365)}
        order by to_char(date::date, 'YYYY-MM'), date desc
      `);

      const signupsWeekly = await db.execute<{ week: string; signups: number; converted: number }>(sql`
        select to_char(date_trunc('week', date::date), 'YYYY-MM-DD') as week,
          coalesce(sum(value) filter (where metric = 'trials_started'), 0)::int as signups,
          coalesce(sum(value) filter (where metric = 'new_paying_orgs'), 0)::int as converted
        from ${metricsDaily}
        where metric in ('trials_started', 'new_paying_orgs') and dimension is null
          and date >= ${shiftDate(today, -83)}
        group by 1 order by 1
      `);

      const visitorsDaily = await db
        .select({ date: metricsDaily.date, visitors: sql<number>`${metricsDaily.value}::float` })
        .from(metricsDaily)
        .where(
          and(
            eq(metricsDaily.metric, 'website_visitors'),
            isNull(metricsDaily.dimension),
            gte(metricsDaily.date, from30),
          ),
        )
        .orderBy(metricsDaily.date);

      return {
        statCards,
        mrrMonthly: mrrMonthly.rows.map((r) => ({ month: r.month, mrrCents: r.mrr_cents })),
        signupsWeekly: signupsWeekly.rows,
        visitorsDaily,
      };
    },

    /** Items the owner should look at today (spec 4.3). */
    async needsAttention(
      inactive: { orgId: string; orgName: string; plan: string; daysInactive: number }[] = [],
      now = new Date(),
    ) {
      const items: {
        id: string;
        type: string;
        title: string;
        description: string;
        href: string;
        severity: 'crit' | 'warn' | 'info';
      }[] = [];

      const pastDue = await db
        .select({ id: organizations.id, name: organizations.name, since: organizations.pastDueSince })
        .from(organizations)
        .where(and(eq(organizations.billingStatus, 'past_due'), isNull(organizations.deletedAt)))
        .limit(10);
      for (const o of pastDue) {
        items.push({
          id: `past-due-${o.id}`,
          type: 'past_due',
          title: `${o.name} has a payment past due`,
          description: o.since ? `Since ${o.since.toISOString().slice(0, 10)}` : 'Payment failed',
          href: `/staff/orgs/${o.id}`,
          severity: 'crit',
        });
      }

      const trialsEnding = await db.execute<{ id: string; name: string; ends: Date }>(sql`
        select o.id, o.name, o.trial_ends_at as ends from ${organizations} o
        where o.deleted_at is null and o.billing_status = 'trialing'
          and o.trial_ends_at > ${now.toISOString()}::timestamptz
          and o.trial_ends_at <= ${new Date(now.getTime() + 3 * DAY_MS).toISOString()}::timestamptz
          and not exists (select 1 from ${issues} i where i.org_id = o.id and i.status = 'fixed')
        order by o.trial_ends_at limit 10
      `);
      for (const o of trialsEnding.rows) {
        items.push({
          id: `trial-${o.id}`,
          type: 'trial_ending',
          title: `${o.name}'s trial ends soon and they are not activated`,
          description: `Trial ends ${new Date(o.ends).toISOString().slice(0, 10)}`,
          href: `/staff/orgs/${o.id}`,
          severity: 'warn',
        });
      }

      const failed = await count(
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(scans)
          .where(
            and(
              eq(scans.status, 'failed'),
              gte(scans.queuedAt, new Date(now.getTime() - DAY_MS)),
            ),
          ),
      );
      if (failed > 0) {
        items.push({
          id: 'failed-scans',
          type: 'failed_scans',
          title: `${failed} scan${failed === 1 ? '' : 's'} failed in the last 24 hours`,
          description: 'Check the queues for retries',
          href: '/staff/queues',
          severity: failed >= 10 ? 'crit' : 'warn',
        });
      }

      // Customers who pay but have not been active for two weeks
      for (const c of inactive) {
        items.push({
          id: `inactive-${c.orgId}`,
          type: 'inactive_customer',
          title: `${c.orgName} has been inactive for ${c.daysInactive} days`,
          description: `${c.plan} plan`,
          href: `/staff/orgs/${c.orgId}`,
          severity: 'warn',
        });
      }

      // Webhooks the system switched off after repeated delivery failures (not ones a user turned off)
      const disabled = await db
        .select({ id: webhooks.id, orgId: webhooks.orgId, orgName: organizations.name, error: webhooks.lastError })
        .from(webhooks)
        .innerJoin(organizations, eq(organizations.id, webhooks.orgId))
        .where(
          and(
            eq(webhooks.active, false),
            sql`${webhooks.failureCount} > 0`,
            gte(webhooks.updatedAt, new Date(now.getTime() - 7 * DAY_MS)),
            isNull(organizations.deletedAt),
          ),
        )
        .limit(5);
      for (const w of disabled) {
        items.push({
          id: `webhook-${w.id}`,
          type: 'webhook_disabled',
          title: `A webhook for ${w.orgName} was switched off after failures`,
          description: w.error ?? 'Delivery kept failing',
          href: `/staff/orgs/${w.orgId}`,
          severity: 'warn',
        });
      }

      const flagged = await count(
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(aiSuggestions)
          .where(eq(aiSuggestions.flagged, true)),
      );
      if (flagged > 0) {
        items.push({
          id: 'flagged-ai',
          type: 'flagged_ai',
          title: `${flagged} AI suggestion${flagged === 1 ? '' : 's'} flagged for review`,
          description: 'Review in Content review',
          href: '/staff/content',
          severity: 'info',
        });
      }

      const dueToday = await count(
        db
          .select({ n: sql<number>`count(*)::int` })
          .from(contentPosts)
          .where(
            and(
              eq(contentPosts.status, 'scheduled'),
              lt(contentPosts.publishAt, new Date(now.getTime() + DAY_MS)),
            ),
          ),
      );
      if (dueToday > 0) {
        items.push({
          id: 'content-today',
          type: 'content_scheduled',
          title: `${dueToday} post${dueToday === 1 ? '' : 's'} scheduled to publish today`,
          description: 'Open the content list',
          href: '/staff/content/posts',
          severity: 'info',
        });
      }
      return items;
    },

    async recentActivity(limit = 15) {
      const signups = await db
        .select({ id: organizations.id, name: organizations.name, at: organizations.createdAt })
        .from(organizations)
        .where(isNull(organizations.deletedAt))
        .orderBy(desc(organizations.createdAt))
        .limit(limit);
      const subs = await db
        .select({
          id: subscriptions.id,
          orgId: subscriptions.orgId,
          name: organizations.name,
          plan: subscriptions.plan,
          status: subscriptions.status,
          createdAt: subscriptions.createdAt,
          updatedAt: subscriptions.updatedAt,
        })
        .from(subscriptions)
        .innerJoin(organizations, eq(organizations.id, subscriptions.orgId))
        .orderBy(desc(subscriptions.updatedAt))
        .limit(limit);
      const cancels = await db
        .select({
          id: cancellationReasons.id,
          orgId: cancellationReasons.orgId,
          reason: cancellationReasons.reason,
          at: cancellationReasons.createdAt,
          name: organizations.name,
        })
        .from(cancellationReasons)
        .innerJoin(organizations, eq(organizations.id, cancellationReasons.orgId))
        .orderBy(desc(cancellationReasons.createdAt))
        .limit(limit);
      const refunds = await db
        .select({
          id: invoices.id,
          orgId: invoices.orgId,
          name: organizations.name,
          amount: invoices.amountCents,
          at: invoices.billedAt,
        })
        .from(invoices)
        .innerJoin(organizations, eq(organizations.id, invoices.orgId))
        .where(sql`${invoices.amountCents} < 0`)
        .orderBy(desc(invoices.billedAt))
        .limit(limit);

      const events = [
        ...signups.map((s) => ({
          id: `signup-${s.id}`,
          type: 'signup',
          text: `${s.name} signed up`,
          date: s.at.toISOString(),
          orgId: s.id,
        })),
        ...subs.map((s) =>
          s.status === 'canceled'
            ? {
                id: `cancel-${s.id}`,
                type: 'cancellation',
                text: `${s.name} cancelled (${s.plan})`,
                date: s.updatedAt.toISOString(),
                orgId: s.orgId,
              }
            : {
                id: `paid-${s.id}`,
                type: 'new_paying',
                text: `${s.name} is paying on ${s.plan}`,
                date: s.createdAt.toISOString(),
                orgId: s.orgId,
              },
        ),
        ...cancels.map((c) => ({
          id: `reason-${c.id}`,
          type: 'cancellation_reason',
          text: `${c.name} left: ${c.reason}`,
          date: c.at.toISOString(),
          orgId: c.orgId,
        })),
        ...refunds.map((r) => ({
          id: `refund-${r.id}`,
          type: 'refund',
          text: `${r.name} refunded ${(Math.abs(r.amount) / 100).toFixed(2)}`,
          date: r.at.toISOString(),
          orgId: r.orgId,
        })),
      ];
      return events.sort((a, b) => b.date.localeCompare(a.date)).slice(0, limit);
    },

    /** Funnel for the period; visitors come from Umami totals and are omitted when not recorded. */
    async funnel(from: string, to: string) {
      const [visitors, checks, signups, activated, paid] = await Promise.all([
        seriesTotal('website_visitors', from, to),
        seriesTotal('free_checks_total', from, to),
        seriesTotal('trials_started', from, to),
        seriesTotal('activated_orgs', from, to),
        seriesTotal('new_paying_orgs', from, to),
      ]);
      const hasVisitors = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(metricsDaily)
        .where(
          and(
            eq(metricsDaily.metric, 'website_visitors'),
            gte(metricsDaily.date, from),
            sql`${metricsDaily.date} <= ${to}`,
          ),
        )
        .then((r) => (r[0]?.n ?? 0) > 0);
      const steps = buildFunnelSteps({
        visitors: hasVisitors ? visitors : null,
        freeChecks: checks,
        signups,
        activated,
        paid,
      });

      // By first-touch source: sign-ups, activated and paid, from the orgs themselves.
      const bySource = await db.execute<{
        source: string;
        signups: number;
        activated: number;
        paid: number;
      }>(sql`
        select coalesce(o.first_utm->>'source', 'direct') as source,
          count(*)::int as signups,
          count(*) filter (where exists (select 1 from ${issues} i where i.org_id = o.id and i.status = 'fixed')
            and exists (select 1 from ${sites} si where si.org_id = o.id and si.verified_at is not null and si.deleted_at is null))::int as activated,
          count(*) filter (where exists (select 1 from ${subscriptions} sub where sub.org_id = o.id))::int as paid
        from ${organizations} o
        where o.deleted_at is null
          and o.created_at >= ${`${from}T00:00:00Z`}::timestamptz
          and o.created_at < ${`${shiftDate(to, 1)}T00:00:00Z`}::timestamptz
        group by 1 order by signups desc
      `);
      return { steps, bySource: bySource.rows };
    },

    /** Retention cohorts by month of first payment. */
    async cohorts() {
      const subs = await loadSubscriptions();
      return buildCohortMatrix(
        subs.map((s) => ({
          startedAt: s.createdAt,
          endedAt: s.status === 'canceled' ? s.updatedAt : null,
        })),
      );
    },

    /** Days from sign-up to activation, bucketed. */
    async activationDistribution(from: string, to: string) {
      const rows = await db.execute<{ days: number }>(sql`
        select floor(extract(epoch from (act.at - o.created_at)) / 86400)::int as days
        from ${organizations} o
        cross join lateral (
          select greatest(
            (select min(si.verified_at) from ${sites} si where si.org_id = o.id and si.deleted_at is null),
            (select min(sc.finished_at) from ${scans} sc where sc.org_id = o.id and sc.trigger <> 'onboarding' and sc.status in ('completed', 'partial')),
            (select min(i.fixed_at) from ${issues} i where i.org_id = o.id and i.status = 'fixed')
          ) as at
        ) act
        where o.deleted_at is null and act.at is not null
          and o.created_at >= ${`${from}T00:00:00Z`}::timestamptz
          and o.created_at < ${`${shiftDate(to, 1)}T00:00:00Z`}::timestamptz
      `);
      const buckets = [
        { label: 'Day 0', test: (d: number) => d <= 0 },
        { label: 'Day 1-2', test: (d: number) => d >= 1 && d <= 2 },
        { label: 'Day 3-4', test: (d: number) => d >= 3 && d <= 4 },
        { label: 'Day 5-7', test: (d: number) => d >= 5 && d <= 7 },
        { label: 'Day 8+', test: (d: number) => d >= 8 },
      ];
      return buckets.map((b) => ({
        label: b.label,
        value: rows.rows.filter((r) => b.test(r.days)).length,
      }));
    },

    /** Stores the cancel-survey answer so the business dashboard can chart it. */
    async recordCancellationReason(orgId: string, reason: string, comment: string | null) {
      await db.insert(cancellationReasons).values({ orgId, reason, comment });
    },

    /** Cancellation reasons in the period (empty until the cancel survey records them). */
    async cancellationBreakdown(from: string, to: string) {
      return db
        .select({ label: cancellationReasons.reason, value: sql<number>`count(*)::int` })
        .from(cancellationReasons)
        .where(
          and(
            gte(cancellationReasons.createdAt, new Date(`${from}T00:00:00Z`)),
            lt(cancellationReasons.createdAt, new Date(`${shiftDate(to, 1)}T00:00:00Z`)),
          ),
        )
        .groupBy(cancellationReasons.reason)
        .orderBy(desc(sql`count(*)`));
    },

    /** Share of paying orgs using each feature. */
    async featureAdoption() {
      const payingOrgs = await db
        .select({ id: subscriptions.orgId })
        .from(subscriptions)
        .where(inArray(subscriptions.status, PAYING));
      const total = payingOrgs.length;
      if (total === 0) return { totalPaying: 0, items: [] as { label: string; value: number }[] };
      const ids = payingOrgs.map((o) => o.id);
      const used = async (table: PgTable, orgId: PgColumn) => {
        const r = await db
          .select({ n: sql<number>`count(distinct ${orgId})::int` })
          .from(table)
          .where(inArray(orgId, ids));
        return Math.round(((r[0]?.n ?? 0) / total) * 100);
      };
      const items = [
        { label: 'Reports', value: await used(reports, reports.orgId) },
        { label: 'Scheduled client reports', value: await used(reportSchedules, reportSchedules.orgId) },
        { label: 'Webhooks / Slack', value: await used(webhooks, webhooks.orgId) },
        { label: 'API keys', value: await used(apiKeys, apiKeys.orgId) },
        { label: 'Manual checks', value: await used(manualChecks, manualChecks.orgId) },
        { label: 'Accessibility statements', value: await used(statements, statements.orgId) },
      ];
      return { totalPaying: total, items };
    },

    /** Top paying organisations by MRR (cents), computed across all subscriptions. */
    async topCustomers(limit = 10) {
      const rows = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          plan: subscriptions.plan,
          interval: subscriptions.interval,
          status: subscriptions.status,
        })
        .from(subscriptions)
        .innerJoin(organizations, eq(organizations.id, subscriptions.orgId))
        .where(and(inArray(subscriptions.status, PAYING), isNull(organizations.deletedAt)));
      return rows
        .map((r) => ({ id: r.id, name: r.name, slug: r.slug, plan: r.plan, billingStatus: r.status, mrrCents: mrrOf(r as unknown as SubRow) }))
        .sort((a, b) => b.mrrCents - a.mrrCents)
        .slice(0, limit);
    },

    /** Free-checker funnel for the period: checks run, left an email, went on to start a trial. */
    async checkerUsage(from: string, to: string) {
      const [r] = await db
        .select({
          checks: sql<number>`count(*)::int`,
          withEmail: sql<number>`count(*) filter (where ${freeChecks.email} is not null)::int`,
          startedTrial: sql<number>`count(*) filter (where ${freeChecks.convertedOrgId} is not null)::int`,
        })
        .from(freeChecks)
        .where(
          and(
            gte(freeChecks.createdAt, new Date(`${from}T00:00:00Z`)),
            lt(freeChecks.createdAt, new Date(`${shiftDate(to, 1)}T00:00:00Z`)),
          ),
        );
      return { checks: r?.checks ?? 0, withEmail: r?.withEmail ?? 0, startedTrial: r?.startedTrial ?? 0 };
    },

    /** Paying organisations and MRR (cents) per plan, today. */
    async planMix() {
      const subs = await loadSubscriptions();
      const byPlan = new Map<string, { plan: string; count: number; mrrCents: number }>();
      for (const s of subs.filter((x) => PAYING.includes(x.status))) {
        const row = byPlan.get(s.plan) ?? { plan: s.plan, count: 0, mrrCents: 0 };
        row.count++;
        row.mrrCents += mrrOf(s);
        byPlan.set(s.plan, row);
      }
      return [...byPlan.values()].sort((a, b) => b.mrrCents - a.mrrCents);
    },

    /** Issues found vs fixed per week across all customers. */
    async issueTrend(from: string, to: string) {
      const end = `${shiftDate(to, 1)}T00:00:00Z`;
      const found = await db.execute<{ week: string; n: number }>(sql`
        select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week, count(*)::int as n
        from ${issues} where created_at >= ${`${from}T00:00:00Z`}::timestamptz and created_at < ${end}::timestamptz
        group by 1 order by 1`);
      const fixed = await db.execute<{ week: string; n: number }>(sql`
        select to_char(date_trunc('week', fixed_at), 'YYYY-MM-DD') as week, count(*)::int as n
        from ${issues} where fixed_at >= ${`${from}T00:00:00Z`}::timestamptz and fixed_at < ${end}::timestamptz
        group by 1 order by 1`);
      const weeks = [...new Set([...found.rows, ...fixed.rows].map((r) => r.week))].sort();
      return weeks.map((w) => ({
        week: w,
        found: found.rows.find((r) => r.week === w)?.n ?? 0,
        fixed: fixed.rows.find((r) => r.week === w)?.n ?? 0,
      }));
    },

    /** AI suggestions generated and flagged per week. */
    async aiSuggestionTrend(from: string, to: string) {
      const end = `${shiftDate(to, 1)}T00:00:00Z`;
      const rows = await db.execute<{ week: string; generated: number; flagged: number }>(sql`
        select to_char(date_trunc('week', created_at), 'YYYY-MM-DD') as week,
          count(*)::int as generated, count(*) filter (where flagged)::int as flagged
        from ${aiSuggestions}
        where created_at >= ${`${from}T00:00:00Z`}::timestamptz and created_at < ${end}::timestamptz
        group by 1 order by 1`);
      return rows.rows;
    },
  };
}

export type StaffAnalyticsRepository = ReturnType<typeof staffAnalyticsRepository>;