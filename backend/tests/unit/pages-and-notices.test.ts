import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { encrypt } from '../../src/lib/encryption.js';
import { generateTotpSecret } from '../../src/lib/totp.js';
import { handleLegalNotice, renderLegalNotice } from '../../src/worker/jobs/legal-notice.js';
import { buildTestApp, mockAuth } from '../helpers/fakes.js';

const SECRET = generateTotpSecret();
const LEGAL_PAGE = { title: 'Terms of Service', bodyMd: 'These are the terms.' };

function setup(role: string) {
  const auth = mockAuth('staff-1');
  const built = buildTestApp({ auth });
  vi.mocked(built.repos.staff.getSessionState).mockResolvedValue({
    sessionId: 's', userId: 'staff-1', email: 'staff-1@example.com', isStaff: true,
    totpSecretEncrypted: encrypt(SECRET), totpEnabledAt: new Date(), staffVerifiedAt: new Date(),
    impersonatingOrgId: null, staffMemberId: 'sm-1', role,
  } as never);
  return { ...built, cookie: auth.cookie };
}

describe('site pages: draft vs published', () => {
  it('saving a draft only touches the draft, never the live version', async () => {
    const { app, cookie, repos } = setup('owner');
    await request(app).put('/v1/staff/content/pages/legal.terms').set('Cookie', cookie)
      .send({ data: LEGAL_PAGE }).expect(200);
    expect(repos.staff.savePageDraft).toHaveBeenCalledWith('legal.terms', expect.anything(), 'staff-1');
    expect(repos.staff.publishPage).not.toHaveBeenCalled();
  });

  it('flags unpublished changes when the draft differs from the live version', async () => {
    const { app, cookie, repos } = setup('editor');
    vi.mocked(repos.staff.getPage).mockResolvedValue({ pageKey: 'home.hero', data: { a: 2 } } as never);
    vi.mocked(repos.staff.getPublishedPage).mockResolvedValue({ data: { a: 1 } } as never);
    const res = await request(app).get('/v1/staff/content/pages/home.hero').set('Cookie', cookie).expect(200);
    expect(res.body.data.hasUnpublishedChanges).toBe(true);
  });

  it('only the owner can edit or publish legal pages', async () => {
    const { app, cookie } = setup('admin');
    await request(app).put('/v1/staff/content/pages/legal.terms').set('Cookie', cookie).send({ data: LEGAL_PAGE }).expect(403);
    await request(app).post('/v1/staff/content/pages/legal.terms/publish').set('Cookie', cookie).send({}).expect(403);
  });

  it('refuses a customer notice for pages other than Terms, Privacy and Refunds', async () => {
    const { app, cookie } = setup('owner');
    await request(app).post('/v1/staff/content/pages/legal.dpa/publish').set('Cookie', cookie)
      .send({ customerNotice: { notifyAllCustomers: true, summary: 'x' } }).expect(400);
  });

  it('needs a summary for a customer notice, and a worker to send it', async () => {
    const { app, cookie, repos } = setup('owner');
    vi.mocked(repos.staff.getPage).mockResolvedValue({ pageKey: 'legal.terms', data: LEGAL_PAGE } as never);
    await request(app).post('/v1/staff/content/pages/legal.terms/publish').set('Cookie', cookie)
      .send({ customerNotice: { notifyAllCustomers: true } }).expect(400);
    await request(app).post('/v1/staff/content/pages/legal.terms/publish').set('Cookie', cookie)
      .send({ customerNotice: { notifyAllCustomers: true, summary: 'Refund window is now 30 days.' } }).expect(503);
    expect(repos.staff.publishPage).not.toHaveBeenCalled();
  });

  it('publishes a new version with the effective date and writes the audit log', async () => {
    const { app, cookie, repos } = setup('owner');
    vi.mocked(repos.staff.getPage).mockResolvedValue({ pageKey: 'legal.terms', data: LEGAL_PAGE } as never);
    vi.mocked(repos.staff.publishPage).mockResolvedValue({ pageKey: 'legal.terms', publishedVersion: 3 } as never);
    const res = await request(app).post('/v1/staff/content/pages/legal.terms/publish').set('Cookie', cookie)
      .send({ effectiveDate: '2026-11-15T00:00:00Z', changeSummary: 'Clarified refunds' }).expect(200);
    expect(res.body.data.publishedVersion).toBe(3);
    expect(repos.staff.publishPage).toHaveBeenCalledWith('legal.terms', 'staff-1', {
      effectiveDate: new Date('2026-11-15T00:00:00Z'),
      changeSummary: 'Clarified refunds',
    });
    expect(repos.auditLog.write).toHaveBeenCalledWith(null, expect.objectContaining({ action: 'content.page_published' }));
  });
});

describe('public page endpoints', () => {
  it('serve the published version and 404 when nothing is published', async () => {
    const { app, repos } = buildTestApp();
    await request(app).get('/v1/public/content/pages/home.hero').expect(404);
    vi.mocked(repos.staff.getPublishedPage).mockResolvedValue({ pageKey: 'home.hero', data: { headline: 'Hi' }, version: 2 } as never);
    const res = await request(app).get('/v1/public/content/pages/home.hero').expect(200);
    expect(res.body.data.data.headline).toBe('Hi');
  });

  it('keeps old versions of legal pages readable but not other pages', async () => {
    const { app, repos } = buildTestApp();
    vi.mocked(repos.staff.getPageVersion).mockResolvedValue({ pageKey: 'legal.terms', version: 1, data: LEGAL_PAGE } as never);
    await request(app).get('/v1/public/content/pages/legal.terms/versions/1').expect(200);
    await request(app).get('/v1/public/content/pages/home.hero/versions/1').expect(404);
    await request(app).get('/v1/public/content/pages/legal.terms/versions/abc').expect(404);
  });
});

describe('legal.notice job', () => {
  const noticeRow = (over: Record<string, unknown> = {}) => ({
    id: 'n1', pageKey: 'legal.privacy', version: 4, summary: 'We added a subprocessor <b>.',
    linkUrl: 'https://everyvisitor.app/legal/privacy', status: 'queued', sentCount: 0, recipientsTotal: 0, ...over,
  });

  it('emails every recipient once and marks the notice sent', async () => {
    const { repos } = buildTestApp();
    vi.mocked(repos.staff.getLegalNotice).mockResolvedValue(noticeRow() as never);
    vi.mocked(repos.staff.listLegalNoticeRecipients).mockResolvedValue(['a@x.test', 'b@x.test', 'c@x.test']);
    const sendRaw = vi.fn().mockResolvedValue({ id: '1', ok: true });
    const sleep = vi.fn().mockResolvedValue(undefined);
    const out = await handleLegalNotice({ noticeId: 'n1' }, { repos, emailSender: { sendRaw } } as never, sleep);
    expect(out).toEqual({ sent: 3, total: 3 });
    expect(sendRaw.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual(['a@x.test', 'b@x.test', 'c@x.test']);
    expect(sleep).toHaveBeenCalledTimes(3); // rate limited between sends
    expect(repos.staff.updateLegalNotice).toHaveBeenLastCalledWith('n1', expect.objectContaining({ status: 'sent' }));
  });

  it('resumes after the last sent address when retried', async () => {
    const { repos } = buildTestApp();
    vi.mocked(repos.staff.getLegalNotice).mockResolvedValue(noticeRow({ status: 'failed', sentCount: 2 }) as never);
    vi.mocked(repos.staff.listLegalNoticeRecipients).mockResolvedValue(['a@x.test', 'b@x.test', 'c@x.test']);
    const sendRaw = vi.fn().mockResolvedValue({ id: '1', ok: true });
    await handleLegalNotice({ noticeId: 'n1' }, { repos, emailSender: { sendRaw } } as never, () => Promise.resolve());
    expect(sendRaw.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual(['c@x.test']);
  });

  it('records the failure and rethrows so the queue retries', async () => {
    const { repos } = buildTestApp();
    vi.mocked(repos.staff.getLegalNotice).mockResolvedValue(noticeRow() as never);
    vi.mocked(repos.staff.listLegalNoticeRecipients).mockResolvedValue(['a@x.test']);
    const sendRaw = vi.fn().mockRejectedValue(new Error('Resend down'));
    await expect(
      handleLegalNotice({ noticeId: 'n1' }, { repos, emailSender: { sendRaw } } as never, () => Promise.resolve()),
    ).rejects.toThrow('Resend down');
    expect(repos.staff.updateLegalNotice).toHaveBeenLastCalledWith('n1', expect.objectContaining({ status: 'failed', error: 'Resend down' }));
  });

  it('does not resend a notice that is already sent', async () => {
    const { repos } = buildTestApp();
    vi.mocked(repos.staff.getLegalNotice).mockResolvedValue(noticeRow({ status: 'sent', sentCount: 5, recipientsTotal: 5 }) as never);
    const sendRaw = vi.fn();
    expect(await handleLegalNotice({ noticeId: 'n1' }, { repos, emailSender: { sendRaw } } as never)).toEqual({ sent: 5, total: 5 });
    expect(sendRaw).not.toHaveBeenCalled();
  });

  it('escapes the summary in the email body', () => {
    const m = renderLegalNotice('legal.privacy', 'We added <script>x</script>', 'https://x.test/legal/privacy');
    expect(m.subject).toBe('We have updated our Privacy Policy');
    expect(m.html).not.toContain('<script>');
    expect(m.html).toContain('&lt;script&gt;');
  });
});

describe('changelog.digest job', () => {
  const entries = [{ date: '2026-09-04', title: 'Faster scans <fast>', type: 'improved', bodyMd: 'Scans finish sooner.' }];

  it('knows last month and its bounds', async () => {
    const { previousMonth, monthBounds } = await import('../../src/worker/jobs/changelog-digest.js');
    expect(previousMonth(new Date('2026-10-01T10:00:00Z'))).toBe('2026-09');
    expect(previousMonth(new Date('2027-01-01T10:00:00Z'))).toBe('2026-12');
    expect(monthBounds('2026-02')).toMatchObject({ from: '2026-02-01', to: '2026-02-28' });
  });

  it('sends last month to opted-in people once, with progress saved', async () => {
    const { handleChangelogDigest } = await import('../../src/worker/jobs/changelog-digest.js');
    const { repos } = buildTestApp();
    vi.mocked(repos.staff.listPublishedChangelogBetween).mockResolvedValue(entries as never);
    vi.mocked(repos.staff.listChangelogDigestRecipients).mockResolvedValue(['a@x.test', 'b@x.test']);
    const sendRaw = vi.fn().mockResolvedValue({ id: '1', ok: true });
    const out = await handleChangelogDigest(undefined, { repos, emailSender: { sendRaw } } as never, () => Promise.resolve(), new Date('2026-10-01T10:00:00Z'));
    expect(out).toEqual({ sent: 2, total: 2 });
    expect(repos.staff.listPublishedChangelogBetween).toHaveBeenCalledWith('2026-09-01', '2026-09-30');
    expect(sendRaw.mock.calls[0]![0].subject).toContain('September 2026');
    expect(sendRaw.mock.calls[0]![0].html).not.toContain('<fast>');
    expect(sendRaw.mock.calls[0]![0].text).toContain('/settings/notifications');
    expect(repos.staff.setAnalyticsCache).toHaveBeenLastCalledWith('changelog-digest:2026-09', { sent: 2, done: true }, expect.any(Number));
  });

  it('does nothing when there were no entries or the month was already sent', async () => {
    const { handleChangelogDigest } = await import('../../src/worker/jobs/changelog-digest.js');
    const { repos } = buildTestApp();
    const sendRaw = vi.fn();
    const ctx = { repos, emailSender: { sendRaw } } as never;
    expect((await handleChangelogDigest(undefined, ctx, () => Promise.resolve(), new Date('2026-10-01T10:00:00Z'))).skipped).toBe('no_entries');
    vi.mocked(repos.staff.listPublishedChangelogBetween).mockResolvedValue(entries as never);
    vi.mocked(repos.staff.getAnalyticsCache).mockResolvedValue({ sent: 5, done: true });
    expect((await handleChangelogDigest(undefined, ctx, () => Promise.resolve(), new Date('2026-10-01T10:00:00Z'))).skipped).toBe('already_sent');
    expect(sendRaw).not.toHaveBeenCalled();
  });

  it('resumes after the last address sent', async () => {
    const { handleChangelogDigest } = await import('../../src/worker/jobs/changelog-digest.js');
    const { repos } = buildTestApp();
    vi.mocked(repos.staff.listPublishedChangelogBetween).mockResolvedValue(entries as never);
    vi.mocked(repos.staff.listChangelogDigestRecipients).mockResolvedValue(['a@x.test', 'b@x.test', 'c@x.test']);
    vi.mocked(repos.staff.getAnalyticsCache).mockResolvedValue({ sent: 2, done: false });
    const sendRaw = vi.fn().mockResolvedValue({ id: '1', ok: true });
    await handleChangelogDigest({ month: '2026-09' }, { repos, emailSender: { sendRaw } } as never, () => Promise.resolve());
    expect(sendRaw.mock.calls.map((c) => (c[0] as { to: string }).to)).toEqual(['c@x.test']);
  });
});
