import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  computeCacheKey,
  scrubHtmlSnippet,
  validateAiOutput,
  buildAiPrompt,
} from '../../src/ai/scrubber.js';
import { AiService, AiServiceError } from '../../src/ai/service.js';
import type { AiProvider } from '../../src/ai/provider.js';
import type { Repositories } from '../../src/db/repositories/index.js';
import { buildTestApp } from '../helpers/fakes.js';
import type { Auth } from '../../src/lib/auth.js';

function createMockAuth(userId: string) {
  const mockUser = {
    id: userId,
    email: `${userId}@example.com`,
    name: `User ${userId}`,
    isStaff: false,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mockSession = {
    id: `sess-${userId}`,
    userId,
    token: `token-${userId}`,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const api = {
    getSession: vi.fn(
      ({ headers }: { headers?: Headers | Record<string, string | string[] | undefined> }) => {
        let cookie: string | null = null;
        if (headers instanceof Headers) {
          cookie = headers.get('cookie');
        } else if (headers && typeof headers === 'object' && 'cookie' in headers) {
          cookie = (headers.cookie as string) ?? null;
        }
        if (cookie && cookie.includes(`token-${userId}`)) {
          return Promise.resolve({ user: mockUser, session: mockSession });
        }
        return Promise.resolve(null);
      },
    ),
  };

  return { api, mockUser, mockSession } as unknown as Auth;
}

describe('AI Fix Suggestions (Phase 3 Chunk P3-07, Section 6.10)', () => {
  describe('Input Scrubber & Cache Key (scrubber.ts)', () => {
    it('strips all value attributes from HTML snippets', () => {
      const input =
        '<input type="text" name="coupon" value="SECRET_CODE_123" placeholder="Enter coupon">';
      const scrubbed = scrubHtmlSnippet(input);

      expect(scrubbed).not.toContain('SECRET_CODE_123');
      expect(scrubbed).not.toContain('value=');
      expect(scrubbed).toContain('type="text"');
      expect(scrubbed).toContain('name="coupon"');
    });

    it('redacts email addresses to prevent sending customer PII', () => {
      const input = '<p>Contact our support lead at jane.doe@company.org or admin@shop.co.uk</p>';
      const scrubbed = scrubHtmlSnippet(input);

      expect(scrubbed).not.toContain('jane.doe@company.org');
      expect(scrubbed).not.toContain('admin@shop.co.uk');
      expect(scrubbed).toContain('[REDACTED_EMAIL]');
    });

    it('redacts telephone numbers in international and local formats', () => {
      const input = '<span class="tel">+1 (555) 234-5678</span> and <span>07123 456789</span>';
      const scrubbed = scrubHtmlSnippet(input);

      expect(scrubbed).not.toContain('555');
      expect(scrubbed).not.toContain('07123');
      expect(scrubbed).toContain('[REDACTED_PHONE]');
    });

    it('caps the snippet length at 2,000 characters per section 6.10', () => {
      const longInput = '<div>' + 'A'.repeat(3000) + '</div>';
      const scrubbed = scrubHtmlSnippet(longInput);

      expect(scrubbed.length).toBeLessThanOrEqual(2000);
    });

    it('computes deterministic sha256 cache key', () => {
      const key1 = computeCacheKey('image-alt', 'shopify', '<img src="hero.jpg">');
      const key2 = computeCacheKey('image-alt', 'shopify', '<img src="hero.jpg">');
      const keyDiffPlatform = computeCacheKey('image-alt', 'wordpress', '<img src="hero.jpg">');
      const keyDiffRule = computeCacheKey('button-name', 'shopify', '<img src="hero.jpg">');

      expect(key1).toBe(key2);
      expect(key1).toHaveLength(64);
      expect(key1).not.toBe(keyDiffPlatform);
      expect(key1).not.toBe(keyDiffRule);
    });

    it('builds prompt including rule details and WCAG criteria', () => {
      const prompt = buildAiPrompt({
        ruleId: 'image-alt',
        ruleTitle: 'Images must have alternate text',
        ruleDescription:
          'Ensures <img> elements have alternate text or a role of none or presentation',
        wcagCriteria: ['1.1.1'],
        platform: 'shopify',
        scrubbedSnippet: '<img src="product.jpg">',
        failureSummary: 'Fix any of the following: Element does not have an alt attribute',
      });

      expect(prompt).toContain('Rule ID: image-alt');
      expect(prompt).toContain('Images must have alternate text');
      expect(prompt).toContain('1.1.1');
      expect(prompt).toContain('shopify');
      expect(prompt).toContain('<img src="product.jpg">');
      expect(prompt).toContain('fenced code block');
    });
  });

  describe('Output Validator (scrubber.ts)', () => {
    it('accepts valid markdown with fenced code block', () => {
      const markdown =
        'Add an alt attribute describing the image.\n\n```html\n<img src="hero.jpg" alt="Summer collection banner">\n```';
      const result = validateAiOutput(markdown);

      expect(result.valid).toBe(true);
      expect(result.markdown).toBe(markdown);
    });

    it('returns "Suggestion unavailable" when fenced code block is missing', () => {
      const markdown = 'You should add an alt attribute to this image to make it accessible.';
      const result = validateAiOutput(markdown);

      expect(result.valid).toBe(false);
      expect(result.markdown).toBe('Suggestion unavailable');
    });

    it('returns "Suggestion unavailable" when output exceeds max words', () => {
      const wordy = 'word '.repeat(360) + '\n\n```html\n<div></div>\n```';
      const result = validateAiOutput(wordy);

      expect(result.valid).toBe(false);
      expect(result.markdown).toBe('Suggestion unavailable');
    });
  });

  describe('AiService (service.ts)', () => {
    const orgId = '11111111-1111-4111-a111-111111111111';
    let mockRepos: Repositories;
    let mockProvider: AiProvider;
    let generateSpy: ReturnType<typeof vi.fn<AiProvider['generateSuggestion']>>;
    let featureEnabledSpy: ReturnType<typeof vi.fn<() => Promise<boolean>>>;

    beforeEach(() => {
      generateSpy = vi.fn<AiProvider['generateSuggestion']>().mockResolvedValue({
        markdown: 'Add alt attribute.\n\n```html\n<img src="pic.jpg" alt="Descriptive text">\n```',
        model: 'gemini-2.5-flash',
        tokensIn: 100,
        tokensOut: 40,
      });

      mockProvider = {
        generateSuggestion: generateSpy,
      };

      type CachedSuggestion = { cacheKey: string; flagged: boolean } & Record<string, unknown>;
      const cache = new Map<string, CachedSuggestion>();
      const usage = new Map<string, number>();

      featureEnabledSpy = vi.fn<() => Promise<boolean>>().mockResolvedValue(true);
      mockRepos = {
        aiSuggestions: {
          findByCacheKey: vi
            .fn()
            .mockImplementation((key: string) => Promise.resolve(cache.get(key) ?? null)),
          create: vi.fn().mockImplementation((data: { cacheKey: string }) => {
            const record = { ...data, id: 'sug-1', flagged: false, createdAt: new Date() };
            cache.set(data.cacheKey, record);
            return Promise.resolve(record);
          }),
          flag: vi.fn().mockImplementation((key: string) => {
            const existing = cache.get(key);
            if (existing) {
              existing.flagged = true;
              cache.set(key, existing);
            }
            return Promise.resolve(existing ?? null);
          }),
          getMonthlyUsage: vi
            .fn()
            .mockImplementation((_orgId: string, month: string) =>
              Promise.resolve(usage.get(month) ?? 0),
            ),
          incrementMonthlyUsage: vi.fn().mockImplementation((_orgId: string, month: string) => {
            const count = (usage.get(month) ?? 0) + 1;
            usage.set(month, count);
            return Promise.resolve(count);
          }),
          isFeatureEnabled: featureEnabledSpy,
        },
      } as unknown as Repositories;
    });

    it('makes NO request to provider when a cached suggestion exists', async () => {
      const service = new AiService(mockRepos, { provider: mockProvider });
      const params = {
        orgId,
        issueId: 'issue-1',
        ruleId: 'image-alt',
        ruleTitle: 'Images must have alt',
        platform: 'shopify',
        htmlSnippet: '<img src="logo.png">',
      };

      // 1st call: cache miss -> provider called
      const first = await service.getOrGenerateSuggestion(params);
      expect(first.cached).toBe(false);
      expect(generateSpy).toHaveBeenCalledTimes(1);

      // 2nd call: cache hit -> provider NOT called
      const second = await service.getOrGenerateSuggestion(params);
      expect(second.cached).toBe(true);
      expect(second.suggestion).toBe(first.suggestion);
      expect(generateSpy).toHaveBeenCalledTimes(1); // Provider still called only once!
    });

    it('enforces per-org monthly cap and throws 422 PLAN_LIMIT when exceeded', async () => {
      const service = new AiService(mockRepos, {
        provider: mockProvider,
        monthlyCap: 2,
      });

      // 1st request
      await service.getOrGenerateSuggestion({
        orgId,
        issueId: 'issue-1',
        ruleId: 'image-alt',
        ruleTitle: 'Alt 1',
        platform: 'shopify',
        htmlSnippet: '<img src="1.png">',
      });

      // 2nd request
      await service.getOrGenerateSuggestion({
        orgId,
        issueId: 'issue-2',
        ruleId: 'image-alt',
        ruleTitle: 'Alt 2',
        platform: 'shopify',
        htmlSnippet: '<img src="2.png">',
      });

      // 3rd request -> exceeds cap of 2
      await expect(
        service.getOrGenerateSuggestion({
          orgId,
          issueId: 'issue-3',
          ruleId: 'image-alt',
          ruleTitle: 'Alt 3',
          platform: 'shopify',
          htmlSnippet: '<img src="3.png">',
        }),
      ).rejects.toThrowError(/Monthly AI suggestion limit reached/);
    });

    it('reporting a bad suggestion flags the record and removes it from cache', async () => {
      const service = new AiService(mockRepos, { provider: mockProvider });
      const params = {
        orgId,
        issueId: 'issue-1',
        ruleId: 'image-alt',
        ruleTitle: 'Images must have alt',
        platform: 'shopify',
        htmlSnippet: '<img src="hero.png">',
      };

      const result = await service.getOrGenerateSuggestion(params);
      expect(generateSpy).toHaveBeenCalledTimes(1);

      // Report bad suggestion
      const reportRes = await service.reportBadSuggestion(result.cacheKey);
      expect(reportRes.flagged).toBe(true);

      // Next request for the same key should miss the cache and regenerate
      const regenerated = await service.getOrGenerateSuggestion(params);
      expect(regenerated.cached).toBe(false);
      expect(generateSpy).toHaveBeenCalledTimes(2);
    });

    it('rejects with FEATURE_DISABLED when feature flag is turned off', async () => {
      featureEnabledSpy.mockResolvedValue(false);
      const service = new AiService(mockRepos, { provider: mockProvider });

      await expect(
        service.getOrGenerateSuggestion({
          orgId,
          issueId: 'issue-1',
          ruleId: 'image-alt',
          ruleTitle: 'Images must have alt',
          platform: 'shopify',
          htmlSnippet: '<img src="hero.png">',
        }),
      ).rejects.toThrowError(AiServiceError);
    });
  });

  describe('Issues Router AI Endpoints (S-26)', () => {
    const orgId = '11111111-1111-4111-a111-111111111111';
    const siteId = 'site-aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const issueId = 'issue-bbbbbbbb-bbbb-4bbb-abbb-bbbbbbbbbbbb';
    const userId = 'user-member-123';

    const mockOrg = {
      id: orgId,
      name: 'Brightline Studio',
      slug: 'brightline',
      plan: 'store',
      status: 'active',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const mockSite = {
      id: siteId,
      orgId,
      name: 'Oakhaus Furniture',
      url: 'https://oakhaus.com',
      domain: 'oakhaus.com',
      platform: 'shopify',
      status: 'active',
    };

    const mockIssue = {
      id: issueId,
      orgId,
      siteId,
      fingerprint: 'fp-123',
      ruleId: 'image-alt',
      title: 'Images must have alternate text',
      description: 'Ensures <img> elements have alternate text',
      wcagCriteria: ['1.1.1'],
      wcagLevel: 'A',
      templateKey: 'product',
      selector: '.product-hero > img',
      htmlSnippet: '<img src="/cdn/table.jpg">',
      failureSummary: 'Fix any of the following: Element does not have an alt attribute',
      status: 'open',
    };

    it('POST /v1/orgs/:orgId/issues/:issueId/ai-suggestion returns generated suggestion', async () => {
      const auth = createMockAuth(userId);
      const { app, repos } = buildTestApp({ auth });

      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(mockOrg as never);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-1',
        orgId,
        userId,
        role: 'member',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(repos.memberships.findRole).mockResolvedValue('member');
      vi.mocked(repos.sites.findById).mockResolvedValue(mockSite as never);
      vi.mocked(repos.issues.findById).mockResolvedValue(mockIssue as never);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/issues/${issueId}/ai-suggestion`)
        .set('Cookie', `token-${userId}`)
        .send({ platform: 'shopify' });

      expect(res.status).toBe(200);
      expect(res.body.data).toBeDefined();
      expect(res.body.data.suggestion).toContain('```');
      expect(res.body.data.cacheKey).toBeDefined();
    });

    it('POST /v1/orgs/:orgId/issues/:issueId/ai-suggestion/report flags bad suggestion', async () => {
      const auth = createMockAuth(userId);
      const { app, repos } = buildTestApp({ auth });

      vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(mockOrg as never);
      vi.mocked(repos.memberships.find).mockResolvedValue({
        id: 'mem-1',
        orgId,
        userId,
        role: 'member',
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(repos.memberships.findRole).mockResolvedValue('member');
      vi.mocked(repos.sites.findById).mockResolvedValue(mockSite as never);
      vi.mocked(repos.issues.findById).mockResolvedValue(mockIssue as never);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/issues/${issueId}/ai-suggestion/report`)
        .set('Cookie', `token-${userId}`)
        .send({ platform: 'shopify' });

      expect(res.status).toBe(200);
      expect(res.body.data.success).toBe(true);
      expect(res.body.data.flagged).toBe(true);
      expect(res.body.data.cacheKey).toBeDefined();
    });
  });
});
