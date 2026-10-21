import { describe, expect, it, vi } from 'vitest';
import { handleRetentionPrune } from '../../src/worker/jobs/retention-prune.js';
import { fakeRepos } from '../helpers/fakes.js';
import type { WorkerContext } from '../../src/worker/types.js';
import type { OrgId } from '../../src/db/repositories/org-scope.js';

describe('P5-10: Data Retention (retention.prune)', () => {
  it('runs dry-run mode without deleting R2 objects or transient DB rows', async () => {
    const { repos } = fakeRepos();
    const orgId = '11111111-1111-4111-8111-111111111111' as OrgId;

    repos.organizations.listAllActive = vi
      .fn()
      .mockResolvedValue([{ id: orgId, name: 'Acme Growth Org', plan: 'growth' }]);

    repos.retention.getPrunableStats = vi.fn().mockResolvedValue({
      occurrencesCount: 154,
      pagesCount: 32,
      rawKeys: ['scans/raw-1.json', 'scans/raw-2.json'],
    });

    const deleteObjectMock = vi.fn().mockResolvedValue(undefined);
    const ctx: WorkerContext = {
      repos,
      storage: {
        deleteObject: deleteObjectMock,
      } as never,
    };

    const report = await handleRetentionPrune({ dryRun: true }, ctx);

    expect(report.dryRun).toBe(true);
    expect(report.orgsEvaluated).toBe(1);
    expect(report.occurrencesPruned).toBe(154);
    expect(report.pagesPruned).toBe(32);
    expect(report.rawFilesPruned).toBe(2);

    // In dry run, no R2 deletion or DB pruning occurs
    expect(deleteObjectMock).not.toHaveBeenCalled();
    expect(repos.retention.pruneTransientData).not.toHaveBeenCalled();

    // The staff report is a system log line, never a row in a customer's audit log
    expect(repos.auditLog.write).not.toHaveBeenCalled();
    // Dry run deletes nothing, including the webhook delivery log
    expect(repos.webhooks.pruneDeliveries).not.toHaveBeenCalled();
  });

  it('prunes transient occurrences, page results, and R2 raw files per plan retention window in live mode', async () => {
    const { repos } = fakeRepos();
    const trialOrgId = '11111111-1111-4111-8111-111111111111' as OrgId;
    const agencyOrgId = '22222222-2222-4222-8222-222222222222' as OrgId;

    repos.organizations.listAllActive = vi.fn().mockResolvedValue([
      { id: trialOrgId, name: 'Trial Org', plan: 'trial' },
      { id: agencyOrgId, name: 'Agency Pro Org', plan: 'agency_pro' },
    ]);

    // Trial stats (1 month retention)
    repos.retention.getPrunableStats = vi.fn().mockImplementation((orgId) => {
      if (orgId === trialOrgId) {
        return Promise.resolve({
          occurrencesCount: 45,
          pagesCount: 10,
          rawKeys: ['scans/trial-old.json'],
        });
      }
      return Promise.resolve({
        occurrencesCount: 120,
        pagesCount: 25,
        rawKeys: ['scans/agency-old.json'],
      });
    });

    repos.retention.pruneTransientData = vi.fn().mockImplementation((orgId) => {
      if (orgId === trialOrgId) {
        return Promise.resolve({ occurrencesDeleted: 45, pagesDeleted: 10 });
      }
      return Promise.resolve({ occurrencesDeleted: 120, pagesDeleted: 25 });
    });

    const deleteObjectMock = vi.fn().mockResolvedValue(undefined);
    const ctx: WorkerContext = {
      repos,
      storage: {
        deleteObject: deleteObjectMock,
      } as never,
    };

    const report = await handleRetentionPrune({ dryRun: false }, ctx);

    expect(report.dryRun).toBe(false);
    expect(report.orgsEvaluated).toBe(2);
    expect(report.occurrencesPruned).toBe(165);
    expect(report.pagesPruned).toBe(35);
    expect(report.rawFilesPruned).toBe(2);

    // R2 files deleted
    expect(deleteObjectMock).toHaveBeenCalledTimes(2);
    expect(deleteObjectMock).toHaveBeenCalledWith('scans/trial-old.json');
    expect(deleteObjectMock).toHaveBeenCalledWith('scans/agency-old.json');

    // DB transient data pruned
    expect(repos.retention.pruneTransientData).toHaveBeenCalledTimes(2);

    // Check retention windows passed
    expect(report.details[0]!.plan).toBe('trial');
    expect(report.details[0]!.retentionMonths).toBe(1); // 30 days
    expect(report.details[1]!.plan).toBe('agency_pro');
    expect(report.details[1]!.retentionMonths).toBe(24); // 24 months
  });

  it('purges soft-deleted organizations older than 30 days', async () => {
    const { repos } = fakeRepos();
    const deletedOrgId = '99999999-9999-4999-8999-999999999999' as OrgId;

    repos.organizations.listAllActive = vi.fn().mockResolvedValue([]);
    repos.retention.findPurgeableOrgs = vi
      .fn()
      .mockResolvedValue([{ id: deletedOrgId, name: 'Abandoned Org' }]);

    const ctx: WorkerContext = {
      repos,
      storage: {
        deleteObject: vi.fn().mockResolvedValue(undefined),
      } as never,
    };

    const report = await handleRetentionPrune({ dryRun: false }, ctx);
    expect(report.deletedOrgsPurged).toBe(1);
    expect(repos.retention.purgeOrganization).toHaveBeenCalledWith(deletedOrgId);
  });

  it("deletes a purged org's stored files and reports purges that fail", async () => {
    const { repos } = fakeRepos();
    const goneOrg = '99999999-9999-4999-8999-999999999999' as OrgId;
    const stuckOrg = '88888888-8888-4888-8888-888888888888' as OrgId;

    repos.organizations.listAllActive = vi.fn().mockResolvedValue([]);
    repos.retention.findPurgeableOrgs = vi.fn().mockResolvedValue([
      { id: goneOrg, name: 'Gone' },
      { id: stuckOrg, name: 'Stuck' },
    ]);
    repos.retention.listOrgFileKeys = vi
      .fn()
      .mockImplementation((orgId: string) =>
        Promise.resolve(
          orgId === goneOrg ? [`scans/${goneOrg}/s1/raw.json`, `reports/${goneOrg}/r1.pdf`] : [],
        ),
      );
    repos.retention.purgeOrganization = vi
      .fn()
      .mockImplementation((orgId: string) =>
        orgId === stuckOrg
          ? Promise.reject(new Error('evidence_events is append-only'))
          : Promise.resolve(true),
      );

    const deleteObject = vi.fn().mockResolvedValue(undefined);
    const ctx: WorkerContext = { repos, storage: { deleteObject } as never };

    const report = await handleRetentionPrune({ dryRun: false }, ctx);

    expect(deleteObject).toHaveBeenCalledWith(`scans/${goneOrg}/s1/raw.json`);
    expect(deleteObject).toHaveBeenCalledWith(`reports/${goneOrg}/r1.pdf`);
    expect(report.deletedOrgsPurged).toBe(1);
    expect(report.purgeFailures).toEqual([stuckOrg]);
    // Webhook delivery log is trimmed to 30 days
    expect(repos.webhooks.pruneDeliveries).toHaveBeenCalledWith(expect.any(Date));
  });
});
