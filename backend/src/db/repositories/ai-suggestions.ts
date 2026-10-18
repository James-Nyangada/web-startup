import { and, eq, sql } from 'drizzle-orm';
import type { Database } from '../client.js';
import { aiSuggestions, aiUsage } from '../schema/knowledge.js';
import { featureFlags } from '../schema/system.js';
import type { Platform } from '../../scanner/types.js';

export interface CreateAiSuggestionInput {
  cacheKey: string;
  ruleId: string;
  platform: Platform;
  suggestionMd: string;
  model: string;
  tokensIn?: number;
  tokensOut?: number;
}

export function aiSuggestionsRepository(db: Database) {
  return {
    async findByCacheKey(cacheKey: string) {
      const [row] = await db
        .select()
        .from(aiSuggestions)
        .where(and(eq(aiSuggestions.cacheKey, cacheKey), eq(aiSuggestions.flagged, false)));
      return row ?? null;
    },

    async create(input: CreateAiSuggestionInput) {
      const [inserted] = await db
        .insert(aiSuggestions)
        .values({
          cacheKey: input.cacheKey,
          ruleId: input.ruleId,
          platform: input.platform,
          suggestionMd: input.suggestionMd,
          model: input.model,
          tokensIn: input.tokensIn ?? 0,
          tokensOut: input.tokensOut ?? 0,
          flagged: false,
        })
        .onConflictDoUpdate({
          target: aiSuggestions.cacheKey,
          set: {
            suggestionMd: input.suggestionMd,
            model: input.model,
            tokensIn: input.tokensIn ?? 0,
            tokensOut: input.tokensOut ?? 0,
            flagged: false,
            updatedAt: new Date(),
          },
        })
        .returning();
      return inserted;
    },

    async flag(cacheKey: string) {
      const [updated] = await db
        .update(aiSuggestions)
        .set({
          flagged: true,
          updatedAt: new Date(),
        })
        .where(eq(aiSuggestions.cacheKey, cacheKey))
        .returning();
      return updated ?? null;
    },

    async getMonthlyUsage(orgId: string, month: string): Promise<number> {
      const [row] = await db
        .select({ requests: aiUsage.requests })
        .from(aiUsage)
        .where(and(eq(aiUsage.orgId, orgId), eq(aiUsage.month, month)));
      return row?.requests ?? 0;
    },

    async incrementMonthlyUsage(orgId: string, month: string): Promise<number> {
      const [row] = await db
        .insert(aiUsage)
        .values({
          orgId,
          month,
          requests: 1,
        })
        .onConflictDoUpdate({
          target: [aiUsage.orgId, aiUsage.month],
          set: {
            requests: sql`${aiUsage.requests} + 1`,
            updatedAt: new Date(),
          },
        })
        .returning({ requests: aiUsage.requests });
      return row?.requests ?? 1;
    },

    async isFeatureEnabled(key: string, orgId?: string): Promise<boolean> {
      const [flag] = await db
        .select()
        .from(featureFlags)
        .where(eq(featureFlags.key, key));

      if (!flag) {
        // If not explicitly configured in DB, feature flag defaults to enabled
        return true;
      }

      if (!flag.enabled) {
        return false;
      }

      if (flag.orgIds && flag.orgIds.length > 0) {
        if (!orgId) return false;
        return flag.orgIds.includes(orgId);
      }

      return true;
    },
  };
}

export type AiSuggestionsRepository = ReturnType<typeof aiSuggestionsRepository>;
