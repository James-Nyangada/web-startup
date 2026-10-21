import { describe, expect, it, vi } from 'vitest';
import { fakeRepos } from '../helpers/fakes.js';
import { handleReportSchedule, isScheduleDue } from '../../src/worker/jobs/report-schedule.js';
import { EmailSender, MockTransport } from '../../src/emails/sender.js';
import type { WorkerContext } from '../../src/worker/types.js';
import type { OrgId } from '../../src/db/repositories/org-scope.js';

describe('P5-08: Scheduled Client Reports (report.schedule)', () => {
  it('creates and filters report schedules with day of month (1-28) and recipients (1-10)', async () => {
    const { repos } = fakeRepos();
    const orgId = '11111111-1111-4111-8111-111111111111' as OrgId;
    const siteId = '22222222-2222-4222-8222-222222222222';

    const schedule = await repos.reportSchedules.create(orgId, {
      siteId,
      recipients: ['client@example.com', 'team@example.com'],
      dayOfMonth: 15,
      active: true,
    });

    expect(schedule.id).toBeDefined();
    expect(schedule.dayOfMonth).toBe(15);
    expect(schedule.recipients).toEqual(['client@example.com', 'team@example.com']);
    expect(schedule.active).toBe(true);

    // List by site
    const siteSchedules = await repos.reportSchedules.listBySite(orgId, siteId);
    expect(siteSchedules.length).toBe(1);
    expect(siteSchedules[0]!.id).toBe(schedule.id);

    // Find due schedules
    const dueDay15 = await repos.reportSchedules.findDueSchedules(15);
    expect(dueDay15.length).toBe(1);

    // Days after the scheduled day still match, so a missed run is caught up
    const dueDay16 = await repos.reportSchedules.findDueSchedules(16);
    expect(dueDay16.length).toBe(1);

    const dueDay14 = await repos.reportSchedules.findDueSchedules(14);
    expect(dueDay14.length).toBe(0);

    // Update schedule
    const updated = await repos.reportSchedules.update(orgId, schedule.id, {
      active: false,
      dayOfMonth: 20,
    });
    expect(updated?.active).toBe(false);
    expect(updated?.dayOfMonth).toBe(20);

    // Delete schedule
    const deleted = await repos.reportSchedules.delete(orgId, schedule.id);
    expect(deleted).toBe(true);
    const afterDelete = await repos.reportSchedules.listBySite(orgId, siteId);
    expect(afterDelete.length).toBe(0);
  });

  it('skips schedule execution if the organization plan lacks scheduledClientReports', async () => {
    const { repos } = fakeRepos();
    const transport = new MockTransport();
    const emailSender = new EmailSender({ transport });

    const orgId = '11111111-1111-4111-8111-111111111111' as OrgId;
    const siteId = '22222222-2222-4222-8222-222222222222';

    // Store plan does NOT support scheduled client reports
    repos.organizations.findById = vi.fn().mockResolvedValue({
      id: orgId,
      name: 'Small Shop',
      plan: 'store',
      billingStatus: 'active',
    });

    repos.sites.findById = vi.fn().mockResolvedValue({
      id: siteId,
      orgId,
      name: 'Small Storefront',
    });

    const schedule = await repos.reportSchedules.create(orgId, {
      siteId,
      recipients: ['client@example.com'],
      dayOfMonth: 1,
      active: true,
    });

    const ctx: WorkerContext = {
      repos,
      storage: {
        putObject: vi.fn().mockResolvedValue(undefined),
        getObject: vi.fn().mockResolvedValue(null),
      } as never,
      emailSender,
    };

    const result = await handleReportSchedule({ scheduleId: schedule.id }, ctx);
    expect(result.processed).toBe(0);
    expect(result.skippedNonAgency).toBe(1);
    expect(transport.sent.length).toBe(0);
  });

  it('generates R-04 client monthly report and dispatches E-12 email with white-label branding', async () => {
    const { repos } = fakeRepos();
    const transport = new MockTransport();
    const emailSender = new EmailSender({ transport });

    const orgId = '11111111-1111-4111-8111-111111111111' as OrgId;
    const siteId = '22222222-2222-4222-8222-222222222222';

    repos.organizations.findById = vi.fn().mockResolvedValue({
      id: orgId,
      name: 'Alpha Agency',
      plan: 'agency',
      billingStatus: 'active',
      publicId: 'alpha-agency',
    });

    repos.sites.findById = vi.fn().mockResolvedValue({
      id: siteId,
      orgId,
      name: 'Client Storefront',
      url: 'https://store.client.com',
      publicId: 'site-pub-123',
      score: 88,
    });

    repos.branding.findByOrgId = vi.fn().mockResolvedValue({
      id: 'brand-1',
      orgId,
      logoLightKey: 'https://cdn.example.com/agency-logo.png',
      primaryColor: '#0055ff',
      displayName: 'Alpha Agency',
      createdAt: new Date(),
      updatedAt: new Date(),
      logoDarkKey: null,
      emailSenderName: 'Alpha Agency Audits',
      portalTitle: 'Client Accessibility Portal',
      reportFooter: null,
      customDomain: null,
      customDomainStatus: null,
      customDomainVerifyToken: null,
    });

    const schedule = await repos.reportSchedules.create(orgId, {
      siteId,
      recipients: ['client-exec@client.com', 'cto@client.com'],
      dayOfMonth: 1,
      active: true,
    });

    const putObjectMock = vi.fn().mockResolvedValue(undefined);
    const ctx: WorkerContext = {
      repos,
      storage: {
        putObject: putObjectMock,
        getObject: vi.fn().mockResolvedValue(null),
      } as never,
      emailSender,
    };

    const result = await handleReportSchedule({ scheduleId: schedule.id }, ctx);
    expect(result.processed).toBe(1);
    expect(result.reportsGenerated).toBe(1);
    expect(result.emailsDispatched).toBe(2);

    // E-12 was dispatched to both recipients
    expect(transport.sent.length).toBe(2);
    expect(transport.sent[0]!.to).toBe('client-exec@client.com');
    expect(transport.sent[0]!.subject).toContain('accessibility report');
    expect(transport.sent[1]!.to).toBe('cto@client.com');

    // The link is a signed token that works without a session, not the org-scoped route
    expect(transport.sent[0]!.html).toContain('/v1/reports/download/');
    expect(transport.sent[0]!.html).not.toContain(`/v1/orgs/${orgId}/reports/`);

    // Sending is recorded on the evidence timeline
    expect(repos.evidenceEvents.record).toHaveBeenCalledWith(
      orgId,
      expect.objectContaining({ siteId, type: 'report_sent' }),
    );

    // Storage saved PDF & HTML
    expect(putObjectMock).toHaveBeenCalled();

    // Schedule lastSentAt was updated
    const updatedSchedule = await repos.reportSchedules.findById(orgId, schedule.id);
    expect(updatedSchedule?.lastSentAt).toBeDefined();
  });

  it('isScheduleDue catches up missed days but sends once per month', () => {
    const now = new Date('2026-10-20T06:00:00Z');
    const createdAt = new Date('2026-09-01T00:00:00Z');

    expect(isScheduleDue({ dayOfMonth: 20, lastSentAt: null, createdAt }, now)).toBe(true);
    // Day 15 was missed (outage or failure): still due on the 20th
    expect(isScheduleDue({ dayOfMonth: 15, lastSentAt: null, createdAt }, now)).toBe(true);
    // Already sent this month
    expect(
      isScheduleDue(
        { dayOfMonth: 15, lastSentAt: new Date('2026-10-15T06:00:00Z'), createdAt },
        now,
      ),
    ).toBe(false);
    // Sent last month, due again this month
    expect(
      isScheduleDue(
        { dayOfMonth: 15, lastSentAt: new Date('2026-09-15T06:00:00Z'), createdAt },
        now,
      ),
    ).toBe(true);
    // Day not reached yet
    expect(isScheduleDue({ dayOfMonth: 21, lastSentAt: null, createdAt }, now)).toBe(false);
    // Created after this month's day: waits for next month instead of sending immediately
    expect(
      isScheduleDue(
        { dayOfMonth: 1, lastSentAt: null, createdAt: new Date('2026-10-19T00:00:00Z') },
        now,
      ),
    ).toBe(false);
  });

  it('fails the job (so pg-boss retries) and sends no email when rendering fails', async () => {
    const { repos } = fakeRepos();
    const transport = new MockTransport();
    const emailSender = new EmailSender({ transport });
    const orgId = '11111111-1111-4111-8111-111111111111' as OrgId;
    const siteId = '22222222-2222-4222-8222-222222222222';

    repos.organizations.findById = vi.fn().mockResolvedValue({
      id: orgId,
      name: 'Alpha Agency',
      plan: 'agency',
      billingStatus: 'active',
    });
    repos.sites.findById = vi
      .fn()
      .mockResolvedValue({ id: siteId, orgId, name: 'Client', score: 80 });

    const schedule = await repos.reportSchedules.create(orgId, {
      siteId,
      recipients: ['client@client.com'],
      dayOfMonth: 1,
      active: true,
    });

    const ctx: WorkerContext = {
      repos,
      storage: {
        putObject: vi.fn().mockRejectedValue(new Error('R2 unavailable')),
        getObject: vi.fn().mockResolvedValue(null),
      } as never,
      emailSender,
    };

    await expect(handleReportSchedule({ scheduleId: schedule.id }, ctx)).rejects.toThrow(
      /1 schedule\(s\) failed/,
    );
    expect(transport.sent.length).toBe(0);
    const after = await repos.reportSchedules.findById(orgId, schedule.id);
    expect(after?.lastSentAt).toBeNull();
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      orgId,
      expect.objectContaining({ action: 'report.schedule.failed', targetId: schedule.id }),
    );
  });
});
