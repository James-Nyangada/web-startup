import type { Repositories } from '../db/repositories/index.js';
import type { Platform } from '../scanner/types.js';
import { ErrorCode } from '../shared/errors.js';
import { GeminiAdapter } from './gemini-adapter.js';
import type { AiProvider } from './provider.js';
import { aiCacheScope, computeCacheKey, scrubHtmlSnippet, validateAiOutput } from './scrubber.js';

export interface AiServiceOptions {
  monthlyCap?: number;
  featureEnabled?: boolean;
  provider?: AiProvider;
}

export interface GetAiSuggestionParams {
  orgId: string;
  issueId: string;
  ruleId: string;
  ruleTitle: string;
  ruleDescription?: string | null;
  wcagCriteria?: string[] | null;
  platform: string;
  framework?: string | null;
  htmlSnippet: string;
  failureSummary?: string | null;
}

export interface AiSuggestionResult {
  suggestion: string;
  cached: boolean;
  cacheKey: string;
  model: string;
}

import { getPlanLimits, getUpgradeTarget } from '../shared/plans.js';

export class AiServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode: number = 400,
    public readonly details: Record<string, unknown> = {},
  ) {
    super(message);
    this.name = 'AiServiceError';
  }
}

export class AiService {
  private readonly monthlyCapOverride?: number;
  private readonly featureEnabled: boolean;
  private readonly provider: AiProvider;

  constructor(
    private readonly repos: Repositories,
    options: AiServiceOptions = {},
  ) {
    this.monthlyCapOverride =
      options.monthlyCap ??
      (process.env.AI_SUGGESTIONS_MONTHLY_CAP
        ? Number.parseInt(process.env.AI_SUGGESTIONS_MONTHLY_CAP, 10)
        : undefined);
    this.featureEnabled =
      options.featureEnabled ??
      (process.env.FEATURE_AI_SUGGESTIONS === undefined ||
        process.env.FEATURE_AI_SUGGESTIONS === 'true' ||
        process.env.FEATURE_AI_SUGGESTIONS === '1');
    this.provider = options.provider ?? new GeminiAdapter();
  }

  async getOrGenerateSuggestion(params: GetAiSuggestionParams): Promise<AiSuggestionResult> {
    // 1. Feature flag check
    const isDbEnabled = await this.repos.aiSuggestions.isFeatureEnabled(
      'ai_fix_suggestions',
      params.orgId,
    );
    if (!this.featureEnabled || !isDbEnabled) {
      throw new AiServiceError(
        ErrorCode.FEATURE_DISABLED,
        'AI fix suggestions are currently disabled.',
        403,
      );
    }

    // 2. Normalize and compute cache key
    const scrubbedSnippet = scrubHtmlSnippet(params.htmlSnippet || '');
    const platform = (params.platform || 'generic').toLowerCase() as Platform;
    const cacheScope = aiCacheScope(platform, params.framework);
    const cacheKey = computeCacheKey(params.ruleId, cacheScope, scrubbedSnippet);

    // 3. Cache lookup
    const cached = await this.repos.aiSuggestions.findByCacheKey(cacheKey);
    if (cached && !cached.flagged && validateAiOutput(cached.suggestionMd).valid) {
      return {
        suggestion: cached.suggestionMd,
        cached: true,
        cacheKey,
        model: cached.model,
      };
    }

    // 4. Monthly cap check
    const currentMonth = new Date().toISOString().slice(0, 7); // 'YYYY-MM'
    const usage = await this.repos.aiSuggestions.getMonthlyUsage(params.orgId, currentMonth);
    const org = this.repos.organizations
      ? await this.repos.organizations.findById(params.orgId)
      : null;
    const plan = org?.plan ?? 'trial';
    const effectiveCap = this.monthlyCapOverride ?? getPlanLimits(plan).aiSuggestionsMonthly;

    if (usage >= effectiveCap) {
      const upgradeTo = getUpgradeTarget(plan, 'ai_suggestions', usage + 1);
      throw new AiServiceError(
        ErrorCode.PLAN_LIMIT,
        `Monthly AI suggestion limit reached (${effectiveCap} suggestions/month). Upgrade your plan or wait until next month.`,
        422,
        {
          limit: effectiveCap,
          current: usage,
          upgradeTo,
        },
      );
    }

    // 5. Call AI provider
    const providerResponse = await this.provider.generateSuggestion({
      ruleId: params.ruleId,
      ruleTitle: params.ruleTitle,
      ruleDescription: params.ruleDescription,
      wcagCriteria: params.wcagCriteria,
      platform,
      framework: params.framework,
      snippet: scrubbedSnippet,
      failureSummary: params.failureSummary,
    });

    // 6. Validate output
    const validation = validateAiOutput(providerResponse.markdown);

    // Never cache or bill a failed generation, so a retry can succeed
    if (!validation.valid) {
      return {
        suggestion: validation.markdown,
        cached: false,
        cacheKey,
        model: providerResponse.model,
      };
    }

    // 7. Store in cache
    await this.repos.aiSuggestions.create({
      cacheKey,
      ruleId: params.ruleId,
      platform: cacheScope as Platform,
      suggestionMd: validation.markdown,
      model: providerResponse.model,
      tokensIn: providerResponse.tokensIn,
      tokensOut: providerResponse.tokensOut,
    });

    // 8. Increment monthly usage
    await this.repos.aiSuggestions.incrementMonthlyUsage(params.orgId, currentMonth);

    return {
      suggestion: validation.markdown,
      cached: false,
      cacheKey,
      model: providerResponse.model,
    };
  }

  async reportBadSuggestion(cacheKey: string): Promise<{ flagged: boolean; cacheKey: string }> {
    const updated = await this.repos.aiSuggestions.flag(cacheKey);
    return {
      flagged: Boolean(updated?.flagged),
      cacheKey,
    };
  }
}
