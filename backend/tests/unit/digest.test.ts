import { describe, expect, it, vi } from 'vitest';
import { handleWeeklyDigest } from '../../src/worker/jobs/digest-weekly.js';
import { fakeRepos } from '../helpers/fakes.js';
import type { WorkerContext } from '../../src/worker/types.js';
import { EmailSender, MockTransport } from '../../src/emails/sender.js';
import type { OrgId } from '../../src/db/repositories/org-scope.js';

describe('P5-06: Weekly Digest (digest.weekly)', () => {
  it('skips orgs that are not at Monday 07:00 local time unless forced', async () => {
    const { repos } = fakeRepos();
    const transport = new MockTransport();
    const emailSender = new EmailSender({ transport });

    repos.organizations.listAllActive = vi
      .fn()
      .mockResolvedValue([{ id: 'org-1', name: 'Acme Corp', timeZone: 'America/New_York' }]);

    const ctx: WorkerContext = {
      repos: repos,
      storage: {} as never,
      emailSender,
    };

    // Run without force when current time is not Monday 7am in America/New_York
    // (e.g. mock date if needed, or rely on normal execution)
    const result = await handleWeeklyDigest(undefined, ctx);

    // Unless the test machine happens to run exactly at Monday 7am in NY, this org is skipped
    expect(result.processedOrgs).toBe(0);
    expect(transport.sent.length).toBe(0);
  });

  it('processes weekly digest when forced and dispatches E-10 to opted-in members', async () => {
    const { repos } = fakeRepos();
    const transport = new MockTransport();
    const emailSender = new EmailSender({ transport });

    const orgId = '11111111-1111-4111-8111-111111111111' as OrgId;
    const org = { id: orgId, name: 'Brightline Corp', timeZone: 'UTC' };

    repos.organizations.findById = vi.fn().mockResolvedValue(org);
    repos.organizations.listAllActive = vi.fn().mockResolvedValue([org]);

    // Audit log: not sent yet
    repos.auditLog.hasActionWithKey = vi.fn().mockResolvedValue(false);
    repos.auditLog.write = vi.fn().mockResolvedValue({ id: 'audit-1' });

    // Opted-in members
    repos.notifications.listOptedInMembers = vi.fn().mockResolvedValue([
      { userId: 'user-1', email: 'alice@example.com', name: 'Alice' },
      { userId: 'user-2', email: 'bob@example.com', name: 'Bob' },
    ]);

    // Sites
    repos.sites.list = vi.fn().mockResolvedValue([
      { id: 'site-1', orgId, name: 'Main Store', score: 92 },
      { id: 'site-2', orgId, name: 'Docs Portal', score: 85 },
    ]);

    const summariesMap = new Map([
      [
        'site-1',
        {
          previousScore: 88,
          regressions: 1,
          openCritical: 0,
          openSerious: 2,
          lastScanAt: new Date(),
          lastScanStatus: 'completed',
          lastScanError: null,
        },
      ],
      [
        'site-2',
        {
          previousScore: 85,
          regressions: 0,
          openCritical: 1,
          openSerious: 1,
          lastScanAt: new Date(),
          lastScanStatus: 'completed',
          lastScanError: null,
        },
      ],
    ]);
    repos.sites.listSummaries = vi.fn().mockResolvedValue(summariesMap);

    repos.issues.getWeeklyStats = vi.fn().mockImplementation((_orgId, siteId) => {
      if (siteId === 'site-1') return Promise.resolve({ newCount: 3, fixedCount: 5 });
      return Promise.resolve({ newCount: 0, fixedCount: 2 });
    });

    // Overdue tasks: Alice has 2 overdue, Bob has 0
    repos.issues.countOverdueAssigned = vi.fn().mockImplementation((_orgId, userId) => {
      if (userId === 'user-1') return Promise.resolve(2);
      return Promise.resolve(0);
    });

    repos.branding.findByOrgId = vi.fn().mockResolvedValue(null);

    const ctx: WorkerContext = {
      repos: repos,
      storage: {} as never,
      emailSender,
    };

    const result = await handleWeeklyDigest({ orgId, force: true }, ctx);

    expect(result.processedOrgs).toBe(1);
    expect(result.sentEmails).toBe(2);
    expect(transport.sent.length).toBe(2);

    const aliceEmail = transport.sent.find((s) => s.to === 'alice@example.com');
    const bobEmail = transport.sent.find((s) => s.to === 'bob@example.com');

    expect(aliceEmail).toBeDefined();
    expect(bobEmail).toBeDefined();

    expect(aliceEmail?.subject).toContain('Weekly accessibility digest for Brightline Corp');
    expect(aliceEmail?.html).toContain('Main Store');
    expect(aliceEmail?.html).toContain('+4'); // 92 - 88
    expect(aliceEmail?.html).toContain('2 overdue accessibility tasks');

    expect(bobEmail?.html).not.toContain('2 overdue accessibility tasks');

    // Audit log records action
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      orgId,
      expect.objectContaining({
        action: 'digest.weekly',
      }),
    );
  });

  it('is idempotent and skips if already sent for the week', async () => {
    const { repos } = fakeRepos();
    const transport = new MockTransport();
    const emailSender = new EmailSender({ transport });

    const orgId = '11111111-1111-4111-8111-111111111111' as OrgId;
    repos.organizations.findById = vi.fn().mockResolvedValue({ id: orgId, name: 'Brightline' });

    // hasActionWithKey returns true -> already sent
    repos.auditLog.hasActionWithKey = vi.fn().mockResolvedValue(true);

    const ctx: WorkerContext = {
      repos: repos,
      storage: {} as never,
      emailSender,
    };

    const result = await handleWeeklyDigest({ orgId, force: true }, ctx);

    expect(result.processedOrgs).toBe(0);
    expect(result.sentEmails).toBe(0);
    expect(transport.sent.length).toBe(0);
  });

  it('skips orgs with no opted-in members', async () => {
    const { repos } = fakeRepos();
    const transport = new MockTransport();
    const emailSender = new EmailSender({ transport });

    const orgId = '11111111-1111-4111-8111-111111111111' as OrgId;
    repos.organizations.findById = vi.fn().mockResolvedValue({ id: orgId, name: 'Brightline' });
    repos.auditLog.hasActionWithKey = vi.fn().mockResolvedValue(false);
    repos.notifications.listOptedInMembers = vi.fn().mockResolvedValue([]);

    const ctx: WorkerContext = {
      repos: repos,
      storage: {} as never,
      emailSender,
    };

    const result = await handleWeeklyDigest({ orgId, force: true }, ctx);

    expect(result.processedOrgs).toBe(0);
    expect(result.sentEmails).toBe(0);
    expect(transport.sent.length).toBe(0);
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      orgId,
      expect.objectContaining({
        data: expect.objectContaining({ skipped: 'no_opted_in_members' }),
      }),
    );
  });
});
