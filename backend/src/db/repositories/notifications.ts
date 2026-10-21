import { and, desc, eq, isNull, inArray, sql } from 'drizzle-orm';
import type { Database } from '../index.js';
import {
  inAppNotifications,
  notificationPreferences,
  type ScanCompletedPref,
} from '../schema/notifications.js';
import { memberships, users } from '../schema/identity.js';
import type { OrgId } from './org-scope.js';

export interface CreateInAppNotificationInput {
  type: string;
  title: string;
  body: string;
  link?: string | null;
}

export interface InAppNotificationItem {
  id: string;
  orgId: string;
  userId: string;
  type: string;
  title: string;
  body: string;
  link: string | null;
  readAt: Date | null;
  createdAt: Date;
}

export interface UserNotificationPreferences {
  scanCompleted: ScanCompletedPref;
  regressions: boolean;
  weeklyDigest: boolean;
  billing: boolean;
}

export interface OptedInMember {
  userId: string;
  email: string;
  name: string | null;
  /** Set when listing for 'scanCompleted': 'all' or 'issues_only' (default 'all'). */
  scanCompleted?: ScanCompletedPref;
}

export function notificationsRepository(db: Database) {
  return {
    async createInApp(
      orgId: OrgId,
      userId: string,
      data: CreateInAppNotificationInput,
    ): Promise<InAppNotificationItem> {
      const [row] = await db
        .insert(inAppNotifications)
        .values({
          orgId,
          userId,
          type: data.type,
          title: data.title,
          body: data.body,
          link: data.link ?? null,
        })
        .returning();
      return row!;
    },

    async createInAppBatch(
      orgId: OrgId,
      userIds: string[],
      data: CreateInAppNotificationInput,
    ): Promise<void> {
      if (userIds.length === 0) return;
      await db.insert(inAppNotifications).values(
        userIds.map((uid) => ({
          orgId,
          userId: uid,
          type: data.type,
          title: data.title,
          body: data.body,
          link: data.link ?? null,
        })),
      );
    },

    async listInAppByUser(
      orgId: OrgId,
      userId: string,
      options: { limit?: number; unreadOnly?: boolean } = {},
    ): Promise<InAppNotificationItem[]> {
      const limit = Math.min(options.limit ?? 30, 100);
      const conditions = [
        eq(inAppNotifications.orgId, orgId),
        eq(inAppNotifications.userId, userId),
      ];
      if (options.unreadOnly) {
        conditions.push(isNull(inAppNotifications.readAt));
      }

      return db
        .select()
        .from(inAppNotifications)
        .where(and(...conditions))
        .orderBy(desc(inAppNotifications.createdAt))
        .limit(limit);
    },

    async countUnreadInApp(orgId: OrgId, userId: string): Promise<number> {
      const [res] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(inAppNotifications)
        .where(
          and(
            eq(inAppNotifications.orgId, orgId),
            eq(inAppNotifications.userId, userId),
            isNull(inAppNotifications.readAt),
          ),
        );
      return res?.count ?? 0;
    },

    async markInAppRead(orgId: OrgId, userId: string, notificationId: string): Promise<boolean> {
      const [updated] = await db
        .update(inAppNotifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(inAppNotifications.id, notificationId),
            eq(inAppNotifications.orgId, orgId),
            eq(inAppNotifications.userId, userId),
          ),
        )
        .returning({ id: inAppNotifications.id });
      return Boolean(updated);
    },

    async markAllInAppRead(orgId: OrgId, userId: string): Promise<number> {
      const updated = await db
        .update(inAppNotifications)
        .set({ readAt: new Date() })
        .where(
          and(
            eq(inAppNotifications.orgId, orgId),
            eq(inAppNotifications.userId, userId),
            isNull(inAppNotifications.readAt),
          ),
        )
        .returning({ id: inAppNotifications.id });
      return updated.length;
    },

    async getPreferences(orgId: OrgId, userId: string): Promise<UserNotificationPreferences> {
      const [row] = await db
        .select()
        .from(notificationPreferences)
        .where(
          and(eq(notificationPreferences.orgId, orgId), eq(notificationPreferences.userId, userId)),
        )
        .limit(1);

      if (!row) {
        return {
          scanCompleted: 'all',
          regressions: true,
          weeklyDigest: true,
          billing: true,
        };
      }

      return {
        scanCompleted: row.scanCompleted,
        regressions: row.regressions,
        weeklyDigest: row.weeklyDigest,
        billing: row.billing,
      };
    },

    async updatePreferences(
      orgId: OrgId,
      userId: string,
      prefs: Partial<UserNotificationPreferences>,
    ): Promise<UserNotificationPreferences> {
      const [row] = await db
        .insert(notificationPreferences)
        .values({
          orgId,
          userId,
          scanCompleted: prefs.scanCompleted ?? 'all',
          regressions: prefs.regressions ?? true,
          weeklyDigest: prefs.weeklyDigest ?? true,
          billing: prefs.billing ?? true,
        })
        .onConflictDoUpdate({
          target: [notificationPreferences.userId, notificationPreferences.orgId],
          set: {
            ...(prefs.scanCompleted !== undefined ? { scanCompleted: prefs.scanCompleted } : {}),
            ...(prefs.regressions !== undefined ? { regressions: prefs.regressions } : {}),
            ...(prefs.weeklyDigest !== undefined ? { weeklyDigest: prefs.weeklyDigest } : {}),
            ...(prefs.billing !== undefined ? { billing: prefs.billing } : {}),
            updatedAt: new Date(),
          },
        })
        .returning();

      return {
        scanCompleted: row!.scanCompleted,
        regressions: row!.regressions,
        weeklyDigest: row!.weeklyDigest,
        billing: row!.billing,
      };
    },

    async listOptedInMembers(
      orgId: OrgId,
      pref: 'regressions' | 'weeklyDigest' | 'billing' | 'scanCompleted',
    ): Promise<OptedInMember[]> {
      const rows = await db
        .select({
          userId: users.id,
          email: users.email,
          name: users.name,
          prefValue:
            pref === 'regressions'
              ? notificationPreferences.regressions
              : pref === 'weeklyDigest'
                ? notificationPreferences.weeklyDigest
                : pref === 'billing'
                  ? notificationPreferences.billing
                  : notificationPreferences.scanCompleted,
        })
        .from(memberships)
        .innerJoin(users, eq(memberships.userId, users.id))
        .leftJoin(
          notificationPreferences,
          and(
            eq(notificationPreferences.userId, users.id),
            eq(notificationPreferences.orgId, orgId),
          ),
        )
        .where(
          and(
            eq(memberships.orgId, orgId),
            inArray(memberships.role, ['owner', 'admin', 'member']),
          ),
        );

      return rows
        .filter((r) => {
          if (pref === 'scanCompleted') {
            return r.prefValue === undefined || r.prefValue === null || r.prefValue !== 'off';
          }
          // Default true if no row exists in preferences
          return r.prefValue === undefined || r.prefValue === null || r.prefValue === true;
        })
        .map((r) => ({
          userId: r.userId,
          email: r.email,
          name: r.name,
          ...(pref === 'scanCompleted'
            ? { scanCompleted: (r.prefValue as ScanCompletedPref | null) ?? 'all' }
            : {}),
        }));
    },
  };
}

export type NotificationsRepository = ReturnType<typeof notificationsRepository>;
