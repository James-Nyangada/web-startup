import { eq } from 'drizzle-orm';
import type { Database } from '../client.js';
import {
  shopifySessions,
  type ShopifySessionRow,
  type NewShopifySessionRow,
} from '../schema/index.js';

export function shopifySessionsRepository(db: Database) {
  return {
    async findByShop(shop: string): Promise<ShopifySessionRow | null> {
      const [row] = await db
        .select()
        .from(shopifySessions)
        .where(eq(shopifySessions.shop, shop.toLowerCase()));
      return row ?? null;
    },

    async upsert(data: NewShopifySessionRow): Promise<ShopifySessionRow> {
      const [row] = await db
        .insert(shopifySessions)
        .values({
          ...data,
          shop: data.shop.toLowerCase(),
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: shopifySessions.shop,
          set: {
            accessToken: data.accessToken,
            scope: data.scope,
            ...(data.siteId !== undefined ? { siteId: data.siteId } : {}),
            ...(data.apiKey !== undefined ? { apiKey: data.apiKey } : {}),
            ...(data.orgId !== undefined ? { orgId: data.orgId } : {}),
            ...(data.plan !== undefined ? { plan: data.plan } : {}),
            ...(data.subscriptionId !== undefined ? { subscriptionId: data.subscriptionId } : {}),
            updatedAt: new Date(),
          },
        })
        .returning();
      return row!;
    },

    async deleteByShop(shop: string): Promise<boolean> {
      const deleted = await db
        .delete(shopifySessions)
        .where(eq(shopifySessions.shop, shop.toLowerCase()))
        .returning();
      return deleted.length > 0;
    },
  };
}

export type ShopifySessionsRepository = ReturnType<typeof shopifySessionsRepository>;
