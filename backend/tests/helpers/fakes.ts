import type pg from 'pg';
import { vi } from 'vitest';
import { createApp } from '../../src/app.js';
import type { Auth } from '../../src/lib/auth.js';
import type { Repositories } from '../../src/db/repositories/index.js';
import type { TurnstileVerifier } from '../../src/lib/turnstile.js';

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
      isSlugAvailable: vi.fn().mockResolvedValue(true),
      createWithInitialOwner: vi.fn().mockResolvedValue(null),
    },
    memberships: {
      list: vi.fn().mockResolvedValue([]),
      findRole: vi.fn().mockResolvedValue(null),
      add: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue(null),
      updateRole: vi.fn().mockResolvedValue(null),
      remove: vi.fn().mockResolvedValue(null),
    },
    auditLog: {
      write: vi.fn().mockResolvedValue(undefined),
      list: vi.fn().mockResolvedValue([]),
    },
    sites: {
      list: vi.fn().mockResolvedValue([]),
      findById: vi.fn().mockResolvedValue(null),
      findByRootUrl: vi.fn().mockResolvedValue(null),
      count: vi.fn().mockResolvedValue(0),
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
    },
    issues: {
      listForDiff: vi.fn().mockResolvedValue([]),
      applyScanDiff: vi.fn().mockResolvedValue({ createdCount: 0, fixedCount: 0, regressedCount: 0 }),
      listBySite: vi.fn().mockResolvedValue([]),
      countBySite: vi.fn().mockResolvedValue(0),
      findById: vi.fn().mockResolvedValue(null),
      listTopIssues: vi.fn().mockResolvedValue([]),
      getSeverityCounts: vi.fn().mockResolvedValue({ critical: 0, serious: 0, moderate: 0, minor: 0 }),
      getDiffSummary: vi.fn().mockResolvedValue({ newCount: 0, fixedCount: 0, regressedCount: 0, sinceDate: null }),
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
  } as unknown as Repositories;
  return { repos, join };
}

export function buildTestApp(
  options: {
    healthy?: boolean;
    turnstile?: TurnstileVerifier;
    auth?: Auth;
    repos?: Repositories;
  } = {},
) {
  const defaultRepos = fakeRepos();
  const repos = options.repos ?? defaultRepos.repos;
  const app = createApp({
    config: testConfig,
    pool: fakePool(options.healthy ?? true),
    repos,
    verifyTurnstile: options.turnstile ?? (() => Promise.resolve(true)),
    auth: options.auth,
  });
  return { app, join: defaultRepos.join, repos };
}
