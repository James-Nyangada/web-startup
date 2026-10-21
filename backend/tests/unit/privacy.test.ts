import zlib from 'node:zlib';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { renderEmail, getSampleTemplateData } from '../../src/emails/renderer.js';
import { EmailSender, MockTransport } from '../../src/emails/sender.js';
import { createZip } from '../../src/lib/zip.js';
import { MemoryStorageService } from '../../src/storage/index.js';
import { handleDataExport } from '../../src/worker/jobs/data-export.js';
import { handleRetentionPrune } from '../../src/worker/jobs/retention-prune.js';
import type { WorkerContext } from '../../src/worker/types.js';
import { ErrorCode } from '../../src/shared/errors.js';
import { buildTestApp, fakeRepos, mockAuth } from '../helpers/fakes.js';

const EXPORT_ID = '018f0000-0000-7000-8000-0000000000f1';

/** Reads entry names and contents back out of a zip produced by createZip. */
function unzip(buf: Buffer): Record<string, string> {
  const out: Record<string, string> = {};
  let p = 0;
  while (buf.readUInt32LE(p) === 0x04034b50) {
    const size = buf.readUInt32LE(p + 18);
    const nameLen = buf.readUInt16LE(p + 26);
    const name = buf.subarray(p + 30, p + 30 + nameLen).toString('utf8');
    const body = buf.subarray(p + 30 + nameLen, p + 30 + nameLen + size);
    out[name] = zlib.inflateRawSync(body).toString('utf8');
    p += 30 + nameLen + size;
  }
  return out;
}

function exportRow(overrides: Record<string, unknown> = {}) {
  return {
    id: EXPORT_ID,
    userId: 'user-1',
    status: 'ready',
    fileKey: 'exports/user-1/x.zip',
    fileSize: 100,
    error: null,
    expiresAt: new Date(Date.now() + 86_400_000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

describe('P6-09: personal data export', () => {
  it('queues an export and audits the request', async () => {
    const auth = mockAuth('user-1');
    const { app, repos } = buildTestApp({ auth });
    vi.mocked(repos.privacy.createExport).mockResolvedValue(
      exportRow({ status: 'queued', fileKey: null }) as never,
    );
    const res = await request(app).post('/v1/me/export').set('Cookie', auth.cookie).expect(202);
    expect(res.body.data.export.id).toBe(EXPORT_ID);
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ action: 'privacy.export_requested' }),
    );
  });

  it('allows one export a day', async () => {
    const auth = mockAuth('user-1');
    const { app, repos } = buildTestApp({ auth });
    vi.mocked(repos.privacy.listExports).mockResolvedValue([exportRow()] as never);
    const res = await request(app).post('/v1/me/export').set('Cookie', auth.cookie).expect(429);
    expect(res.body.error.code).toBe(ErrorCode.RATE_LIMITED);
    expect(repos.privacy.createExport).not.toHaveBeenCalled();
  });

  it('downloads only the signed-in user’s own, unexpired export', async () => {
    const auth = mockAuth('user-1');
    const storage = new MemoryStorageService();
    await storage.putObject('exports/user-1/x.zip', Buffer.from('zipbytes'));
    const { app, repos } = buildTestApp({ auth, storage });

    // findExport is scoped by user id: another user's export id simply is not found.
    vi.mocked(repos.privacy.findExport).mockResolvedValueOnce(null);
    await request(app)
      .get(`/v1/me/exports/${EXPORT_ID}/download`)
      .set('Cookie', auth.cookie)
      .expect(404);
    expect(repos.privacy.findExport).toHaveBeenCalledWith('user-1', EXPORT_ID);

    vi.mocked(repos.privacy.findExport).mockResolvedValueOnce(exportRow() as never);
    const ok = await request(app)
      .get(`/v1/me/exports/${EXPORT_ID}/download`)
      .set('Cookie', auth.cookie)
      .expect(200);
    expect(ok.headers['content-type']).toBe('application/zip');
    expect(ok.headers['cache-control']).toBe('no-store');

    vi.mocked(repos.privacy.findExport).mockResolvedValueOnce(
      exportRow({ expiresAt: new Date(Date.now() - 1000) }) as never,
    );
    await request(app)
      .get(`/v1/me/exports/${EXPORT_ID}/download`)
      .set('Cookie', auth.cookie)
      .expect(410);
  });

  it('requires sign-in to download', async () => {
    const { app } = buildTestApp({ auth: mockAuth('user-1') });
    await request(app).get(`/v1/me/exports/${EXPORT_ID}/download`).expect(401);
  });

  it('builds a zip with the JSON and attachments, stores it and emails E-22', async () => {
    const { repos } = fakeRepos();
    const storage = new MemoryStorageService();
    await storage.putObject('manual-checks/org/check-1/nvda.txt', 'screen reader notes');
    const transport = new MockTransport();
    vi.mocked(repos.privacy.findExportById).mockResolvedValue(
      exportRow({ status: 'queued', fileKey: null }) as never,
    );
    vi.mocked(repos.privacy.collectPersonalData).mockResolvedValue({
      user: { id: 'user-1', email: 'alex@example.com', name: 'Alex' },
      memberships: [{ orgId: 'o1', orgName: 'Brightline', role: 'admin' }],
      clientAccess: [],
      sessions: [],
      linkedAccounts: [],
      notificationPreferences: [],
      notifications: [],
      issueNotes: [{ body: 'Fixed in theme 2.3' }],
      manualChecks: [{ id: 'check-1', attachmentKey: 'manual-checks/org/check-1/nvda.txt' }],
      activity: [],
    } as never);
    const ctx: WorkerContext = { repos, storage, emailSender: new EmailSender({ transport }) };

    const result = await handleDataExport({ exportId: EXPORT_ID }, ctx);
    expect(result.status).toBe('ready');

    const zip = await storage.getObject(`exports/user-1/${EXPORT_ID}.zip`);
    const files = unzip(zip!);
    expect(Object.keys(files)).toEqual(
      expect.arrayContaining([
        'README.txt',
        'personal-data.json',
        'files/manual-checks/check-1-nvda.txt',
      ]),
    );
    expect(JSON.parse(files['personal-data.json']!).issueNotes[0].body).toBe('Fixed in theme 2.3');
    expect(repos.privacy.updateExport).toHaveBeenCalledWith(
      EXPORT_ID,
      expect.objectContaining({ status: 'ready', fileKey: `exports/user-1/${EXPORT_ID}.zip` }),
    );
    expect(transport.sent[0]).toMatchObject({
      to: 'alex@example.com',
      subject: 'Your personal data export is ready',
    });
  });

  it('does not redo an export that is already ready', async () => {
    const { repos } = fakeRepos();
    vi.mocked(repos.privacy.findExportById).mockResolvedValue(exportRow() as never);
    const result = await handleDataExport(
      { exportId: EXPORT_ID },
      { repos, storage: new MemoryStorageService() },
    );
    expect(result.status).toBe('ready');
    expect(repos.privacy.collectPersonalData).not.toHaveBeenCalled();
  });

  it('renders E-22 with an expiry date and no promise wording', () => {
    const out = renderEmail('E-22', getSampleTemplateData('E-22') as never);
    expect(out.subject).toBe('Your personal data export is ready');
    expect(out.html).toContain('Download your data');
    expect(out.text).toContain('settings/account?export=');
    expect(out.html.toLowerCase()).not.toContain('compliant');
  });

  it('createZip output is readable', () => {
    const files = unzip(createZip([{ name: 'a.json', data: '{"x":1}' }]));
    expect(files['a.json']).toBe('{"x":1}');
  });

  it('retention.prune deletes expired export files', async () => {
    const { repos } = fakeRepos();
    const storage = new MemoryStorageService();
    await storage.putObject('exports/u/old.zip', 'x');
    vi.mocked(repos.privacy.listExpiredExports).mockResolvedValue([
      { id: 'e-old', fileKey: 'exports/u/old.zip' },
    ]);
    const report = await handleRetentionPrune({}, { repos, storage });
    expect(report.dataExportsExpired).toBe(1);
    expect(await storage.getObject('exports/u/old.zip')).toBeNull();
    expect(repos.privacy.clearExportFile).toHaveBeenCalledWith('e-old');
  });
});

describe('P6-09: account deletion', () => {
  it('explains which orgs need a new owner first', async () => {
    const auth = mockAuth('user-1');
    const { app, repos } = buildTestApp({ auth });
    vi.mocked(repos.privacy.checkAccountDeletion).mockResolvedValue({
      allowed: false,
      blockers: [{ orgId: 'o1', orgName: 'Brightline', reason: 'other_members' }],
      soloOrgIds: [],
    });
    const res = await request(app).delete('/v1/me').set('Cookie', auth.cookie).expect(422);
    expect(res.body.error.message).toContain('Transfer ownership');
  });

  it('deletes solo orgs with the account, removes export files, and audits both', async () => {
    const auth = mockAuth('user-1');
    const storage = new MemoryStorageService();
    await storage.putObject('exports/user-1/a.zip', 'x');
    const { app, repos } = buildTestApp({ auth, storage });
    vi.mocked(repos.privacy.checkAccountDeletion).mockResolvedValue({
      allowed: true,
      blockers: [],
      soloOrgIds: ['solo-org'],
    });
    vi.mocked(repos.privacy.listExports).mockResolvedValue([
      exportRow({ fileKey: 'exports/user-1/a.zip' }),
    ] as never);

    await request(app).delete('/v1/me').set('Cookie', auth.cookie).expect(200);

    expect(repos.privacy.deleteAccount).toHaveBeenCalledWith('user-1', ['solo-org']);
    expect(await storage.getObject('exports/user-1/a.zip')).toBeNull();
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      'solo-org',
      expect.objectContaining({ action: 'org.deleted', data: { reason: 'owner_account_deleted' } }),
    );
    expect(repos.auditLog.write).toHaveBeenCalledWith(
      null,
      expect.objectContaining({ action: 'account.deleted' }),
    );
  });
});

describe('P6-09: organisation deletion', () => {
  const ORG = '018f0000-0000-7000-8000-0000000000f9';
  function setup() {
    const auth = mockAuth('user-1');
    const paddleClient = { cancelSubscription: vi.fn().mockResolvedValue({}) };
    const built = buildTestApp({ auth, paddleClient: paddleClient as never });
    vi.mocked(built.repos.organizations.findByIdOrSlug).mockResolvedValue({
      id: ORG,
      name: 'Brightline',
      slug: 'brightline',
      plan: 'agency',
      billingStatus: 'active',
    } as never);
    vi.mocked(built.repos.memberships.find).mockResolvedValue({
      id: 'm',
      orgId: ORG,
      userId: 'user-1',
      role: 'owner',
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    return { ...built, cookie: auth.cookie, paddleClient };
  }

  it('cancels the subscription at period end and schedules the purge', async () => {
    const { app, repos, cookie, paddleClient } = setup();
    vi.mocked(repos.subscriptions.findByOrgId).mockResolvedValue({
      paddleSubscriptionId: 'sub_1',
      cancelAtPeriodEnd: false,
      status: 'active',
    } as never);
    const res = await request(app)
      .delete(`/v1/orgs/${ORG}`)
      .set('Cookie', cookie)
      .send({ confirmName: 'Brightline' })
      .expect(200);
    expect(paddleClient.cancelSubscription).toHaveBeenCalledWith('sub_1', {
      effectiveFrom: 'next_billing_period',
    });
    expect(repos.organizations.softDelete).toHaveBeenCalledWith(ORG);
    expect(res.body.data.purgeAfter).toBeDefined();
  });

  it('needs the exact org name', async () => {
    const { app, repos, cookie } = setup();
    await request(app)
      .delete(`/v1/orgs/${ORG}`)
      .set('Cookie', cookie)
      .send({ confirmName: 'x' })
      .expect(400);
    expect(repos.organizations.softDelete).not.toHaveBeenCalled();
  });
});
