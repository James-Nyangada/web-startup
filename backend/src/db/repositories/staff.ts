import { and, desc, eq, gte, ilike, inArray, isNotNull, isNull, lte, or, sql, type SQL } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  aiSuggestions,
  analyticsCache,
  auditLog,
  banners,
  changelogEntries,
  contentPages,
  contentPosts,
  contentRevisions,
  fixGuides,
  freeChecks,
  invoices,
  issues,
  legalNotices,
  mediaAssets,
  memberships,
  metricsDaily,
  orgHealth,
  organizations,
  orgNotes,
  orgTags,
  redirects,
  rules,
  savedSegments,
  scans,
  sessions,
  siteDeploys,
  sites,
  siteSettings,
  staffEmails,
  staffMembers,
  subscriptions,
  users,
  waitlist,
  type BannerSurface,
  type ActorType,
  type BillingStatus,
  type ContentPostStatus,
  type ContentPostType,
  type HealthBand,
  type Plan,
  type SiteDeployStatus,
  type StaffRole,
} from '../schema/index.js';
import { calculateSubscriptionMrrCents, isOrgActivated } from '../../shared/metrics.js';
import { AppError } from '../../lib/app-error.js';
import { ErrorCode } from '../../shared/errors.js';
import { staffAnalyticsRepository } from './staff-analytics.js';
import { composeGuideBody } from '../../lib/guide-markdown.js';
import { slugChangeRedirect } from '../../shared/content-schemas.js';
import { PLATFORMS, type Platform } from '../../scanner/types.js';
import type { OrgId } from './org-scope.js';

/** How long a TOTP check keeps a staff session unlocked. */
export const STAFF_VERIFICATION_TTL_MS = 12 * 60 * 60 * 1000;

export interface StaffSessionState {
  sessionId: string;
  userId: string;
  email: string;
  isStaff: boolean;
  staffMemberId?: string | null;
  role?: StaffRole;
  displayName?: string | null;
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
  return calculateSubscriptionMrrCents(sub);
}

export interface StaffOrgFilters {
  q?: string;
  plan?: Plan;
  billingStatus?: BillingStatus;
  includeDeleted?: boolean;
  healthBand?: HealthBand;
  limit: number;
  offset: number;
}

export function staffRepository(db: Database) {
  const siteCount = sql<number>`(select count(*)::int from ${sites} where ${sites.orgId} = ${organizations.id} and ${sites.deletedAt} is null)`;
  const lastActivity = sql<Date | null>`greatest(
    (select max(${scans.queuedAt}) from ${scans} where ${scans.orgId} = ${organizations.id}),
    (select max(${auditLog.createdAt}) from ${auditLog} where ${auditLog.orgId} = ${organizations.id})
  )`;

  /**
   * Keeps the in-app fix-guide panel (fix_guides) in step with the CMS: publishing a guide
   * makes it live in the app with no deploy; unpublishing or archiving hides it.
   */
  async function syncFixGuide(post: typeof contentPosts.$inferSelect | null | undefined) {
    if (!post || post.type !== 'guide' || !post.ruleId || !post.platform) return;
    if (!(PLATFORMS as readonly string[]).includes(post.platform)) return;
    const body = post.sections
      ? composeGuideBody(post.title, post.platform, post.sections)
      : post.bodyMd;
    const published = post.status === 'published';
    await db
      .insert(fixGuides)
      .values({
        ruleId: post.ruleId,
        platform: post.platform as Platform,
        slug: post.slug,
        title: post.title,
        bodyMd: body,
        source: 'written',
        reviewedAt: post.reviewedAt,
        published,
      })
      .onConflictDoUpdate({
        target: [fixGuides.ruleId, fixGuides.platform],
        set: { slug: post.slug, title: post.title, bodyMd: body, reviewedAt: post.reviewedAt, published, updatedAt: new Date() },
      });
  }

  return {
    ...staffAnalyticsRepository(db),

    /* ---------- Session state (P6-01 / P8-01) ---------- */

    async getSessionState(sessionId: string): Promise<StaffSessionState | null> {
      const [row] = await db
        .select({
          sessionId: sessions.id,
          userId: users.id,
          email: users.email,
          isUserStaff: users.isStaff,
          userName: users.name,
          totpSecretEncrypted: users.totpSecretEncrypted,
          totpEnabledAt: users.totpEnabledAt,
          staffVerifiedAt: sessions.staffVerifiedAt,
          impersonatingOrgId: sessions.impersonatingOrgId,
          staffMemberId: staffMembers.id,
          staffRole: staffMembers.role,
          staffDisplayName: staffMembers.displayName,
          staffActive: staffMembers.active,
        })
        .from(sessions)
        .innerJoin(users, eq(users.id, sessions.userId))
        .leftJoin(staffMembers, eq(staffMembers.userId, users.id))
        .where(and(eq(sessions.id, sessionId), isNull(users.deletedAt)))
        .limit(1);

      if (!row) return null;

      if (row.staffMemberId) {
        if (!row.staffActive) return null;
        return {
          sessionId: row.sessionId,
          userId: row.userId,
          email: row.email,
          isStaff: true,
          staffMemberId: row.staffMemberId,
          role: row.staffRole ?? 'admin',
          displayName: row.staffDisplayName ?? row.userName,
          totpSecretEncrypted: row.totpSecretEncrypted,
          totpEnabledAt: row.totpEnabledAt,
          staffVerifiedAt: row.staffVerifiedAt,
          impersonatingOrgId: row.impersonatingOrgId,
        };
      }

      if (row.isUserStaff) {
        return {
          sessionId: row.sessionId,
          userId: row.userId,
          email: row.email,
          isStaff: true,
          staffMemberId: null,
          role: 'owner',
          displayName: row.userName,
          totpSecretEncrypted: row.totpSecretEncrypted,
          totpEnabledAt: row.totpEnabledAt,
          staffVerifiedAt: row.staffVerifiedAt,
          impersonatingOrgId: row.impersonatingOrgId,
        };
      }

      return null;
    },

    async setTotpSecret(userId: string, secretEncrypted: string) {
      await db
        .update(users)
        .set({ totpSecretEncrypted: secretEncrypted, totpEnabledAt: null })
        .where(eq(users.id, userId));
    },

    async enableTotp(userId: string) {
      await db
        .update(users)
        .set({ totpEnabledAt: new Date() })
        .where(eq(users.id, userId));
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

    /* ---------- Staff members & roles (P8-01, S-102) ---------- */

    async listStaffMembers() {
      return db
        .select({
          id: staffMembers.id,
          userId: staffMembers.userId,
          role: staffMembers.role,
          displayName: staffMembers.displayName,
          jobTitle: staffMembers.jobTitle,
          bio: staffMembers.bio,
          avatarKey: staffMembers.avatarKey,
          active: staffMembers.active,
          createdAt: staffMembers.createdAt,
          updatedAt: staffMembers.updatedAt,
          email: users.email,
          name: users.name,
          avatarUrl: users.avatarUrl,
        })
        .from(staffMembers)
        .innerJoin(users, eq(users.id, staffMembers.userId))
        .orderBy(desc(staffMembers.createdAt));
    },

    async findStaffMemberById(id: string) {
      const [row] = await db
        .select({
          id: staffMembers.id,
          userId: staffMembers.userId,
          role: staffMembers.role,
          displayName: staffMembers.displayName,
          jobTitle: staffMembers.jobTitle,
          bio: staffMembers.bio,
          avatarKey: staffMembers.avatarKey,
          active: staffMembers.active,
          createdAt: staffMembers.createdAt,
          updatedAt: staffMembers.updatedAt,
          email: users.email,
          name: users.name,
        })
        .from(staffMembers)
        .innerJoin(users, eq(users.id, staffMembers.userId))
        .where(eq(staffMembers.id, id))
        .limit(1);
      return row ?? null;
    },

    async findStaffMemberByUserId(userId: string) {
      const [row] = await db
        .select()
        .from(staffMembers)
        .where(eq(staffMembers.userId, userId))
        .limit(1);
      return row ?? null;
    },

    async countActiveOwners(): Promise<number> {
      const [row] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(staffMembers)
        .where(and(eq(staffMembers.role, 'owner'), eq(staffMembers.active, true)));
      return row?.count ?? 0;
    },

    async createStaffMember(data: {
      userId: string;
      role: StaffRole;
      displayName?: string;
      jobTitle?: string;
      bio?: string;
      avatarKey?: string;
    }) {
      const [row] = await db
        .insert(staffMembers)
        .values({
          userId: data.userId,
          role: data.role,
          displayName: data.displayName,
          jobTitle: data.jobTitle,
          bio: data.bio,
          avatarKey: data.avatarKey,
          active: true,
        })
        .returning();

      // Ensure user.is_staff remains true for backwards compatibility
      await db.update(users).set({ isStaff: true }).where(eq(users.id, data.userId));

      return row ?? null;
    },

    async updateStaffMember(
      id: string,
      data: Partial<{
        role: StaffRole;
        displayName: string | null;
        jobTitle: string | null;
        bio: string | null;
        avatarKey: string | null;
        active: boolean;
      }>,
    ) {
      const current = await this.findStaffMemberById(id);
      if (!current) return null;

      // Exactly one staff owner must always exist
      if (
        current.role === 'owner' &&
        ((data.role && data.role !== 'owner') || data.active === false)
      ) {
        const ownerCount = await this.countActiveOwners();
        if (ownerCount <= 1) {
          throw AppError.validation('Cannot demote or deactivate the last staff owner.');
        }
      }

      const [row] = await db
        .update(staffMembers)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(staffMembers.id, id))
        .returning();
      return row ?? null;
    },

    async deleteStaffMember(id: string) {
      const current = await this.findStaffMemberById(id);
      if (!current) return false;

      if (current.role === 'owner') {
        const ownerCount = await this.countActiveOwners();
        if (ownerCount <= 1) {
          throw AppError.validation('Cannot delete the last staff owner.');
        }
      }

      await db.delete(staffMembers).where(eq(staffMembers.id, id));
      return true;
    },

    async canDemoteOrRemoveOwner(id: string): Promise<boolean> {
      const current = await this.findStaffMemberById(id);
      if (!current || current.role !== 'owner' || !current.active) return true;
      const ownerCount = await this.countActiveOwners();
      return ownerCount > 1;
    },

    /* ---------- Organisations (P6-02 / P8-19) ---------- */

    async listOrgs(filters: StaffOrgFilters) {
      const conditions: SQL[] = [];
      if (!filters.includeDeleted) conditions.push(isNull(organizations.deletedAt));
      if (filters.plan) conditions.push(eq(organizations.plan, filters.plan));
      if (filters.billingStatus)
        conditions.push(eq(organizations.billingStatus, filters.billingStatus));
      if (filters.healthBand) conditions.push(eq(orgHealth.band, filters.healthBand));
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
          health: {
            score: orgHealth.score,
            band: orgHealth.band,
            reasons: orgHealth.reasons,
          },
        })
        .from(organizations)
        .leftJoin(subscriptions, eq(subscriptions.orgId, organizations.id))
        .leftJoin(orgHealth, eq(orgHealth.orgId, organizations.id))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(organizations.createdAt), desc(organizations.id))
        .limit(filters.limit + 1)
        .offset(filters.offset);

      const hasMore = rows.length > filters.limit;
      const items = rows.slice(0, filters.limit).map(({ subscription, health, ...org }) => ({
        ...org,
        mrrCents: monthlyRevenueCents(subscription?.plan ? subscription : null),
        lastActivityAt: org.lastActivityAt ? new Date(org.lastActivityAt) : null,
        health: health?.score !== undefined && health?.score !== null ? health : null,
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

      const [
        members,
        orgSites,
        recentScans,
        billingEvents,
        orgInvoices,
        [subscription],
        notes,
        tags,
        [health],
      ] = await Promise.all([
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
                ilike(auditLog.action, 'customer.%'),
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
        db
          .select({
            id: orgNotes.id,
            bodyMd: orgNotes.bodyMd,
            createdAt: orgNotes.createdAt,
            authorName: sql<string>`coalesce(${staffMembers.displayName}, ${users.name}, 'Staff')`,
            authorStaffId: orgNotes.authorStaffId,
          })
          .from(orgNotes)
          .innerJoin(staffMembers, eq(staffMembers.id, orgNotes.authorStaffId))
          .innerJoin(users, eq(users.id, staffMembers.userId))
          .where(eq(orgNotes.orgId, orgId))
          .orderBy(desc(orgNotes.createdAt)),
        db
          .select({ tag: orgTags.tag })
          .from(orgTags)
          .where(eq(orgTags.orgId, orgId))
          .orderBy(orgTags.tag),
        db.select().from(orgHealth).where(eq(orgHealth.orgId, orgId)).limit(1),
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
        notes,
        tags: tags.map((t) => t.tag),
        health: health ?? null,
      };
    },

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

    /* ---------- Customer Success & Timeline (P8-19, P8-20) ---------- */

    async listInactivePaying(minDays: number, limit = 200, onlyOrgId?: string) {
      const cutoff = new Date(Date.now() - minDays * 24 * 60 * 60 * 1000);
      const rows = await db.execute<{
        org_id: string;
        org_name: string;
        plan: string;
        owner_user_id: string;
        owner_email: string;
        owner_name: string | null;
        last_active_at: Date;
        last_check_in_at: Date | null;
      }>(sql`
        select o.id as org_id, o.name as org_name, o.plan, u.id as owner_user_id,
               u.email::text as owner_email, u.name as owner_name,
               coalesce((select max(s.updated_at) from ${sessions} s where s.user_id = u.id),
                        sub.created_at) as last_active_at,
               (select max(a.created_at) from ${auditLog} a
                 where a.org_id = o.id and a.action = 'customer.check_in_sent') as last_check_in_at
        from ${organizations} o
        join ${subscriptions} sub on sub.org_id = o.id
        join ${memberships} m on m.org_id = o.id and m.role = 'owner'
        join ${users} u on u.id = m.user_id
        where o.deleted_at is null and o.billing_status = 'active'
          ${onlyOrgId ? sql`and o.id = ${onlyOrgId}::uuid` : sql``}
          and sub.status = 'active'
          and coalesce((select max(s.updated_at) from ${sessions} s where s.user_id = u.id),
                       sub.created_at) <= ${cutoff.toISOString()}::timestamptz
        order by last_active_at asc
        limit ${limit}
      `);
      const now = Date.now();
      return rows.rows.map((r) => {
        const lastActiveAt = new Date(r.last_active_at);
        return {
          orgId: r.org_id,
          orgName: r.org_name,
          plan: r.plan,
          ownerUserId: r.owner_user_id,
          ownerEmail: r.owner_email,
          ownerName: r.owner_name,
          lastActiveAt,
          daysInactive: Math.floor((now - lastActiveAt.getTime()) / (24 * 60 * 60 * 1000)),
          lastCheckInAt: r.last_check_in_at ? new Date(r.last_check_in_at) : null,
        };
      });
    },

    async listActivation(sinceDays = 90, limit = 500) {
      const since = new Date(Date.now() - sinceDays * 24 * 60 * 60 * 1000);
      const rows = await db.execute<{
        org_id: string;
        org_name: string;
        plan: string;
        billing_status: string;
        created_at: Date;
        verified_at: Date | null;
        first_full_scan_at: Date | null;
        first_fix_at: Date | null;
      }>(sql`
        select o.id as org_id, o.name as org_name, o.plan, o.billing_status, o.created_at,
          (select min(si.verified_at) from ${sites} si where si.org_id = o.id and si.deleted_at is null) as verified_at,
          (select min(sc.finished_at) from ${scans} sc
            where sc.org_id = o.id and sc.trigger <> 'onboarding' and sc.status in ('completed', 'partial')) as first_full_scan_at,
          (select min(i.fixed_at) from ${issues} i where i.org_id = o.id and i.status = 'fixed') as first_fix_at
        from ${organizations} o
        where o.deleted_at is null and o.created_at >= ${since.toISOString()}::timestamptz
          and o.billing_status in ('trialing', 'active', 'past_due')
        order by o.created_at desc
        limit ${limit}
      `);
      const items = rows.rows.map((r) => {
        const createdAt = new Date(r.created_at);
        const steps = {
          siteVerified: r.verified_at ? new Date(r.verified_at) : null,
          fullScanCompleted: r.first_full_scan_at ? new Date(r.first_full_scan_at) : null,
          issueFixed: r.first_fix_at ? new Date(r.first_fix_at) : null,
        };
        const res = isOrgActivated(createdAt, {
          siteVerifiedAt: steps.siteVerified,
          fullScanCompletedAt: steps.fullScanCompleted,
          issueFixedAt: steps.issueFixed,
        });
        const times = Object.values(steps);
        return {
          orgId: r.org_id,
          orgName: r.org_name,
          plan: r.plan,
          billingStatus: r.billing_status,
          createdAt,
          daysSinceSignup: Math.floor((Date.now() - createdAt.getTime()) / (24 * 60 * 60 * 1000)),
          steps,
          stepsDone: times.filter(Boolean).length,
          activatedAt: res.activatedAt,
          withinWeek: res.withinWeek,
        };
      });
      const activated = items.filter((i) => i.activatedAt);
      return {
        summary: {
          orgs: items.length,
          activated: activated.length,
          activatedWithinWeek: activated.filter((i) => i.withinWeek).length,
          activationRate: items.length ? activated.length / items.length : 0,
        },
        items,
      };
    },

    async addOrgNote(orgId: OrgId, authorStaffId: string, bodyMd: string) {
      const [row] = await db
        .insert(orgNotes)
        .values({ orgId, authorStaffId, bodyMd })
        .returning();
      return row ?? null;
    },

    async listOrgNotes(orgId: OrgId) {
      return db
        .select({
          id: orgNotes.id,
          bodyMd: orgNotes.bodyMd,
          createdAt: orgNotes.createdAt,
          authorName: sql<string>`coalesce(${staffMembers.displayName}, ${users.name}, 'Staff')`,
          authorStaffId: orgNotes.authorStaffId,
        })
        .from(orgNotes)
        .innerJoin(staffMembers, eq(staffMembers.id, orgNotes.authorStaffId))
        .innerJoin(users, eq(users.id, staffMembers.userId))
        .where(eq(orgNotes.orgId, orgId))
        .orderBy(desc(orgNotes.createdAt));
    },

    async deleteOrgNote(orgId: OrgId, noteId: string) {
      const rows = await db
        .delete(orgNotes)
        .where(and(eq(orgNotes.orgId, orgId), eq(orgNotes.id, noteId)))
        .returning();
      return rows.length > 0;
    },

    async listOrgTags(orgId: OrgId) {
      const rows = await db
        .select({ tag: orgTags.tag })
        .from(orgTags)
        .where(eq(orgTags.orgId, orgId))
        .orderBy(orgTags.tag);
      return rows.map((r) => r.tag);
    },

    async addOrgTag(orgId: OrgId, tag: string) {
      const normalized = tag.trim().toLowerCase();
      if (!normalized) return null;
      const [row] = await db
        .insert(orgTags)
        .values({ orgId, tag: normalized })
        .onConflictDoNothing()
        .returning();
      return row ?? null;
    },

    async removeOrgTag(orgId: OrgId, tag: string) {
      const normalized = tag.trim().toLowerCase();
      const rows = await db
        .delete(orgTags)
        .where(and(eq(orgTags.orgId, orgId), eq(orgTags.tag, normalized)))
        .returning();
      return rows.length > 0;
    },

    async getOrgHealth(orgId: OrgId) {
      const [row] = await db.select().from(orgHealth).where(eq(orgHealth.orgId, orgId)).limit(1);
      return row ?? null;
    },

    async setOrgHealth(orgId: OrgId, score: number, band: HealthBand, reasons: string[]) {
      const [row] = await db
        .insert(orgHealth)
        .values({
          orgId,
          score,
          band,
          reasons,
          computedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: orgHealth.orgId,
          set: {
            score,
            band,
            reasons,
            computedAt: new Date(),
            updatedAt: new Date(),
          },
        })
        .returning();
      return row ?? null;
    },

    async logStaffEmail(data: {
      orgId: OrgId;
      toEmail: string;
      template: string;
      subject: string;
      bodyMd: string;
      sentBy: string;
      resendId?: string;
    }) {
      const [row] = await db
        .insert(staffEmails)
        .values({
          orgId: data.orgId,
          toEmail: data.toEmail,
          template: data.template,
          subject: data.subject,
          bodyMd: data.bodyMd,
          sentBy: data.sentBy,
          resendId: data.resendId,
          status: 'sent',
        })
        .returning();
      return row ?? null;
    },

    async listStaffEmails(orgId: OrgId) {
      return db
        .select({
          id: staffEmails.id,
          toEmail: staffEmails.toEmail,
          template: staffEmails.template,
          subject: staffEmails.subject,
          bodyMd: staffEmails.bodyMd,
          status: staffEmails.status,
          createdAt: staffEmails.createdAt,
          sentByName: staffMembers.displayName,
        })
        .from(staffEmails)
        .innerJoin(staffMembers, eq(staffMembers.id, staffEmails.sentBy))
        .where(eq(staffEmails.orgId, orgId))
        .orderBy(desc(staffEmails.createdAt));
    },

    async getOrgTimeline(orgId: OrgId) {
      const [events, emails, notesList, orgRow] = await Promise.all([
        db
          .select({
            id: auditLog.id,
            action: auditLog.action,
            data: auditLog.data,
            createdAt: auditLog.createdAt,
          })
          .from(auditLog)
          .where(eq(auditLog.orgId, orgId))
          .orderBy(desc(auditLog.createdAt))
          .limit(100),
        db
          .select({
            id: staffEmails.id,
            template: staffEmails.template,
            subject: staffEmails.subject,
            toEmail: staffEmails.toEmail,
            createdAt: staffEmails.createdAt,
          })
          .from(staffEmails)
          .where(eq(staffEmails.orgId, orgId))
          .orderBy(desc(staffEmails.createdAt)),
        this.listOrgNotes(orgId),
        db.select().from(organizations).where(eq(organizations.id, orgId)).limit(1),
      ]);

      type TimelineItem = {
        id: string;
        type: 'event' | 'email' | 'note' | 'signup';
        title: string;
        description?: string;
        timestamp: Date;
      };

      const timeline: TimelineItem[] = [];

      if (orgRow[0]) {
        timeline.push({
          id: `signup-${orgId}`,
          type: 'signup',
          title: 'Organisation created',
          description: `Plan: ${orgRow[0].plan}`,
          timestamp: orgRow[0].createdAt,
        });
      }

      for (const e of events) {
        timeline.push({
          id: e.id,
          type: 'event',
          title: e.action,
          description: Object.keys(e.data || {}).length ? JSON.stringify(e.data) : undefined,
          timestamp: e.createdAt,
        });
      }

      for (const m of emails) {
        timeline.push({
          id: m.id,
          type: 'email',
          title: `Email sent: ${m.subject}`,
          description: `Template: ${m.template} to ${m.toEmail}`,
          timestamp: m.createdAt,
        });
      }

      for (const n of notesList) {
        timeline.push({
          id: n.id,
          type: 'note',
          title: `Staff note by ${n.authorName}`,
          description: n.bodyMd,
          timestamp: n.createdAt,
        });
      }

      timeline.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
      return timeline;
    },

    /* ---------- Customer Segments (P8-20) ---------- */

    async listSegments() {
      return db.select().from(savedSegments).orderBy(desc(savedSegments.createdAt));
    },

    async saveSegment(name: string, filters: Record<string, unknown>, createdBy?: string | null) {
      const [row] = await db
        .insert(savedSegments)
        .values({ name, filters, createdBy })
        .returning();
      return row ?? null;
    },

    async deleteSegment(id: string) {
      const rows = await db.delete(savedSegments).where(eq(savedSegments.id, id)).returning();
      return rows.length > 0;
    },

    /* ---------- Content Management CMS (P8-05 - P8-12) ---------- */

    async listContentPosts(filters: {
      type?: ContentPostType;
      status?: ContentPostStatus;
      tag?: string;
      q?: string;
      limit?: number;
      offset?: number;
      /** 'published': newest publish date first (public site). Default: last edited first (admin). */
      order?: 'published' | 'edited';
      /** The public site also needs the text, guide sections and SEO fields. */
      includeContent?: boolean;
    }) {
      const conditions: SQL[] = [];
      if (filters.type) conditions.push(eq(contentPosts.type, filters.type));
      if (filters.status) conditions.push(eq(contentPosts.status, filters.status));
      if (filters.tag) conditions.push(sql`${filters.tag} = any(${contentPosts.tags})`);
      if (filters.q) {
        const pattern = `%${filters.q.replace(/[%_\\]/g, '\\$&')}%`;
        conditions.push(or(ilike(contentPosts.title, pattern), ilike(contentPosts.slug, pattern))!);
      }

      const limit = filters.limit ?? 50;
      const offset = filters.offset ?? 0;

      const rows = await db
        .select({
          id: contentPosts.id,
          type: contentPosts.type,
          slug: contentPosts.slug,
          title: contentPosts.title,
          excerpt: contentPosts.excerpt,
          status: contentPosts.status,
          tags: contentPosts.tags,
          authorStaffId: contentPosts.authorStaffId,
          authorName: sql<string>`coalesce(${staffMembers.displayName}, ${users.name}, 'Staff')`,
          authorJobTitle: staffMembers.jobTitle,
          coverMediaId: contentPosts.coverMediaId,
          coverUrl: sql<string | null>`${mediaAssets.variants}->>'url'`,
          coverAlt: contentPosts.coverAlt,
          publishAt: contentPosts.publishAt,
          publishedAt: contentPosts.publishedAt,
          createdAt: contentPosts.createdAt,
          updatedAt: contentPosts.updatedAt,
          ruleId: contentPosts.ruleId,
          platform: contentPosts.platform,
          reviewedAt: contentPosts.reviewedAt,
          bodyMd: filters.includeContent ? contentPosts.bodyMd : sql<string>`''`,
          sections: filters.includeContent ? contentPosts.sections : sql<null>`null`,
          seoTitle: contentPosts.seoTitle,
          seoDescription: contentPosts.seoDescription,
          canonicalUrl: contentPosts.canonicalUrl,
          noindex: contentPosts.noindex,
        })
        .from(contentPosts)
        .innerJoin(staffMembers, eq(staffMembers.id, contentPosts.authorStaffId))
        .innerJoin(users, eq(users.id, staffMembers.userId))
        .leftJoin(mediaAssets, eq(mediaAssets.id, contentPosts.coverMediaId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(
          ...(filters.order === 'published'
            ? [desc(contentPosts.publishedAt), desc(contentPosts.createdAt)]
            : [desc(contentPosts.updatedAt), desc(contentPosts.createdAt)]),
        )
        .limit(limit + 1)
        .offset(offset);

      const hasMore = rows.length > limit;
      return {
        items: rows.slice(0, limit),
        nextOffset: hasMore ? offset + limit : null,
      };
    },

    async findContentPostById(id: string) {
      const [row] = await db
        .select({
          post: contentPosts,
          authorName: sql<string>`coalesce(${staffMembers.displayName}, ${users.name}, 'Staff')`,
          authorJobTitle: staffMembers.jobTitle,
          authorBio: staffMembers.bio,
          authorAvatarKey: staffMembers.avatarKey,
        })
        .from(contentPosts)
        .innerJoin(staffMembers, eq(staffMembers.id, contentPosts.authorStaffId))
        .innerJoin(users, eq(users.id, staffMembers.userId))
        .where(eq(contentPosts.id, id))
        .limit(1);

      if (!row) return null;
      return {
        ...row.post,
        author: {
          id: row.post.authorStaffId,
          name: row.authorName,
          jobTitle: row.authorJobTitle,
          bio: row.authorBio,
          avatarKey: row.authorAvatarKey,
        },
      };
    },

    async findContentPostBySlug(type: ContentPostType, slug: string) {
      const [row] = await db
        .select({
          post: contentPosts,
          authorName: sql<string>`coalesce(${staffMembers.displayName}, ${users.name}, 'Staff')`,
          authorJobTitle: staffMembers.jobTitle,
          authorBio: staffMembers.bio,
          authorAvatarKey: staffMembers.avatarKey,
          coverUrl: sql<string | null>`${mediaAssets.variants}->>'url'`,
          ogUrl: sql<string | null>`(select ${mediaAssets.variants}->>'url' from ${mediaAssets} where ${mediaAssets.id} = ${contentPosts.ogMediaId})`,
        })
        .from(contentPosts)
        .innerJoin(staffMembers, eq(staffMembers.id, contentPosts.authorStaffId))
        .innerJoin(users, eq(users.id, staffMembers.userId))
        .leftJoin(mediaAssets, eq(mediaAssets.id, contentPosts.coverMediaId))
        .where(and(eq(contentPosts.type, type), eq(contentPosts.slug, slug)))
        .limit(1);

      if (!row) return null;
      return {
        ...row.post,
        coverUrl: row.coverUrl,
        ogUrl: row.ogUrl,
        author: {
          id: row.post.authorStaffId,
          name: row.authorName,
          jobTitle: row.authorJobTitle,
          bio: row.authorBio,
          avatarKey: row.authorAvatarKey,
        },
      };
    },

    async createContentPost(data: typeof contentPosts.$inferInsert) {
      const [row] = await db.insert(contentPosts).values(data).returning();
      return row ?? null;
    },

    async updateContentPost(
      id: string,
      data: Partial<typeof contentPosts.$inferInsert>,
      updatedByUserId?: string,
    ) {
      const current = await this.findContentPostById(id);
      if (!current) return null;

      // A live post that gets a new slug keeps its old address through a 301 (P8-09).
      const redirect = slugChangeRedirect(current, data);
      if (redirect) await this.addRedirect(redirect.from, redirect.to, updatedByUserId ?? null, 301);

      const [updated] = await db
        .update(contentPosts)
        .set({ ...data, updatedAt: new Date(), updatedBy: updatedByUserId ?? null })
        .where(eq(contentPosts.id, id))
        .returning();

      // Save revision if post is published
      if (updated && (updated.status === 'published' || current.status === 'published')) {
        await this.savePostRevision(id, updated, updatedByUserId ?? null);
      }
      await syncFixGuide(updated);

      return updated ?? null;
    },

    async deleteContentPost(id: string) {
      const current = await this.findContentPostById(id);
      const rows = await db.delete(contentPosts).where(eq(contentPosts.id, id)).returning();
      // A deleted guide must also leave the in-app panel.
      if (rows.length > 0 && current) await syncFixGuide({ ...current, status: 'archived' } as never);
      return rows.length > 0;
    },

    async publishContentPost(id: string, publishedAt = new Date()) {
      const [row] = await db
        .update(contentPosts)
        .set({ status: 'published', publishedAt, updatedAt: new Date() })
        .where(eq(contentPosts.id, id))
        .returning();
      await syncFixGuide(row);
      return row ?? null;
    },

    async unpublishContentPost(id: string) {
      const [row] = await db
        .update(contentPosts)
        .set({ status: 'draft', updatedAt: new Date() })
        .where(eq(contentPosts.id, id))
        .returning();
      await syncFixGuide(row);
      return row ?? null;
    },

    async scheduleContentPost(id: string, publishAt: Date) {
      const [row] = await db
        .update(contentPosts)
        .set({ status: 'scheduled', publishAt, updatedAt: new Date() })
        .where(eq(contentPosts.id, id))
        .returning();
      return row ?? null;
    },

    async listDueScheduledPosts(now = new Date()) {
      return db
        .select()
        .from(contentPosts)
        .where(and(eq(contentPosts.status, 'scheduled'), lte(contentPosts.publishAt, now)));
    },

    /* ---------- Revisions & Redirects (P8-09) ---------- */

    async savePostRevision(postId: string, data: Record<string, unknown>, createdBy: string | null, note?: string) {
      const [latest] = await db
        .select({ version: contentRevisions.version })
        .from(contentRevisions)
        .where(eq(contentRevisions.postId, postId))
        .orderBy(desc(contentRevisions.version))
        .limit(1);

      const nextVersion = (latest?.version ?? 0) + 1;
      const [row] = await db
        .insert(contentRevisions)
        .values({
          postId,
          version: nextVersion,
          data,
          createdBy,
          note: note ?? `Revision ${nextVersion}`,
        })
        .returning();
      return row ?? null;
    },

    async listRevisions(postId: string) {
      return db
        .select({
          id: contentRevisions.id,
          postId: contentRevisions.postId,
          version: contentRevisions.version,
          data: contentRevisions.data,
          note: contentRevisions.note,
          createdAt: contentRevisions.createdAt,
          createdByName: users.name,
        })
        .from(contentRevisions)
        .leftJoin(users, eq(users.id, contentRevisions.createdBy))
        .where(eq(contentRevisions.postId, postId))
        .orderBy(desc(contentRevisions.version));
    },

    async findRevision(postId: string, version: number) {
      const [row] = await db
        .select()
        .from(contentRevisions)
        .where(and(eq(contentRevisions.postId, postId), eq(contentRevisions.version, version)))
        .limit(1);
      return row ?? null;
    },

    async restoreRevision(postId: string, version: number, restoredBy: string) {
      const rev = await this.findRevision(postId, version);
      if (!rev) return null;
      const postData = rev.data as Partial<typeof contentPosts.$inferInsert>;
      return this.updateContentPost(postId, postData, restoredBy);
    },

    async listRedirects() {
      return db.select().from(redirects).orderBy(desc(redirects.createdAt));
    },

    async addRedirect(fromPath: string, toPath: string, createdBy: string | null = null, statusCode = 301) {
      const normalizedFrom = fromPath.startsWith('/') ? fromPath : `/${fromPath}`;
      const normalizedTo = toPath.startsWith('/') ? toPath : `/${toPath}`;
      const [row] = await db
        .insert(redirects)
        .values({
          fromPath: normalizedFrom,
          toPath: normalizedTo,
          statusCode,
          createdBy,
        })
        .onConflictDoUpdate({
          target: redirects.fromPath,
          set: {
            toPath: normalizedTo,
            statusCode,
            updatedAt: new Date(),
          },
        })
        .returning();
      return row ?? null;
    },

    /* ---------- Content Pages (P8-05, P8-17, P8-18) ---------- */

    async getPage(pageKey: string) {
      const [row] = await db.select().from(contentPages).where(eq(contentPages.pageKey, pageKey)).limit(1);
      return row ?? null;
    },

    async listPages() {
      return db.select().from(contentPages).orderBy(contentPages.pageKey);
    },

    /**
     * Saves the working draft only. The published version lives in content_revisions, so
     * editing never changes what the site is serving until the next publish.
     */
    async savePageDraft(pageKey: string, data: Record<string, unknown>, updatedBy: string | null) {
      const [row] = await db
        .insert(contentPages)
        .values({ pageKey, data, status: 'draft', publishedVersion: 0, publishedBy: updatedBy })
        .onConflictDoUpdate({
          target: contentPages.pageKey,
          set: { data, updatedAt: new Date() },
        })
        .returning();
      return row ?? null;
    },

    /** Publishes the current draft as the next numbered version. */
    async publishPage(
      pageKey: string,
      publishedBy: string | null,
      opts: { effectiveDate?: Date; changeSummary?: string } = {},
    ) {
      return db.transaction(async (tx) => {
        const [page] = await tx.select().from(contentPages).where(eq(contentPages.pageKey, pageKey)).limit(1);
        if (!page) return null;
        const [latest] = await tx
          .select({ v: sql<number>`coalesce(max(${contentRevisions.version}), 0)::int` })
          .from(contentRevisions)
          .where(eq(contentRevisions.pageKey, pageKey));
        const version = (latest?.v ?? 0) + 1;
        const now = new Date();
        const effectiveDate = opts.effectiveDate ?? now;
        await tx.insert(contentRevisions).values({
          pageKey,
          version,
          data: page.data,
          createdBy: publishedBy,
          note: `Published version ${version}`,
          effectiveDate,
          changeSummary: opts.changeSummary ?? null,
        });
        const [row] = await tx
          .update(contentPages)
          .set({
            status: 'published',
            publishedVersion: version,
            publishedAt: now,
            publishedBy,
            effectiveDate,
            updatedAt: now,
          })
          .where(eq(contentPages.id, page.id))
          .returning();
        return row ?? null;
      });
    },

    /** What the public site serves: the revision for the published version, never the draft. */
    async getPublishedPage(pageKey: string) {
      const [page] = await db.select().from(contentPages).where(eq(contentPages.pageKey, pageKey)).limit(1);
      if (!page || page.status !== 'published' || page.publishedVersion < 1) return null;
      const [rev] = await db
        .select()
        .from(contentRevisions)
        .where(and(eq(contentRevisions.pageKey, pageKey), eq(contentRevisions.version, page.publishedVersion)))
        .limit(1);
      if (!rev) return null;
      return {
        pageKey,
        data: rev.data,
        version: rev.version,
        effectiveDate: rev.effectiveDate,
        publishedAt: page.publishedAt,
      };
    },

    async listPageVersions(pageKey: string) {
      return db
        .select({
          version: contentRevisions.version,
          effectiveDate: contentRevisions.effectiveDate,
          changeSummary: contentRevisions.changeSummary,
          publishedAt: contentRevisions.createdAt,
        })
        .from(contentRevisions)
        .where(eq(contentRevisions.pageKey, pageKey))
        .orderBy(desc(contentRevisions.version));
    },

    async getPageVersion(pageKey: string, version: number) {
      const [rev] = await db
        .select()
        .from(contentRevisions)
        .where(and(eq(contentRevisions.pageKey, pageKey), eq(contentRevisions.version, version)))
        .limit(1);
      return rev
        ? {
            pageKey,
            data: rev.data,
            version: rev.version,
            effectiveDate: rev.effectiveDate,
            publishedAt: rev.createdAt,
            changeSummary: rev.changeSummary,
          }
        : null;
    },

    /** Published changelog entries dated within [from, to] (YYYY-MM-DD), oldest first. */
    async listPublishedChangelogBetween(from: string, to: string) {
      return db
        .select()
        .from(changelogEntries)
        .where(
          and(eq(changelogEntries.status, 'published'), gte(changelogEntries.date, from), lte(changelogEntries.date, to)),
        )
        .orderBy(changelogEntries.date);
    },

    /**
     * Owners and admins of live organisations for the monthly product-updates email. Anyone
     * who turned digests off in any of their organisations is left out.
     */
    async listChangelogDigestRecipients(): Promise<string[]> {
      const rows = await db.execute<{ email: string }>(sql`
        select lower(u.email::text) as email
        from ${memberships} m
        join ${users} u on u.id = m.user_id
        join ${organizations} o on o.id = m.org_id
        left join notification_preferences np on np.user_id = u.id and np.org_id = o.id
        where o.deleted_at is null and m.role in ('owner', 'admin')
          and u.email is not null and u.email_verified = true and u.deleted_at is null
        group by 1
        having bool_and(coalesce(np.weekly_digest, true))
        order by 1
      `);
      return rows.rows.map((r) => r.email);
    },

    /* ---------- Legal change notices (staff spec 3.5) ---------- */

    async createLegalNotice(data: { pageKey: string; version: number; summary: string; linkUrl: string; createdBy: string | null }) {
      const [row] = await db.insert(legalNotices).values(data).returning();
      return row ?? null;
    },

    async getLegalNotice(id: string) {
      const [row] = await db.select().from(legalNotices).where(eq(legalNotices.id, id)).limit(1);
      return row ?? null;
    },

    async updateLegalNotice(id: string, data: Partial<typeof legalNotices.$inferInsert>) {
      const [row] = await db
        .update(legalNotices)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(legalNotices.id, id))
        .returning();
      return row ?? null;
    },

    /** One address per account owner/admin of every live organisation, sorted so a retry can resume. */
    async listLegalNoticeRecipients(): Promise<string[]> {
      const rows = await db.execute<{ email: string }>(sql`
        select distinct lower(u.email::text) as email
        from ${memberships} m
        join ${users} u on u.id = m.user_id
        join ${organizations} o on o.id = m.org_id
        where o.deleted_at is null and m.role in ('owner', 'admin')
          and u.email is not null and u.email_verified = true
        order by 1
      `);
      return rows.rows.map((r) => r.email);
    },

    /* ---------- Media Assets (P8-08, S-99) ---------- */

    async listMedia(filters: { q?: string; mime?: string; limit?: number; offset?: number } = {}) {
      const conditions: SQL[] = [];
      if (filters.mime) conditions.push(ilike(mediaAssets.mime, `%${filters.mime}%`));
      if (filters.q) {
        const pattern = `%${filters.q.replace(/[%_\\]/g, '\\$&')}%`;
        conditions.push(or(ilike(mediaAssets.filename, pattern), ilike(mediaAssets.altText, pattern))!);
      }

      const limit = filters.limit ?? 50;
      const offset = filters.offset ?? 0;

      const rows = await db
        .select()
        .from(mediaAssets)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(mediaAssets.createdAt))
        .limit(limit + 1)
        .offset(offset);

      const hasMore = rows.length > limit;
      return {
        items: rows.slice(0, limit),
        nextOffset: hasMore ? offset + limit : null,
      };
    },

    async findMediaById(id: string) {
      const [row] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, id)).limit(1);
      return row ?? null;
    },

    async createMedia(data: typeof mediaAssets.$inferInsert) {
      const [row] = await db.insert(mediaAssets).values(data).returning();
      return row ?? null;
    },

    async updateMedia(id: string, data: Partial<typeof mediaAssets.$inferInsert>) {
      const [row] = await db
        .update(mediaAssets)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(mediaAssets.id, id))
        .returning();
      return row ?? null;
    },

    /** Where a media file is used: post covers and OG images, post bodies, and site page sections. */
    async checkMediaUsage(mediaId: string): Promise<{ type: string; id: string; title: string }[]> {
      const usages: { type: string; id: string; title: string }[] = [];
      const [asset] = await db.select().from(mediaAssets).where(eq(mediaAssets.id, mediaId)).limit(1);
      const url = (asset?.variants as { url?: string } | null)?.url;
      const escapeLike = (v: string) => v.replace(/[%_\\]/g, '\\$&');

      const posts = await db
        .select({ id: contentPosts.id, title: contentPosts.title })
        .from(contentPosts)
        .where(
          or(
            eq(contentPosts.coverMediaId, mediaId),
            eq(contentPosts.ogMediaId, mediaId),
            url ? ilike(contentPosts.bodyMd, `%${escapeLike(url)}%`) : sql`false`,
          ),
        );
      for (const p of posts) usages.push({ type: 'content_post', id: p.id, title: p.title });

      const pages = await db
        .select({ id: contentPages.id, key: contentPages.pageKey })
        .from(contentPages)
        .where(
          or(
            sql`${contentPages.data}::text like ${`%${mediaId}%`}`,
            url ? sql`${contentPages.data}::text like ${`%${url}%`}` : sql`false`,
          ),
        );
      for (const p of pages) usages.push({ type: 'content_page', id: p.id, title: p.key });
      return usages;
    },

    async deleteMedia(id: string) {
      const usages = await this.checkMediaUsage(id);
      if (usages.length > 0) {
        throw new AppError(
          409,
          ErrorCode.CONFLICT,
          `Cannot delete media: it is currently used in ${usages.length} places.`,
          { usages },
        );
      }
      const rows = await db.delete(mediaAssets).where(eq(mediaAssets.id, id)).returning();
      return rows.length > 0;
    },

    /* ---------- Banners (P8-12, S-100) ---------- */

    async listBanners(surface?: BannerSurface) {
      const conditions: SQL[] = [];
      if (surface) {
        conditions.push(or(eq(banners.surface, surface), eq(banners.surface, 'both'))!);
      }
      return db
        .select()
        .from(banners)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(banners.createdAt));
    },

    async getActiveBanner(surface: BannerSurface) {
      const now = new Date();
      const [row] = await db
        .select()
        .from(banners)
        .where(
          and(
            eq(banners.active, true),
            or(eq(banners.surface, surface), eq(banners.surface, 'both')),
            or(isNull(banners.startsAt), lte(banners.startsAt, now)),
            or(isNull(banners.endsAt), gte(banners.endsAt, now)),
          ),
        )
        .orderBy(desc(banners.createdAt))
        .limit(1);
      return row ?? null;
    },

    async createBanner(data: typeof banners.$inferInsert) {
      const [row] = await db.insert(banners).values(data).returning();
      return row ?? null;
    },

    async updateBanner(id: string, data: Partial<typeof banners.$inferInsert>) {
      const [row] = await db
        .update(banners)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(banners.id, id))
        .returning();
      return row ?? null;
    },

    async deleteBanner(id: string) {
      const rows = await db.delete(banners).where(eq(banners.id, id)).returning();
      return rows.length > 0;
    },

    /* ---------- Changelog (P8-12, S-97) ---------- */

    async listChangelog(onlyPublished = false) {
      const conditions: SQL[] = [];
      if (onlyPublished) conditions.push(eq(changelogEntries.status, 'published'));
      return db
        .select()
        .from(changelogEntries)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(changelogEntries.date), desc(changelogEntries.createdAt));
    },

    async createChangelog(data: typeof changelogEntries.$inferInsert) {
      const [row] = await db.insert(changelogEntries).values(data).returning();
      return row ?? null;
    },

    async updateChangelog(id: string, data: Partial<typeof changelogEntries.$inferInsert>) {
      const [row] = await db
        .update(changelogEntries)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(changelogEntries.id, id))
        .returning();
      return row ?? null;
    },

    async deleteChangelog(id: string) {
      const rows = await db
        .delete(changelogEntries)
        .where(eq(changelogEntries.id, id))
        .returning();
      return rows.length > 0;
    },

    /* ---------- Site Settings & Deploys (P8-07, P8-21) ---------- */

    async getSiteSettings() {
      const [row] = await db.select().from(siteSettings).where(eq(siteSettings.id, 'default')).limit(1);
      if (row) return row;
      const [created] = await db
        .insert(siteSettings)
        .values({ id: 'default' })
        .onConflictDoNothing()
        .returning();
      return created ?? {
        id: 'default',
        supportEmail: 'support@everyvisitor.app',
        bannedWords: ['compliant', 'compliance guaranteed', 'ada-proof', 'lawsuit-proof', 'certified', '100% accessible'],
        maintenanceMode: false,
        deployHookConfigured: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
    },

    async updateSiteSettings(data: Partial<typeof siteSettings.$inferInsert>) {
      const [row] = await db
        .insert(siteSettings)
        .values({ id: 'default', ...data })
        .onConflictDoUpdate({
          target: siteSettings.id,
          set: { ...data, updatedAt: new Date() },
        })
        .returning();
      return row ?? null;
    },

    async listSiteDeploys(limit = 20) {
      return db
        .select({
          id: siteDeploys.id,
          trigger: siteDeploys.trigger,
          status: siteDeploys.status,
          startedAt: siteDeploys.startedAt,
          finishedAt: siteDeploys.finishedAt,
          error: siteDeploys.error,
          requestedByName: users.name,
        })
        .from(siteDeploys)
        .leftJoin(users, eq(users.id, siteDeploys.requestedBy))
        .orderBy(desc(siteDeploys.createdAt))
        .limit(limit);
    },

    async createSiteDeploy(trigger: 'publish' | 'manual' | 'schedule', requestedBy: string | null) {
      const [row] = await db
        .insert(siteDeploys)
        .values({ trigger, requestedBy, status: 'queued', startedAt: new Date() })
        .returning();
      return row ?? null;
    },

    async updateSiteDeploy(id: string, data: Partial<typeof siteDeploys.$inferInsert>) {
      const [row] = await db
        .update(siteDeploys)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(siteDeploys.id, id))
        .returning();
      return row ?? null;
    },

    async listDeploysByStatus(statuses: SiteDeployStatus[]) {
      return db
        .select()
        .from(siteDeploys)
        .where(inArray(siteDeploys.status, statuses))
        .orderBy(desc(siteDeploys.createdAt));
    },

    async getLatestDeploy() {
      const [row] = await db.select().from(siteDeploys).orderBy(desc(siteDeploys.createdAt)).limit(1);
      return row ?? null;
    },

    /* ---------- Metrics & Analytics (P8-02, P8-13, P8-14, P8-15, P8-16) ---------- */

    async recordDailyMetric(date: string, metric: string, value: number, dimension: string | null = null) {
      const dimCond = dimension ? eq(metricsDaily.dimension, dimension) : isNull(metricsDaily.dimension);
      const existing = await db
        .select({ id: metricsDaily.id })
        .from(metricsDaily)
        .where(and(eq(metricsDaily.date, date), eq(metricsDaily.metric, metric), dimCond))
        .limit(1);

      if (existing[0]) {
        await db
          .update(metricsDaily)
          .set({ value: String(value), updatedAt: new Date() })
          .where(eq(metricsDaily.id, existing[0].id));
      } else {
        await db.insert(metricsDaily).values({
          date,
          metric,
          dimension: dimension ?? null,
          value: String(value),
        });
      }
    },

    async queryMetrics(
      metric: string,
      from: string,
      to: string,
      dimension: string | null = null,
    ) {
      const conditions: SQL[] = [
        eq(metricsDaily.metric, metric),
        gte(metricsDaily.date, from),
        lte(metricsDaily.date, to),
      ];
      if (dimension !== null && dimension !== undefined) {
        conditions.push(eq(metricsDaily.dimension, dimension));
      }
      return db
        .select({
          date: metricsDaily.date,
          metric: metricsDaily.metric,
          dimension: metricsDaily.dimension,
          value: sql<number>`${metricsDaily.value}::numeric`,
        })
        .from(metricsDaily)
        .where(and(...conditions))
        .orderBy(metricsDaily.date);
    },

    async getAnalyticsCache<T = unknown>(cacheKey: string): Promise<T | null> {
      const now = new Date();
      const [row] = await db
        .select()
        .from(analyticsCache)
        .where(and(eq(analyticsCache.cacheKey, cacheKey), gte(analyticsCache.expiresAt, now)))
        .limit(1);
      return (row?.payload as T) ?? null;
    },

    async setAnalyticsCache(cacheKey: string, payload: unknown, ttlSeconds = 3600) {
      const now = new Date();
      const expiresAt = new Date(now.getTime() + ttlSeconds * 1000);
      await db
        .insert(analyticsCache)
        .values({
          cacheKey,
          payload: payload,
          fetchedAt: now,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: analyticsCache.cacheKey,
          set: {
            payload: payload,
            fetchedAt: now,
            expiresAt,
            updatedAt: now,
          },
        });
    },

    /* ---------- Fix Guides Coverage View (P8-11) ---------- */

    async getGuideCoverage() {
      // Top 50 rules by scan issue occurrences or rules table
      const topRules = await db
        .select({
          ruleId: rules.ruleId,
          title: rules.title,
          occurrences: sql<number>`coalesce((select count(*)::int from ${issues} where ${issues.ruleId} = ${rules.ruleId}), 0)`,
        })
        .from(rules)
        .orderBy(desc(sql`coalesce((select count(*)::int from ${issues} where ${issues.ruleId} = ${rules.ruleId}), 0)`))
        .limit(50);

      const publishedGuides = await db
        .select({
          ruleId: contentPosts.ruleId,
          platform: contentPosts.platform,
          slug: contentPosts.slug,
          status: contentPosts.status,
          reviewedAt: contentPosts.reviewedAt,
        })
        .from(contentPosts)
        .where(and(eq(contentPosts.type, 'guide'), isNotNull(contentPosts.ruleId)));

      const guideMap = new Map<string, { slug: string; status: string; reviewed: boolean }>();
      for (const g of publishedGuides) {
        if (g.ruleId && g.platform) {
          guideMap.set(`${g.ruleId}:${g.platform.toLowerCase()}`, {
            slug: g.slug,
            status: g.status,
            reviewed: Boolean(g.reviewedAt),
          });
        }
      }

      return topRules.map((r) => ({
        ruleId: r.ruleId,
        title: r.title,
        occurrences: r.occurrences,
        platforms: {
          shopify: guideMap.get(`${r.ruleId}:shopify`) ?? null,
          wordpress: guideMap.get(`${r.ruleId}:wordpress`) ?? null,
          generic: guideMap.get(`${r.ruleId}:generic`) ?? null,
        },
      }));
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

    async listGlobalAuditLog(params: {
      action?: string;
      actorType?: string;
      staffOnly?: boolean;
      q?: string;
      limit?: number;
      offset?: number;
    }) {
      const conditions: SQL[] = [];
      if (params.staffOnly || params.actorType === 'staff') {
        conditions.push(eq(auditLog.actorType, 'staff'));
      } else if (params.actorType) {
        conditions.push(eq(auditLog.actorType, params.actorType as ActorType));
      }
      if (params.action) {
        conditions.push(
          params.action.endsWith('.')
            ? sql`${auditLog.action} like ${params.action.replace(/[%_]/g, '') + '%'}`
            : eq(auditLog.action, params.action),
        );
      }
      if (params.q) {
        const pattern = `%${params.q.replace(/[%_\\]/g, '\\$&')}%`;
        conditions.push(
          or(
            ilike(auditLog.action, pattern),
            ilike(auditLog.targetType, pattern),
            ilike(auditLog.targetId, pattern),
            ilike(users.name, pattern),
            ilike(sql`${users.email}::text`, pattern),
          )!,
        );
      }

      const limit = params.limit ?? 50;
      const offset = params.offset ?? 0;

      const items = await db
        .select({
          id: auditLog.id,
          orgId: auditLog.orgId,
          action: auditLog.action,
          actorType: auditLog.actorType,
          actorId: auditLog.actorId,
          actorName: users.name,
          actorEmail: users.email,
          targetType: auditLog.targetType,
          targetId: auditLog.targetId,
          ip: auditLog.ip,
          userAgent: auditLog.userAgent,
          data: auditLog.data,
          createdAt: auditLog.createdAt,
        })
        .from(auditLog)
        .leftJoin(users, eq(users.id, auditLog.actorId))
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(auditLog.createdAt))
        .limit(limit + 1)
        .offset(offset);

      const hasMore = items.length > limit;
      const slice = hasMore ? items.slice(0, limit) : items;
      return {
        items: slice,
        nextCursor: hasMore ? String(offset + limit) : null,
      };
    },
  };
}

export type StaffRepository = ReturnType<typeof staffRepository>;
