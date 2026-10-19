import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import { subscriptions } from '../schema/index.js';
import type { OrgId } from './org-scope.js';

export interface UpsertSubscriptionInput {
  orgId: OrgId;
  paddleSubscriptionId: string;
  paddlePriceId: string;
  plan: string;
  interval: string;
  status: string;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  scheduledChange?: Record<string, unknown> | null;
}

export function subscriptionsRepository(db: Database) {
  return {
    async findByOrgId(orgId: OrgId) {
      const [row] = await db.select().from(subscriptions).where(eq(subscriptions.orgId, orgId));
      return row ?? null;
    },

    async findByPaddleSubscriptionId(paddleSubscriptionId: string) {
      const [row] = await db
        .select()
        .from(subscriptions)
        .where(eq(subscriptions.paddleSubscriptionId, paddleSubscriptionId));
      return row ?? null;
    },

    async upsert(data: UpsertSubscriptionInput) {
      const [row] = await db
        .insert(subscriptions)
        .values({
          orgId: data.orgId,
          paddleSubscriptionId: data.paddleSubscriptionId,
          paddlePriceId: data.paddlePriceId,
          plan: data.plan,
          interval: data.interval,
          status: data.status,
          currentPeriodStart: data.currentPeriodStart,
          currentPeriodEnd: data.currentPeriodEnd,
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
          scheduledChange: data.scheduledChange ?? null,
        })
        .onConflictDoUpdate({
          target: subscriptions.orgId,
          set: {
            paddleSubscriptionId: data.paddleSubscriptionId,
            paddlePriceId: data.paddlePriceId,
            plan: data.plan,
            interval: data.interval,
            status: data.status,
            currentPeriodStart: data.currentPeriodStart,
            currentPeriodEnd: data.currentPeriodEnd,
            cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
            scheduledChange: data.scheduledChange ?? null,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!row) throw new Error('Failed to upsert subscription');
      return row;
    },

    async setCancelAtPeriodEnd(orgId: OrgId, cancelAtPeriodEnd: boolean) {
      const [row] = await db
        .update(subscriptions)
        .set({ cancelAtPeriodEnd, updatedAt: new Date() })
        .where(eq(subscriptions.orgId, orgId))
        .returning();
      return row ?? null;
    },
  };
}
