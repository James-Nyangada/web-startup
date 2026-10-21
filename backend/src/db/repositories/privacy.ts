import { and, desc, eq, inArray, isNotNull, isNull, lt, ne, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  accounts,
  auditLog,
  clientAccess,
  dataExports,
  inAppNotifications,
  issueNotes,
  manualChecks,
  memberships,
  notificationPreferences,
  organizations,
  sessions,
  subscriptions,
  users,
  type DataExportStatus,
} from '../schema/index.js';

/** Download links for a personal data export stay valid this long (spec 11.5). */
export const DATA_EXPORT_TTL_MS = 7 * 24 * 60 * 60 * 1000;

export type DataExportRow = typeof dataExports.$inferSelect;

export interface AccountDeletionCheck {
  allowed: boolean;
  /** Orgs that stop the deletion, with the reason for each. */
  blockers: Array<{
    orgId: string;
    orgName: string;
    reason: 'active_subscription' | 'other_members';
  }>;
  /** Orgs the user owns alone with no paying subscription: deleted with the account. */
  soloOrgIds: string[];
}

/** GDPR operations (P6-09): personal data export and account deletion. Not tenant scoped. */
export function privacyRepository(db: Database) {
  return {
    async createExport(userId: string): Promise<DataExportRow> {
      const [row] = await db.insert(dataExports).values({ userId }).returning();
      return row!;
    },

    async findExport(userId: string, id: string): Promise<DataExportRow | null> {
      const [row] = await db
        .select()
        .from(dataExports)
        .where(and(eq(dataExports.id, id), eq(dataExports.userId, userId)))
        .limit(1);
      return row ?? null;
    },

    async findExportById(id: string): Promise<DataExportRow | null> {
      const [row] = await db.select().from(dataExports).where(eq(dataExports.id, id)).limit(1);
      return row ?? null;
    },

    async listExports(userId: string, limit = 5): Promise<DataExportRow[]> {
      return db
        .select()
        .from(dataExports)
        .where(eq(dataExports.userId, userId))
        .orderBy(desc(dataExports.createdAt))
        .limit(limit);
    },

    /** Ready exports past their expiry that still have a file in storage. */
    async listExpiredExports(now = new Date()) {
      return db
        .select({ id: dataExports.id, fileKey: dataExports.fileKey })
        .from(dataExports)
        .where(and(isNotNull(dataExports.fileKey), lt(dataExports.expiresAt, now)));
    },

    async clearExportFile(id: string) {
      await db.update(dataExports).set({ fileKey: null }).where(eq(dataExports.id, id));
    },

    async updateExport(
      id: string,
      patch: {
        status: DataExportStatus;
        fileKey?: string | null;
        fileSize?: number | null;
        error?: string | null;
        expiresAt?: Date | null;
      },
    ) {
      await db.update(dataExports).set(patch).where(eq(dataExports.id, id));
    },

    /**
     * Everything we hold about one person: profile, roles, sign-in history, preferences,
     * notifications, what they wrote and what they did. Tenant data they did not author
     * (sites, scans, issues) belongs to the organisation and is exported from there.
     */
    async collectPersonalData(userId: string) {
      const [user] = await db
        .select({
          id: users.id,
          email: users.email,
          name: users.name,
          timeZone: users.timeZone,
          avatarUrl: users.avatarUrl,
          emailVerifiedAt: users.emailVerifiedAt,
          createdAt: users.createdAt,
          updatedAt: users.updatedAt,
        })
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!user) return null;

      const [
        orgRoles,
        clientSites,
        signIns,
        linkedAccounts,
        preferences,
        notifications,
        notes,
        checks,
        activity,
      ] = await Promise.all([
        db
          .select({
            orgId: memberships.orgId,
            orgName: organizations.name,
            role: memberships.role,
            since: memberships.createdAt,
          })
          .from(memberships)
          .innerJoin(organizations, eq(organizations.id, memberships.orgId))
          .where(eq(memberships.userId, userId)),
        db
          .select({
            orgId: clientAccess.orgId,
            siteId: clientAccess.siteId,
            since: clientAccess.createdAt,
          })
          .from(clientAccess)
          .where(eq(clientAccess.userId, userId)),
        db
          .select({
            createdAt: sessions.createdAt,
            expiresAt: sessions.expiresAt,
            ipAddress: sessions.ipAddress,
            userAgent: sessions.userAgent,
          })
          .from(sessions)
          .where(eq(sessions.userId, userId))
          .orderBy(desc(sessions.createdAt)),
        db
          .select({ providerId: accounts.providerId, createdAt: accounts.createdAt })
          .from(accounts)
          .where(eq(accounts.userId, userId)),
        db.select().from(notificationPreferences).where(eq(notificationPreferences.userId, userId)),
        db
          .select({
            orgId: inAppNotifications.orgId,
            type: inAppNotifications.type,
            title: inAppNotifications.title,
            body: inAppNotifications.body,
            readAt: inAppNotifications.readAt,
            createdAt: inAppNotifications.createdAt,
          })
          .from(inAppNotifications)
          .where(eq(inAppNotifications.userId, userId))
          .orderBy(desc(inAppNotifications.createdAt)),
        db
          .select({
            orgId: issueNotes.orgId,
            issueId: issueNotes.issueId,
            body: issueNotes.body,
            visibleToClient: issueNotes.visibleToClient,
            createdAt: issueNotes.createdAt,
          })
          .from(issueNotes)
          .where(and(eq(issueNotes.authorId, userId), isNull(issueNotes.deletedAt))),
        db
          .select({
            id: manualChecks.id,
            orgId: manualChecks.orgId,
            siteId: manualChecks.siteId,
            checkType: manualChecks.checkType,
            performedAt: manualChecks.performedAt,
            performedByName: manualChecks.performedByName,
            tool: manualChecks.tool,
            result: manualChecks.result,
            notes: manualChecks.notes,
            attachmentKey: manualChecks.attachmentKey,
            createdAt: manualChecks.createdAt,
          })
          .from(manualChecks)
          .where(eq(manualChecks.createdBy, userId)),
        db
          .select({
            orgId: auditLog.orgId,
            action: auditLog.action,
            targetType: auditLog.targetType,
            targetId: auditLog.targetId,
            ip: auditLog.ip,
            userAgent: auditLog.userAgent,
            createdAt: auditLog.createdAt,
          })
          .from(auditLog)
          .where(eq(auditLog.actorId, userId))
          .orderBy(desc(auditLog.createdAt))
          .limit(5000),
      ]);

      return {
        user,
        memberships: orgRoles,
        clientAccess: clientSites,
        sessions: signIns,
        linkedAccounts,
        notificationPreferences: preferences,
        notifications,
        issueNotes: notes,
        manualChecks: checks,
        activity,
      };
    },

    /**
     * Decides whether an account can be deleted (spec 7.1). An owner must first hand over any
     * org that has other members, and cannot delete while an org they own is paying.
     */
    async checkAccountDeletion(userId: string): Promise<AccountDeletionCheck> {
      const owned = await db
        .select({
          orgId: organizations.id,
          orgName: organizations.name,
          billingStatus: organizations.billingStatus,
          subscriptionStatus: subscriptions.status,
          otherMembers: sql<number>`(select count(*)::int from ${memberships} m2 where m2.org_id = ${organizations.id} and m2.user_id <> ${userId})`,
        })
        .from(memberships)
        .innerJoin(organizations, eq(organizations.id, memberships.orgId))
        .leftJoin(subscriptions, eq(subscriptions.orgId, organizations.id))
        .where(
          and(
            eq(memberships.userId, userId),
            eq(memberships.role, 'owner'),
            isNull(organizations.deletedAt),
          ),
        );

      const blockers: AccountDeletionCheck['blockers'] = [];
      const soloOrgIds: string[] = [];
      for (const org of owned) {
        const paying =
          org.billingStatus === 'active' ||
          org.billingStatus === 'past_due' ||
          (org.subscriptionStatus !== null &&
            ['active', 'past_due'].includes(org.subscriptionStatus));
        if (paying) {
          blockers.push({ orgId: org.orgId, orgName: org.orgName, reason: 'active_subscription' });
        } else if (org.otherMembers > 0) {
          blockers.push({ orgId: org.orgId, orgName: org.orgName, reason: 'other_members' });
        } else {
          soloOrgIds.push(org.orgId);
        }
      }
      return { allowed: blockers.length === 0, blockers, soloOrgIds };
    },

    /**
     * Deletes an account. Sign-in methods, sessions, roles and preferences go now; the user
     * row stays only as an anonymous tombstone so org history (notes, audit entries) keeps
     * its references. Orgs the user owned alone are soft-deleted and purged after 30 days.
     */
    async deleteAccount(userId: string, soloOrgIds: string[]): Promise<void> {
      await db.transaction(async (tx) => {
        if (soloOrgIds.length > 0) {
          await tx
            .update(organizations)
            .set({ deletedAt: new Date() })
            .where(and(inArray(organizations.id, soloOrgIds), isNull(organizations.deletedAt)));
        }
        await tx.delete(sessions).where(eq(sessions.userId, userId));
        await tx.delete(accounts).where(eq(accounts.userId, userId));
        await tx
          .delete(memberships)
          .where(and(eq(memberships.userId, userId), ne(memberships.role, 'owner')));
        // Owner rows remain only on the solo orgs deleted above; they go with the purge.
        await tx.delete(clientAccess).where(eq(clientAccess.userId, userId));
        await tx.delete(notificationPreferences).where(eq(notificationPreferences.userId, userId));
        await tx.delete(inAppNotifications).where(eq(inAppNotifications.userId, userId));
        await tx.delete(dataExports).where(eq(dataExports.userId, userId));
        await tx
          .update(users)
          .set({
            email: `deleted+${userId}@deleted.invalid`,
            name: null,
            avatarUrl: null,
            emailVerified: false,
            totpSecretEncrypted: null,
            totpEnabledAt: null,
            isStaff: false,
            lastActiveOrgId: null,
            deletedAt: new Date(),
          })
          .where(eq(users.id, userId));
      });
    },
  };
}

export type PrivacyRepository = ReturnType<typeof privacyRepository>;
