import type pg from 'pg';
import { vi } from 'vitest';
import { createApp } from '../../src/app.js';
import type { Auth } from '../../src/lib/auth.js';
import type { Repositories } from '../../src/db/repositories/index.js';
import type { TurnstileVerifier } from '../../src/lib/turnstile.js';
import type { GuardPolicy } from '../../src/scanner/net/guard.js';
import { isPublicAddress } from '../../src/scanner/net/ip-ranges.js';
import type { FreeChecksRouterOptions } from '../../src/routes/public/free-checks.js';
import { MemoryStorageService, type StorageService } from '../../src/storage/index.js';

export const testConfig = {
  APP_URL: 'http://localhost:3000',
  SITE_URL: 'http://localhost:3001',
  CORS_ORIGINS: '',
  SENTRY_DSN_API: undefined,
  AUTH_SECRET: '01234567890123456789012345678901',
  GOOGLE_CLIENT_ID: undefined,
  GOOGLE_CLIENT_SECRET: undefined,
};

export function fakePool(healthy = true): pg.Pool {
  return {
    query: healthy
      ? vi.fn().mockResolvedValue({ rows: [{ '?column?': 1 }] })
      : vi.fn().mockRejectedValue(new Error('connection refused')),
  } as unknown as pg.Pool;
}

export function fakeRepos() {
  const join = vi.fn<Repositories['waitlist']['join']>().mockResolvedValue(undefined);
  const repos = {
    waitlist: { join },
    users: {
      findById: vi.fn().mockResolvedValue(null),
      findByEmail: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
      listMemberships: vi.fn().mockResolvedValue([]),
      listClientAccess: vi.fn().mockResolvedValue([]),
      isSoleOwnerOfActiveOrg: vi.fn().mockResolvedValue(false),
      softDelete: vi.fn().mockResolvedValue(null),
    },
    organizations: {
      create: vi.fn().mockResolvedValue(null),
      findById: vi.fn().mockResolvedValue(null),
      findBySlug: vi.fn().mockResolvedValue(null),
      findByIdOrSlug: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
      softDelete: vi.fn().mockResolvedValue(null),
      findByPaddleCustomerId: vi.fn().mockResolvedValue(null),
      isSlugAvailable: vi.fn().mockResolvedValue(true),
      createWithInitialOwner: vi.fn().mockResolvedValue(null),
      findDueForTrialLifecycle: vi.fn().mockResolvedValue([]),
    },
    memberships: {
      list: vi.fn().mockResolvedValue([]),
      count: vi.fn().mockResolvedValue(1),
      findRole: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue(null),
      updateRole: vi.fn().mockResolvedValue(null),
      remove: vi.fn().mockResolvedValue(null),
      findOwner: vi.fn().mockResolvedValue(null),
    },
    auditLog: {
      write: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
      findRecentAction: vi.fn().mockResolvedValue(null),
    },
    sites: {
      list: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(null),
      findByRootUrl: vi.fn().mockResolvedValue(null),
      listSummaries: vi.fn().mockResolvedValue(new Map()),
      count: vi.fn().mockResolvedValue(0),
      countActive: vi.fn().mockResolvedValue(0),
      countDailySites: vi.fn().mockResolvedValue(0),
      create: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
      pause: vi.fn().mockResolvedValue(null),
      resume: vi.fn().mockResolvedValue(null),
      softDelete: vi.fn().mockResolvedValue(null),
      setVerified: vi.fn().mockResolvedValue(null),
      findDueForScheduledScan: vi.fn().mockResolvedValue([]),
      updateNextScanAt: vi.fn().mockResolvedValue(null),
      findRawById: vi.fn().mockResolvedValue(null),
    },
    scans: {
      create: vi.fn().mockResolvedValue(null),
      findById: vi.fn().mockResolvedValue(null),
      update: vi.fn().mockResolvedValue(null),
      listBySite: vi.fn().mockResolvedValue([]),
      countBySite: vi.fn().mockResolvedValue(0),
      findRunningScanForSite: vi.fn().mockResolvedValue(null),
      countOnboardingScansForSite: vi.fn().mockResolvedValue(0),
      findRawById: vi.fn().mockResolvedValue(null),
      updateRaw: vi.fn().mockResolvedValue(null),
      findInterruptedScans: vi.fn().mockResolvedValue([]),
      requeueInterrupted: vi.fn().mockResolvedValue(null),
      markFailed: vi.fn().mockResolvedValue(null),
      countManualScansSince: vi.fn().mockResolvedValue(0),
      cancelScan: vi.fn().mockResolvedValue(null),
      listTrendScans: vi.fn().mockResolvedValue([]),
    },
    pages: {
      upsertPages: vi.fn().mockResolvedValue(new Map()),
      listBySite: vi.fn().mockResolvedValue([]),
      countBySite: vi.fn().mockResolvedValue(0),
      findById: vi.fn().mockResolvedValue(null),
      insertPageResults: vi.fn().mockResolvedValue(undefined),
      listResultsByScan: vi.fn().mockResolvedValue([]),
      listGroupedByTemplate: vi.fn().mockResolvedValue([]),
      setPin: vi
        .fn()
        .mockImplementation((_orgId, _siteId, pageIdOrUrl, isPinned) =>
          Promise.resolve({ id: 'p-1', url: pageIdOrUrl, isPinned }),
        ),
      previewExclusions: vi.fn().mockImplementation((_orgId, _siteId, patterns) =>
        Promise.resolve({
          matchCount: patterns.length > 0 ? 1 : 0,
          matchedUrls: patterns.length > 0 ? ['https://example.com/cart'] : [],
        }),
      ),
    },
    issues: {
      listForDiff: vi.fn().mockResolvedValue([]),
      applyScanDiff: vi
        .fn()
        .mockResolvedValue({ createdCount: 0, fixedCount: 0, regressedCount: 0 }),
      listBySite: vi.fn().mockResolvedValue([]),
      countBySite: vi.fn().mockResolvedValue(0),
      findById: vi.fn().mockResolvedValue(null),
      listTopIssues: vi.fn().mockResolvedValue([]),
      getSeverityCounts: vi
        .fn()
        .mockResolvedValue({ critical: 0, serious: 0, moderate: 0, minor: 0 }),
      getDiffSummary: vi
        .fn()
        .mockResolvedValue({ newCount: 0, fixedCount: 0, regressedCount: 0, sinceDate: null }),
      getScanDiff: vi.fn().mockResolvedValue({ regressed: [], new: [], fixed: [] }),
      listRecentlyFixed: vi.fn().mockResolvedValue([]),
      listTemplatesBySite: vi.fn().mockResolvedValue([]),
      listCrossSite: vi.fn().mockResolvedValue([]),
      listOccurrences: vi.fn().mockResolvedValue([]),
      countOccurrences: vi.fn().mockResolvedValue(0),
      listEvents: vi.fn().mockResolvedValue([]),
      listNotes: vi.fn().mockResolvedValue([]),
      addNote: vi.fn().mockImplementation((_orgId, issueId, authorId, body, visibleToClient) =>
        Promise.resolve({
          id: 'note-1',
          orgId: 'org-1',
          issueId,
          authorId,
          body,
          visibleToClient: Boolean(visibleToClient),
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      findRawById: vi.fn().mockResolvedValue(null),
      ignore: vi.fn().mockImplementation((_orgId, issueId, actorId, reason, note) =>
        Promise.resolve({
          id: issueId,
          status: 'ignored',
          ignoredReason: reason,
          ignoredNote: note ?? null,
          ignoredBy: actorId,
          ignoredAt: new Date(),
        }),
      ),
      unignore: vi.fn().mockImplementation((_orgId, issueId) =>
        Promise.resolve({
          id: issueId,
          status: 'open',
          ignoredReason: null,
          ignoredNote: null,
          ignoredBy: null,
          ignoredAt: null,
        }),
      ),
      assign: vi.fn().mockImplementation((_orgId, issueId, _actorId, assigneeId) =>
        Promise.resolve({
          id: issueId,
          assigneeId,
        }),
      ),
      setDueDate: vi.fn().mockImplementation((_orgId, issueId, _actorId, dueDate) =>
        Promise.resolve({
          id: issueId,
          dueDate,
        }),
      ),
      recordRecheck: vi.fn().mockResolvedValue(undefined),
      markFixed: vi.fn().mockImplementation((_orgId, issueId, actorId, scanId) =>
        Promise.resolve({
          id: issueId,
          status: 'fixed',
          fixedAt: new Date(),
          fixedScanId: scanId ?? null,
        }),
      ),
      findNoteById: vi.fn().mockResolvedValue(null),
      updateNote: vi.fn().mockImplementation((_orgId, issueId, noteId, body, visibleToClient) =>
        Promise.resolve({
          id: noteId,
          issueId,
          body,
          visibleToClient: Boolean(visibleToClient),
          updatedAt: new Date(),
        }),
      ),
      deleteNote: vi.fn().mockImplementation((_orgId, issueId, noteId) =>
        Promise.resolve({
          id: noteId,
          issueId,
          deletedAt: new Date(),
        }),
      ),
      bulkAction: vi.fn().mockResolvedValue({ updatedCount: 1 }),
    },
    invitations: {
      create: vi.fn().mockImplementation((orgId, input) =>
        Promise.resolve({
          invitation: {
            id: 'inv-123',
            orgId,
            email: input.email,
            role: input.role,
            siteIds: input.siteIds ?? [],
            tokenHash: 'hash-123',
            invitedBy: input.invitedBy ?? null,
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            acceptedAt: null,
            revokedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          },
          rawToken: 'mock-raw-token-123',
        }),
      ),
      countPendingNonClient: vi.fn().mockResolvedValue(0),
      countClientViewers: vi.fn().mockResolvedValue(0),
      listPending: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(null),
      findByToken: vi.fn().mockResolvedValue(null),
      revoke: vi.fn().mockImplementation((orgId, id) =>
        Promise.resolve({
          id,
          orgId,
          revokedAt: new Date(),
        }),
      ),
      renew: vi.fn().mockImplementation((orgId, id) =>
        Promise.resolve({
          invitation: {
            id,
            orgId,
            email: 'test@example.com',
            role: 'member',
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          },
          rawToken: 'renewed-token-456',
        }),
      ),
      markAccepted: vi.fn().mockImplementation((id) =>
        Promise.resolve({
          id,
          acceptedAt: new Date(),
        }),
      ),
    },
    reports: {
      create: vi.fn().mockImplementation((orgId, input) =>
        Promise.resolve({
          id: 'rep-123',
          orgId,
          siteId: input.siteId ?? null,
          scanId: input.scanId ?? null,
          type: input.type,
          status: 'queued',
          fileKey: null,
          fileSize: null,
          branded: input.branded ?? false,
          requestedBy: input.requestedBy ?? null,
          expiresAt: input.expiresAt ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      findById: vi.fn().mockImplementation((orgId, id) =>
        Promise.resolve({
          id,
          orgId,
          siteId: 'site-1',
          scanId: 'scan-1',
          type: 'scan_summary',
          status: 'ready',
          fileKey: `reports/${orgId}/${id}.pdf`,
          fileSize: 10240,
          branded: false,
          requestedBy: 'user-1',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
          updatedAt: new Date(),
          siteName: 'Oakhaus Furniture',
          scanScore: 78,
          requesterName: 'Daniel Mwangi',
        }),
      ),
      findRawById: vi.fn().mockImplementation((id) =>
        Promise.resolve({
          id,
          orgId: 'org-1',
          siteId: 'site-1',
          scanId: 'scan-1',
          type: 'scan_summary',
          status: 'ready',
          fileKey: `reports/org-1/${id}.pdf`,
          fileSize: 10240,
          branded: false,
          requestedBy: 'user-1',
          expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          createdAt: new Date(),
          updatedAt: new Date(),
          siteName: 'Oakhaus Furniture',
          scanScore: 78,
          requesterName: 'Daniel Mwangi',
        }),
      ),
      listByOrg: vi.fn().mockResolvedValue({
        reports: [],
        total: 0,
      }),
      updateStatus: vi.fn().mockImplementation((id, status, fields) =>
        Promise.resolve({
          id,
          status,
          ...fields,
        }),
      ),
      delete: vi.fn().mockResolvedValue(true),
    },
    freeChecks: {
      create: vi.fn().mockImplementation((data) =>
        Promise.resolve({
          id: 'fc-123',
          url: data.url,
          domain: data.domain,
          ipHash: data.ipHash,
          status: 'pending',
          email: null,
          result: null,
          reportKey: null,
          marketingConsent: false,
          convertedOrgId: null,
          errorMessage: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      findById: vi.fn().mockResolvedValue(null),
      updateStatus: vi.fn().mockResolvedValue(null),
      updateResult: vi.fn().mockResolvedValue(null),
      attachEmail: vi.fn().mockResolvedValue(null),
      setReportKey: vi.fn().mockResolvedValue(null),
      markConverted: vi.fn().mockResolvedValue(null),
      countRecentByIpHash: vi.fn().mockResolvedValue(0),
      countRecentByDomain: vi.fn().mockResolvedValue(0),
      countGlobalToday: vi.fn().mockResolvedValue(0),
    },
    aiSuggestions: {
      findByCacheKey: vi.fn().mockResolvedValue(null),
      create: vi.fn().mockImplementation((data) =>
        Promise.resolve({
          id: 'ai-sug-1',
          cacheKey: data.cacheKey,
          ruleId: data.ruleId,
          platform: data.platform,
          suggestionMd: data.suggestionMd,
          model: data.model,
          tokensIn: data.tokensIn ?? 10,
          tokensOut: data.tokensOut ?? 50,
          flagged: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      flag: vi.fn().mockImplementation((cacheKey) =>
        Promise.resolve({
          id: 'ai-sug-1',
          cacheKey,
          flagged: true,
          updatedAt: new Date(),
        }),
      ),
      getMonthlyUsage: vi.fn().mockResolvedValue(0),
      incrementMonthlyUsage: vi.fn().mockResolvedValue(1),
      isFeatureEnabled: vi.fn().mockResolvedValue(true),
    },
    subscriptions: {
      findByOrgId: vi.fn().mockResolvedValue(null),
      findByPaddleSubscriptionId: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation((data) =>
        Promise.resolve({
          id: 'sub-1',
          orgId: data.orgId,
          paddleSubscriptionId: data.paddleSubscriptionId,
          paddlePriceId: data.paddlePriceId,
          plan: data.plan,
          interval: data.interval,
          status: data.status,
          currentPeriodStart: data.currentPeriodStart ?? new Date(),
          currentPeriodEnd:
            data.currentPeriodEnd ?? new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
          cancelAtPeriodEnd: data.cancelAtPeriodEnd ?? false,
          scheduledChange: data.scheduledChange ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
      setCancelAtPeriodEnd: vi.fn().mockImplementation((orgId, cancelAtPeriodEnd) =>
        Promise.resolve({
          id: 'sub-1',
          orgId,
          cancelAtPeriodEnd,
          updatedAt: new Date(),
        }),
      ),
    },
    invoices: {
      listByOrgId: vi.fn().mockResolvedValue([]),
      findByPaddleTransactionId: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation((data) =>
        Promise.resolve({
          id: 'inv-1',
          orgId: data.orgId,
          paddleTransactionId: data.paddleTransactionId,
          amountCents: data.amountCents,
          currency: data.currency,
          status: data.status,
          billedAt: data.billedAt,
          invoiceUrl: data.invoiceUrl ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
    },
    paddleEvents: {
      record: vi.fn().mockResolvedValue(true),
      findById: vi.fn().mockResolvedValue(null),
      markProcessed: vi.fn().mockResolvedValue(undefined),
      listRecent: vi.fn().mockResolvedValue([]),
      listFailed: vi.fn().mockResolvedValue([]),
    },
    branding: {
      findByOrgId: vi.fn().mockResolvedValue(null),
      upsert: vi.fn().mockImplementation((orgId, data) =>
        Promise.resolve({
          id: 'brand-1',
          orgId,
          displayName: data.displayName ?? null,
          logoLightKey: data.logoLightKey ?? null,
          logoDarkKey: data.logoDarkKey ?? null,
          primaryColor: data.primaryColor ?? null,
          emailSenderName: data.emailSenderName ?? null,
          reportFooter: data.reportFooter ?? null,
          hideProductBrand: data.hideProductBrand ?? false,
          customDomain: data.customDomain ?? null,
          customDomainVerifiedAt: null,
          customDomainVerifyToken: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      ),
    },
  } as unknown as Repositories;
  return { repos, join };
}

export const testGuardPolicy: GuardPolicy = {
  allowedPorts: [80, 443],
  isAllowedAddress: isPublicAddress,
  resolve: (hostname) =>
    Promise.resolve(
      hostname.includes('internal') || hostname.includes('private')
        ? ['10.0.0.1']
        : ['93.184.216.34'],
    ),
};

export function buildTestApp(
  options: {
    healthy?: boolean;
    turnstile?: TurnstileVerifier;
    auth?: Auth;
    repos?: Repositories;
    storage?: StorageService;
    freeChecksOptions?: FreeChecksRouterOptions;
  } = {},
) {
  const defaultRepos = fakeRepos();
  const repos = options.repos ?? defaultRepos.repos;
  const storage = options.storage ?? new MemoryStorageService();
  const freeChecksOptions: FreeChecksRouterOptions = {
    guardPolicy: testGuardPolicy,
    customRunner: () => Promise.resolve(),
    ...options.freeChecksOptions,
  };
  const app = createApp({
    config: testConfig,
    pool: fakePool(options.healthy ?? true),
    repos,
    verifyTurnstile: options.turnstile ?? (() => Promise.resolve(true)),
    auth: options.auth,
    storage,
    freeChecksOptions,
  });
  return { app, join: defaultRepos.join, repos, storage };
}
