import { describe, expect, it, vi } from 'vitest';
import type { Repositories } from '../../src/db/repositories/index.js';
import { handleScanProcess } from '../../src/worker/jobs/scan-process.js';
import { handleReportRender } from '../../src/worker/jobs/report-render.js';
import { handleWebhookDeliver } from '../../src/worker/jobs/webhook-deliver.js';
import { MemoryStorageService } from '../../src/storage/index.js';
import { EmailSender, MockTransport } from '../../src/emails/sender.js';
import type { WorkerContext } from '../../src/worker/types.js';
import { testGuardPolicy } from '../helpers/fakes.js';

const orgId = '11111111-1111-4111-a111-111111111111';
const siteId = '22222222-2222-4222-a222-222222222222';

interface ScanSetup {
  trigger?: string;
  requestedBy?: string | null;
  createdCount?: number;
  regressedCount?: number;
  members?: Array<{ userId: string; email: string; scanCompleted: 'all' | 'issues_only' }>;
}

async function runScan(setup: ScanSetup, ctxExtra: Partial<WorkerContext> = {}) {
  const storage = new MemoryStorageService();
  await storage.putObject(
    'scans/raw.json',
    JSON.stringify({
      score: 81,
      pagesScanned: 3,
      pagesPlanned: 3,
      status: 'completed',
      pages: [],
      issues: [],
    }),
  );
  const createInAppBatch = vi.fn().mockResolvedValue(undefined);
  const repos = {
    scans: {
      findRawById: vi.fn().mockResolvedValue({
        id: 'scan-9',
        orgId,
        siteId,
        status: 'processing',
        trigger: setup.trigger ?? 'scheduled',
        requestedBy: setup.requestedBy ?? null,
        rawKey: 'scans/raw.json',
      }),
      updateRaw: vi.fn().mockResolvedValue(undefined),
      listBySite: vi.fn().mockResolvedValue([{ score: 81 }, { score: 74 }]),
    },
    sites: {
      findRawById: vi
        .fn()
        .mockResolvedValue({ id: siteId, name: 'Oakhaus', rootUrl: 'https://oakhaus.com' }),
    },
    users: {
      findById: vi.fn().mockResolvedValue({ id: 'requester', email: 'new@oakhaus.com' }),
    },
    pages: { listBySite: vi.fn().mockResolvedValue([]) },
    issues: {
      listForDiff: vi.fn().mockResolvedValue([]),
      applyScanDiff: vi.fn().mockResolvedValue({
        createdCount: setup.createdCount ?? 0,
        fixedCount: 2,
        regressedCount: setup.regressedCount ?? 0,
        fixedIssues: [],
        regressedIssues: [],
      }),
    },
    evidenceEvents: { record: vi.fn().mockResolvedValue(undefined) },
    notifications: {
      listOptedInMembers: vi
        .fn()
        .mockImplementation((_o: string, pref: string) =>
          Promise.resolve(pref === 'scanCompleted' ? (setup.members ?? []) : []),
        ),
      createInAppBatch,
    },
    auditLog: {
      hasActionWithKey: vi.fn().mockResolvedValue(false),
      write: vi.fn().mockResolvedValue(undefined),
    },
  } as unknown as Repositories;
  const transport = new MockTransport();
  await handleScanProcess(
    { scanId: 'scan-9' },
    {
      repos,
      storage,
      emailSender: new EmailSender({ transport }),
      pool: { query: vi.fn() } as never,
      ...ctxExtra,
    },
  );
  return { transport, createInAppBatch };
}

describe('P5-05: scan finished notifications (E-06, E-07)', () => {
  it('sends E-07 to "all" members, and to "issues_only" members only when issues were found', async () => {
    const members = [
      { userId: 'u-all', email: 'all@x.com', scanCompleted: 'all' as const },
      { userId: 'u-issues', email: 'issues@x.com', scanCompleted: 'issues_only' as const },
    ];

    const clean = await runScan({ members });
    expect(clean.transport.sent.map((m) => m.to)).toEqual(['all@x.com']);
    expect(clean.createInAppBatch).toHaveBeenCalledWith(
      orgId,
      ['u-all'],
      expect.objectContaining({ type: 'scan_completed', link: `/sites/${siteId}/scans/scan-9` }),
    );

    const withIssues = await runScan({ members, createdCount: 3 });
    expect(withIssues.transport.sent.map((m) => m.to).sort()).toEqual([
      'all@x.com',
      'issues@x.com',
    ]);
    // Change against the previous scan (74 -> 81)
    expect(withIssues.transport.sent[0]!.subject).toContain('Score 81/100 (+7)');
  });

  it('sends E-06 to the onboarding requester instead of E-07', async () => {
    const { transport, createInAppBatch } = await runScan({
      trigger: 'onboarding',
      requestedBy: 'requester',
      members: [{ userId: 'requester', email: 'new@oakhaus.com', scanCompleted: 'all' }],
    });
    expect(transport.sent).toHaveLength(1);
    expect(transport.sent[0]!.to).toBe('new@oakhaus.com');
    expect(transport.sent[0]!.subject.toLowerCase()).toContain('first');
    expect(createInAppBatch).toHaveBeenCalledWith(
      orgId,
      ['requester'],
      expect.objectContaining({ type: 'first_scan_ready' }),
    );
  });

  it('queues emails through pg-boss in the worker (which has no emailSender)', async () => {
    const send = vi.fn().mockResolvedValue('job-1');
    const { transport } = await runScan(
      { members: [{ userId: 'u', email: 'all@x.com', scanCompleted: 'all' }] },
      { boss: { send } as never },
    );
    expect(transport.sent).toHaveLength(0);
    expect(send).toHaveBeenCalledWith(
      'email.send',
      expect.objectContaining({ to: 'all@x.com', templateId: 'E-07' }),
      expect.anything(),
    );
  });
});

describe('P5-05: in-app mirrors of E-11 and E-21', () => {
  it('tells the requester in-app when their report is ready', async () => {
    const createInAppBatch = vi.fn().mockResolvedValue(undefined);
    const repos = {
      reports: {
        findRawById: vi.fn().mockResolvedValue({
          id: 'rep-1',
          orgId,
          siteId,
          scanId: null,
          type: 'agency_overview',
          status: 'queued',
          requestedBy: 'user-1',
        }),
        updateStatus: vi.fn().mockResolvedValue(undefined),
      },
      organizations: { findById: vi.fn().mockResolvedValue({ id: orgId, name: 'Agency' }) },
      sites: {
        list: vi.fn().mockResolvedValue([]),
        listSummaries: vi.fn().mockResolvedValue(new Map()),
      },
      issues: { listCrossSiteCommonIssues: vi.fn().mockResolvedValue([]) },
      evidenceEvents: { record: vi.fn().mockResolvedValue(undefined) },
      notifications: { createInAppBatch },
      auditLog: { write: vi.fn().mockResolvedValue(undefined) },
    } as unknown as Repositories;

    await handleReportRender({ reportId: 'rep-1' }, { repos, storage: new MemoryStorageService() });

    expect(createInAppBatch).toHaveBeenCalledWith(
      orgId,
      ['user-1'],
      expect.objectContaining({ type: 'report_ready', link: `/sites/${siteId}/reports` }),
    );
  });

  it('tells owners and admins in-app when a webhook is auto-disabled', async () => {
    const createInAppBatch = vi.fn().mockResolvedValue(undefined);
    const repos = {
      webhooks: {
        findRawById: vi.fn().mockResolvedValue({
          id: 'wh-1',
          orgId,
          kind: 'generic',
          url: 'https://hooks.example.com/x',
          active: true,
          secret: null,
        }),
        logDelivery: vi.fn().mockResolvedValue(undefined),
        recordDeliveryResult: vi.fn().mockResolvedValue({ autoDisabled: true }),
      },
      organizations: { findById: vi.fn().mockResolvedValue({ id: orgId, name: 'Acme' }) },
      memberships: {
        list: vi.fn().mockResolvedValue([
          { userId: 'owner-1', role: 'owner' },
          { userId: 'member-1', role: 'member' },
        ]),
      },
      users: { findById: vi.fn().mockResolvedValue({ email: 'owner@acme.com' }) },
      notifications: { createInAppBatch },
    } as unknown as Repositories;

    await expect(
      handleWebhookDeliver(
        { webhookId: 'wh-1', event: 'scan.completed', payload: {} },
        {
          repos,
          storage: {} as never,
          emailSender: new EmailSender({ transport: new MockTransport() }),
          scannerPolicy: testGuardPolicy,
          webhookTransport: vi.fn().mockResolvedValue({ status: 500, ok: false, text: '' }),
        },
      ),
    ).rejects.toThrow();

    expect(createInAppBatch).toHaveBeenCalledWith(
      orgId,
      ['owner-1'],
      expect.objectContaining({ type: 'webhook_disabled', link: '/settings/integrations' }),
    );
  });
});
