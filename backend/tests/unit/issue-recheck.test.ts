import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { groupIssues } from '../../src/scanner/results/issues.js';
import { runPages } from '../../src/scanner/runner/page-runner.js';
import { silentLogger } from '../../src/scanner/types.js';
import { MemoryStorageService } from '../../src/storage/index.js';
import { handleIssueRecheck } from '../../src/worker/jobs/issue-recheck.js';
import type { WorkerContext } from '../../src/worker/types.js';
import { fakeRepos } from '../helpers/fakes.js';
import {
  fixturePolicy,
  html,
  startFixtureServer,
  type FixtureServer,
} from '../helpers/fixture-server.js';

const orgId = '11111111-1111-4111-a111-111111111111';
const issueId = '22222222-2222-4222-a222-222222222222';

describe('issue.recheck job (P2-14)', () => {
  let server: FixtureServer;
  let pageHtml = html('<main><img src="/logo.png"></main>');
  let fingerprint: string;

  beforeAll(async () => {
    server = await startFixtureServer({
      '/product': (_req, res) =>
        res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' }).end(pageHtml),
    });
    // The fingerprint the original scan would have stored for the missing alt text.
    const first = await runPages(
      [{ url: `http://127.0.0.1:${server.port}/product`, templateKey: 'product' }],
      {
        userAgent: 'test',
        standard: 'wcag22aa',
        policy: fixturePolicy(server.port),
        log: silentLogger,
      },
    );
    fingerprint = groupIssues(first.pages).find(
      (found) => found.ruleId === 'image-alt',
    )!.fingerprint;
  }, 60_000);

  afterAll(async () => {
    await server?.close();
  });

  function context() {
    const { repos } = fakeRepos();
    vi.mocked(repos.issues.findRawById).mockResolvedValue({
      id: issueId,
      orgId,
      siteId: 'site-1',
      fingerprint,
      status: 'open',
    } as never);
    vi.mocked(repos.sites.findRawById).mockResolvedValue({
      id: 'site-1',
      standard: 'wcag22aa',
    } as never);
    vi.mocked(repos.issues.listOccurrences).mockResolvedValue([
      { url: `http://127.0.0.1:${server.port}/product`, templateKey: 'product' },
    ] as never);
    const ctx: WorkerContext = {
      repos,
      storage: new MemoryStorageService(),
      scannerPolicy: fixturePolicy(server.port),
      userAgent: 'test',
    };
    return { ctx, repos };
  }

  it('keeps the issue open when the problem is still on the page', async () => {
    pageHtml = html('<main><img src="/logo.png"></main>');
    const { ctx, repos } = context();

    await expect(handleIssueRecheck({ issueId }, ctx)).resolves.toEqual({ status: 'still_open' });

    expect(repos.issues.markFixed).not.toHaveBeenCalled();
    expect(repos.issues.recordRecheck).toHaveBeenCalledWith(orgId, issueId, {
      outcome: 'still_open',
      pagesChecked: 1,
    });
  }, 60_000);

  it('marks the issue fixed when the page no longer has the problem', async () => {
    pageHtml = html('<main><img src="/logo.png" alt="Oakhaus logo"></main>');
    const { ctx, repos } = context();

    await expect(handleIssueRecheck({ issueId }, ctx)).resolves.toEqual({ status: 'fixed' });

    expect(repos.issues.markFixed).toHaveBeenCalledWith(orgId, issueId);
    expect(repos.issues.recordRecheck).toHaveBeenCalledWith(orgId, issueId, {
      outcome: 'fixed',
      pagesChecked: 1,
    });
  }, 60_000);

  it('changes nothing when no page could be loaded', async () => {
    const { ctx, repos } = context();
    vi.mocked(repos.issues.listOccurrences).mockResolvedValue([
      { url: `http://127.0.0.1:${server.port}/gone`, templateKey: 'product' },
    ] as never);

    await expect(handleIssueRecheck({ issueId }, ctx)).resolves.toEqual({ status: 'unchecked' });

    expect(repos.issues.markFixed).not.toHaveBeenCalled();
  }, 60_000);
});
