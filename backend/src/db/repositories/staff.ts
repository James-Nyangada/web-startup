import { and, desc, eq, gte, ilike, isNotNull, isNull, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  aiSuggestions,
  auditLog,
  fixGuides,
  freeChecks,
  invoices,
  memberships,
  organizations,
  scans,
  sessions,
  sites,
  subscriptions,
  users,
  waitlist,
  type BillingStatus,
  type Plan,
} from '../schema/index.js';
import { PLAN_DEFINITIONS, type PlanType } from '../../shared/plans.js';
import type { OrgId } from './org-scope.js';

/** How long a TOTP check keeps a staff session unlocked. */
export const STAFF_VERIFICATION_TTL_MS = 12 * 60 * 60 * 1000;

export interface StaffSessionState {
  sessionId: string;
  userId: string;
  email: string;
  isStaff: boolean;
  totpSecretEncrypted: string | null;
  totpEnabledAt: Date | null;
  staffVerifiedAt: Date | null;
  impersonatingOrgId: string | null;
}

/** True when the session passed TOTP within the TTL. */
export function isStaffVerified(state: StaffSessionState | null, now = new Date()): boolean {
  return Boolean(
    state?.isStaff &&
    state.totpEnabledAt &&
    state.staffVerifiedAt &&
    now.getTime() - state.staffVerifiedAt.getTime() < STAFF_VERIFICATION_TTL_MS,
  );
}

/** Monthly recurring revenue in cents for one subscription (annual plans divided by 12). */
export function monthlyRevenueCents(
  sub: { plan: string; interval: string; status: string } | null | undefined,
): number {
  if (!sub || !['active', 'past_due'].includes(sub.status)) return 0;
  const def = PLAN_DEFINITIONS[sub.plan as PlanType];
  if (!def) return 0;
  return sub.interval === 'year'
    ? Math.round((def.priceAnnual * 100) / 12)
    : def.priceMonthly * 100;
}

export interface StaffOrgFilters {
  q?: string;
  plan?: Plan;
  billingStatus?: BillingStatus;
  includeDeleted?: boolean;
  limit: number;
  offset: number;
}

export function staffRepository(db: Database) {
  const siteCount = sql<number>`(select count(*)::int from ${sites} where ${sites.orgId} = ${organizations.id} and ${sites.deletedAt} is null)`;
  const lastActivity = sql<Date | null>`greatest(
    (select max(${scans.queuedAt}) from ${scans} where ${scans.orgId} = ${organizations.id}),
    (select max(${auditLog.createdAt}) from ${auditLog} where ${auditLog.orgId} = ${organizations.id})
  )`;

  return {
    /* ---------- Session state (P6-01) ---------- */

    async getSessionState(sessionId: string): Promise<StaffSessionState | null> {
      const [row] = await db
        .select({
          sessionId: sessions.id,
          userId: users.id,
          email: users.email,
          isStaff: users.isStaff,
          totpSecretEncrypted: users.totpSecretEncrypted,
          totpEnabledAt: users.totpEnabledAt,
          staffVerifiedAt: sessions.staffVerifiedAt,
          impersonatingOrgId: sessions.impersonatingOrgId,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .where(and(eq(sessions.id, sessionId), isNull(users.deletedAt)))
        .limit(1);
      return row ?? null;
    },

    async setTotpSecret(userId: string, secretEncrypted: string) {
      await db
        .update(users)
        .set({ totpSecretEncrypted: secretEncrypted, totpEnabledAt: null })
        .where(and(eq(users.id, userId), eq(users.isStaff, true)));
    },

    async enableTotp(userId: string) {
      await db
        .update(users)
        .set({ totpEnabledAt: new Date() })
        .where(and(eq(users.id, userId), eq(users.isStaff, true)));
    },

    async markSessionVerified(sessionId: string) {
      await db
        .update(sessions)
        .set({ staffVerifiedAt: new Date() })
        .where(eq(sessions.id, sessionId));
    },

    async setImpersonation(sessionId: string, orgId: string | null) {
      await db
        .update(sessions)
        .set({ impersonatingOrgId: orgId })
        .where(eq(sessions.id, sessionId));
    },

    /* ---------- Organisations (P6-02) ---------- */

    async listOrgs(filters: StaffOrgFilters) {
      const conditions: SQL[] = [];
      if (!filters.includeDeleted) conditions.push(isNull(organizations.deletedAt));
      if (filters.plan) conditions.push(eq(organizations.plan, filters.plan));
      if (filters.billingStatus)
        conditions.push(eq(organizations.billingStatus, filters.billingStatus));
      if (filters.q) {
        const pattern = `%${filters.q.replace(/[%_\\]/g, '\\$&')}%`;
        conditions.push(
          or(
            ilike(organizations.name, pattern),
            ilike(sql`${organizations.slug}::text`, pattern),
            sql`exists (select 1 from ${memberships} m join ${users} u on u.id = m.user_id
              where m.org_id = ${organizations.id} and u.email::text ilike ${pattern})`,
          )!,
        );
      }

      const rows = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          type: organizations.type,
          plan: organizations.plan,
          planOverride: organizations.planOverride,
          planOverrideExpiresAt: organizations.planOverrideExpiresAt,
          billingStatus: organizations.billingStatus,
          trialEndsAt: organizations.trialEndsAt,
          deletedAt: organizations.deletedAt,
          createdAt: organizations.createdAt,
          siteCount,
          lastActivityAt: lastActivity,
          subscription: {
            plan: subscriptions.plan,
            interval: subscriptions.interval,
            status: subscriptions.status,
          },
        })
        .from(organizations)
        .leftJoin(subscriptions, eq(subscriptions.orgId, organizations.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(organizations.createdAt), desc(organizations.id))
        .limit(filters.limit + 1)
        .offset(filters.offset);

      const hasMore = rows.length > filters.limit;
      const items = rows.slice(0, filters.limit).map(({ subscription, ...org }) => ({
        ...org,
        mrrCents: monthlyRevenueCents(subscription?.plan ? subscription : null),
        lastActivityAt: org.lastActivityAt ? new Date(org.lastActivityAt) : null,
      }));
      return { items, nextOffset: hasMore ? filters.offset + filters.limit : null };
    },

    async getOrgDetail(orgId: OrgId) {
      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, orgId))
        .limit(1);
      if (!org) return null;

      const [members, orgSites, recentScans, billingEvents, orgInvoices, [subscription]] =
        await Promise.all([
          db
            .select({
              userId: users.id,
              email: users.email,
              name: users.name,
              role: memberships.role,
              joinedAt: memberships.createdAt,
            })
            .from(memberships)
            .innerJoin(users, eq(users.id, memberships.userId))
            .where(eq(memberships.orgId, orgId))
            .orderBy(memberships.createdAt),
          db
            .select({
              id: sites.id,
              name: sites.name,
              rootUrl: sites.rootUrl,
              platform: sites.platform,
              status: sites.status,
              score: sites.score,
              scanFrequency: sites.scanFrequency,
              nextScanAt: sites.nextScanAt,
              deletedAt: sites.deletedAt,
            })
            .from(sites)
            .where(eq(sites.orgId, orgId))
            .orderBy(sites.name),
          db
            .select({
              id: scans.id,
              siteId: scans.siteId,
              siteName: sites.name,
              trigger: scans.trigger,
              status: scans.status,
              queuedAt: scans.queuedAt,
              finishedAt: scans.finishedAt,
              pagesScanned: scans.pagesScanned,
              score: scans.score,
              errorCode: scans.errorCode,
              errorMessage: scans.errorMessage,
            })
            .from(scans)
            .innerJoin(sites, eq(sites.id, scans.siteId))
            .where(eq(scans.orgId, orgId))
            .orderBy(desc(scans.queuedAt))
            .limit(25),
          db
            .select()
            .from(auditLog)
            .where(
              and(
                eq(auditLog.orgId, orgId),
                or(
                  ilike(auditLog.action, 'billing.%'),
                  ilike(auditLog.action, 'staff.%'),
                  ilike(auditLog.action, 'trial.%'),
                ),
              ),
            )
            .orderBy(desc(auditLog.createdAt))
            .limit(50),
          db
            .select()
            .from(invoices)
            .where(eq(invoices.orgId, orgId))
            .orderBy(desc(invoices.billedAt))
            .limit(12),
          db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId)).limit(1),
        ]);

      return {
        org,
        members,
        sites: orgSites,
        recentScans,
        errors: recentScans.filter((s) => s.status === 'failed' || s.status === 'partial'),
        billingEvents,
        invoices: orgInvoices,
        subscription: subscription ?? null,
        mrrCents: monthlyRevenueCents(subscription),
      };
    },

    /**
     * Pushes the trial end out. An org that already fell into read-only at the end of its
     * trial goes back to trialing so it can scan again.
     */
    async extendTrial(orgId: OrgId, trialEndsAt: Date) {
      const [row] = await db
        .update(organizations)
        .set({
          trialEndsAt,
          billingStatus: sql`case when ${organizations.plan} = 'trial' and ${organizations.billingStatus} = 'read_only' then 'trialing' else ${organizations.billingStatus} end`,
        })
        .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
        .returning();
      return row ?? null;
    },

    async setPlanOverride(
      orgId: OrgId,
      override: { plan: Plan; expiresAt: Date | null; reason: string } | null,
    ) {
      const [row] = await db
        .update(organizations)
        .set({
          planOverride: override?.plan ?? null,
          planOverrideExpiresAt: override?.expiresAt ?? null,
          planOverrideReason: override?.reason ?? null,
        })
        .where(and(eq(organizations.id, orgId), isNull(organizations.deletedAt)))
        .returning();
      return row ?? null;
    },

    /* ---------- Metrics for the system monitor (P6-03, spec 13.3) ---------- */

    async getMetrics(since: Date) {
      const [scanStats] = await db
        .select({
          total: sql<number>`count(*)::int`,
          failed: sql<number>`count(*) filter (where ${scans.status} = 'failed')::int`,
          completed: sql<number>`count(*) filter (where ${scans.status} in ('completed', 'partial'))::int`,
          avgDurationMs: sql<
            number | null
          >`(avg(extract(epoch from (${scans.finishedAt} - ${scans.startedAt}))) filter (where ${scans.status} in ('completed', 'partial') and ${scans.startedAt} is not null and ${scans.finishedAt} is not null) * 1000)::int`,
        })
        .from(scans)
        .where(gte(scans.queuedAt, since));

      const scansPerDay = await db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${scans.queuedAt}), 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
        })
        .from(scans)
        .where(gte(scans.queuedAt, since))
        .groupBy(sql`date_trunc('day', ${scans.queuedAt})`)
        .orderBy(sql`date_trunc('day', ${scans.queuedAt})`);

      const freeChecksPerDay = await db
        .select({
          day: sql<string>`to_char(date_trunc('day', ${freeChecks.createdAt}), 'YYYY-MM-DD')`,
          count: sql<number>`count(*)::int`,
        })
        .from(freeChecks)
        .where(gte(freeChecks.createdAt, since))
        .groupBy(sql`date_trunc('day', ${freeChecks.createdAt})`)
        .orderBy(sql`date_trunc('day', ${freeChecks.createdAt})`);

      const [conversion] = await db
        .select({
          trialsStarted: sql<number>`count(*)::int`,
          converted: sql<number>`count(*) filter (where ${organizations.plan} <> 'trial' and ${organizations.billingStatus} in ('active', 'past_due'))::int`,
        })
        .from(organizations)
        .where(gte(organizations.createdAt, since));

      const subs = await db
        .select({
          plan: subscriptions.plan,
          interval: subscriptions.interval,
          status: subscriptions.status,
        })
        .from(subscriptions);

      return {
        scans: {
          total: scanStats?.total ?? 0,
          failed: scanStats?.failed ?? 0,
          completed: scanStats?.completed ?? 0,
          failureRate: scanStats?.total ? (scanStats.failed ?? 0) / scanStats.total : 0,
          avgDurationMs: scanStats?.avgDurationMs ?? null,
        },
        scansPerDay,
        freeChecksPerDay,
        trialConversion: {
          trialsStarted: conversion?.trialsStarted ?? 0,
          converted: conversion?.converted ?? 0,
        },
        mrrCents: subs.reduce((sum, s) => sum + monthlyRevenueCents(s), 0),
      };
    },

    /* ---------- Leads (P6-04) ---------- */

    async listFreeCheckLeads(filters: {
      q?: string;
      consentOnly?: boolean;
      limit: number;
      offset: number;
    }) {
      const conditions: SQL[] = [isNotNull(freeChecks.email)];
      if (filters.consentOnly) conditions.push(eq(freeChecks.marketingConsent, true));
      if (filters.q) {
        const pattern = `%${filters.q.replace(/[%_\\]/g, '\\$&')}%`;
        conditions.push(
          or(ilike(sql`${freeChecks.email}::text`, pattern), ilike(freeChecks.domain, pattern))!,
        );
      }
      const rows = await db
        .select({
          id: freeChecks.id,
          email: freeChecks.email,
          url: freeChecks.url,
          domain: freeChecks.domain,
          status: freeChecks.status,
          score: sql<number | null>`(${freeChecks.result}->>'score')::int`,
          marketingConsent: freeChecks.marketingConsent,
          convertedOrgId: freeChecks.convertedOrgId,
          createdAt: freeChecks.createdAt,
        })
        .from(freeChecks)
        .where(and(...conditions))
        .orderBy(desc(freeChecks.createdAt))
        .limit(filters.limit + 1)
        .offset(filters.offset);
      const hasMore = rows.length > filters.limit;
      return {
        items: rows.slice(0, filters.limit),
        nextOffset: hasMore ? filters.offset + filters.limit : null,
      };
    },

    async listWaitlist(filters: {
      q?: string;
      consentOnly?: boolean;
      limit: number;
      offset: number;
    }) {
      const conditions: SQL[] = [];
      if (filters.consentOnly) conditions.push(eq(waitlist.consent, true));
      if (filters.q) {
        conditions.push(
          ilike(sql`${waitlist.email}::text`, `%${filters.q.replace(/[%_\\]/g, '\\$&')}%`),
        );
      }
      const rows = await db
        .select({
          id: waitlist.id,
          email: waitlist.email,
          source: waitlist.source,
          consent: waitlist.consent,
          converted: sql<boolean>`exists (select 1 from ${users} where ${users.email} = ${waitlist.email})`,
          createdAt: waitlist.createdAt,
        })
        .from(waitlist)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(waitlist.createdAt))
        .limit(filters.limit + 1)
        .offset(filters.offset);
      const hasMore = rows.length > filters.limit;
      return {
        items: rows.slice(0, filters.limit),
        nextOffset: hasMore ? filters.offset + filters.limit : null,
      };
    },

    /**
     * Every lead who agreed to marketing email, newest first, one row per address.
     * Free-check rows without consent and waitlist rows without consent are never returned.
     */
    async listConsentedLeads() {
      const checks = await db
        .select({
          email: freeChecks.email,
          domain: freeChecks.domain,
          convertedOrgId: freeChecks.convertedOrgId,
          createdAt: freeChecks.createdAt,
        })
        .from(freeChecks)
        .where(and(isNotNull(freeChecks.email), eq(freeChecks.marketingConsent, true)))
        .orderBy(desc(freeChecks.createdAt));
      const joined = await db
        .select({ email: waitlist.email, source: waitlist.source, createdAt: waitlist.createdAt })
        .from(waitlist)
        .where(eq(waitlist.consent, true))
        .orderBy(desc(waitlist.createdAt));

      const byEmail = new Map<
        string,
        { email: string; source: string; domain: string; converted: boolean; createdAt: Date }
      >();
      for (const c of checks) {
        const email = c.email!.toLowerCase();
        if (!byEmail.has(email)) {
          byEmail.set(email, {
            email,
            source: 'free_check',
            domain: c.domain,
            converted: Boolean(c.convertedOrgId),
            createdAt: c.createdAt,
          });
        }
      }
      for (const w of joined) {
        const email = w.email.toLowerCase();
        if (!byEmail.has(email)) {
          byEmail.set(email, {
            email,
            source: w.source ? `waitlist:${w.source}` : 'waitlist',
            domain: '',
            converted: false,
            createdAt: w.createdAt,
          });
        }
      }
      return [...byEmail.values()];
    },

    /* ---------- Content review (P6-05) ---------- */

    async listFlaggedSuggestions(limit = 100) {
      return db
        .select()
        .from(aiSuggestions)
        .where(eq(aiSuggestions.flagged, true))
        .orderBy(desc(aiSuggestions.updatedAt))
        .limit(limit);
    },

    async findSuggestion(id: string) {
      const [row] = await db.select().from(aiSuggestions).where(eq(aiSuggestions.id, id)).limit(1);
      return row ?? null;
    },

    /** Approving clears the flag so the cached suggestion is served again. */
    async approveSuggestion(id: string) {
      const [row] = await db
        .update(aiSuggestions)
        .set({ flagged: false, updatedAt: new Date() })
        .where(eq(aiSuggestions.id, id))
        .returning();
      return row ?? null;
    },

    async deleteSuggestion(id: string) {
      const rows = await db
        .delete(aiSuggestions)
        .where(eq(aiSuggestions.id, id))
        .returning({ id: aiSuggestions.id });
      return rows.length > 0;
    },

    /**
     * Turns a suggestion into an unpublished guide draft for an editor to review. Never
     * overwrites a guide that already exists for the rule and platform.
     */
    async promoteSuggestionToDraft(
      suggestion: typeof aiSuggestions.$inferSelect,
      draft: { slug: string; title: string },
    ) {
      const [row] = await db
        .insert(fixGuides)
        .values({
          ruleId: suggestion.ruleId,
          platform: suggestion.platform,
          slug: draft.slug,
          title: draft.title,
          bodyMd: suggestion.suggestionMd,
          source: 'ai_reviewed',
          published: false,
        })
        .onConflictDoNothing()
        .returning();
      return row ?? null;
    },
  };
}

export type StaffRepository = ReturnType<typeof staffRepository>;
