import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Repositories } from '../../src/db/repositories/index.js';
import { EmailSender, MockTransport } from '../../src/emails/sender.js';
import { renderEmail } from '../../src/emails/renderer.js';
import {
  handleSiteReverify,
  handleSiteReverifySweep,
  REVERIFY_ALERT_THRESHOLD,
} from '../../src/worker/jobs/site-reverify.js';
import type { WorkerContext } from '../../src/worker/types.js';

const verifyOwnership = vi.fn();
vi.mock('../../src/scanner/verification/verify.js', () => ({
  verifyOwnership: (...args: unknown[]) => verifyOwnership(...args) as unknown,
}));

const orgId = '11111111-1111-4111-a111-111111111111';
const siteId = '22222222-2222-4222-a222-222222222222';

function setup(site: Record<string, unknown> = {}, previousFailures = 0) {
  let failures = previousFailures;
  const transport = new MockTransport();
  const createInAppBatch = vi.fn().mockResolvedValue(undefined);
  const findActiveByEvent = vi.fn().mockResolvedValue([]);
  const repos = {
    sites: {
      findRawById: vi.fn().mockResolvedValue({
        id: siteId,
        orgId,
        name: 'Oakhaus <Furniture>',
        rootUrl: 'https://oakhaus.com',
        status: 'active',
        verifiedAt: new Date('2026-01-01'),
        verifyMethod: 'meta',
        verifyToken: 'tok',
        ...site,
      }),
      recordReverifyResult: vi.fn().mockImplementation((_id: string, ok: boolean) => {
        failures = ok ? 0 : failures + 1;
        return Promise.resolve(failures);
      }),
      listForReverify: vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
    },
    memberships: {
      list: vi.fn().mockResolvedValue([
        { userId: 'owner-1', role: 'owner' },
        { userId: 'admin-1', role: 'admin' },
        { userId: 'member-1', role: 'member' },
      ]),
    },
    users: {
      findById: vi
        .fn()
        .mockImplementation((id: string) => Promise.resolve({ email: `${id}@x.com` })),
    },
    notifications: { createInAppBatch },
    webhooks: { findActiveByEvent },
    auditLog: { write: vi.fn().mockResolvedValue(undefined) },
  } as unknown as Repositories;
  const ctx: WorkerContext = {
    repos,
    storage: {} as never,
    emailSender: new EmailSender({ transport }),
  };
  return { ctx, repos, transport, createInAppBatch, findActiveByEvent };
}

describe('site.reverify (E-09, site.verification_failed)', () => {
  beforeEach(() => {
    verifyOwnership.mockReset();
  });

  it('resets the failure count when the check passes', async () => {
    verifyOwnership.mockResolvedValue({ ok: true, method: 'meta' });
    const { ctx, repos, transport } = setup({}, 2);

    expect(await handleSiteReverify({ siteId }, ctx)).toBe('verified');
    expect(repos.sites.recordReverifyResult).toHaveBeenCalledWith(siteId, true);
    expect(transport.sent).toHaveLength(0);
  });

  it('alerts owners and admins once, on the third failure in a row', async () => {
    verifyOwnership.mockResolvedValue({
      ok: false,
      method: 'meta',
      reason: 'The meta tag was not found.',
    });
    const { ctx, transport, createInAppBatch, findActiveByEvent } = setup();

    expect(await handleSiteReverify({ siteId }, ctx)).toBe('failed');
    expect(await handleSiteReverify({ siteId }, ctx)).toBe('failed');
    expect(transport.sent).toHaveLength(0);

    expect(await handleSiteReverify({ siteId }, ctx)).toBe('alerted');
    expect(transport.sent.map((m) => m.to).sort()).toEqual(['admin-1@x.com', 'owner-1@x.com']);
    expect(transport.sent[0]!.subject).toContain('Oakhaus <Furniture>');
    expect(transport.sent[0]!.html).toContain('Oakhaus &lt;Furniture&gt;');
    expect(transport.sent[0]!.html).toContain('The meta tag was not found.');
    expect(createInAppBatch).toHaveBeenCalledWith(
      orgId,
      ['owner-1', 'admin-1'],
      expect.objectContaining({ type: 'verification_failing', link: `/sites/${siteId}/verify` }),
    );
    expect(findActiveByEvent).toHaveBeenCalledWith(orgId, 'site.verification_failed', siteId);

    // A fourth failure in the same streak does not alert again
    expect(await handleSiteReverify({ siteId }, ctx)).toBe('failed');
    expect(transport.sent).toHaveLength(2);
    expect(REVERIFY_ALERT_THRESHOLD).toBe(3);
  });

  it('counts an unreachable site as a failure', async () => {
    verifyOwnership.mockRejectedValue(new Error('Blocked URL: DNS lookup failed'));
    const { ctx, repos } = setup();
    expect(await handleSiteReverify({ siteId }, ctx)).toBe('failed');
    expect(repos.sites.recordReverifyResult).toHaveBeenCalledWith(siteId, false);
  });

  it.each([
    ['unverified', { verifiedAt: null }],
    ['paused', { status: 'paused' }],
    ['verified by the Shopify app', { verifyMethod: 'shopify' }],
  ])('skips a site that is %s', async (_label, site) => {
    const { ctx, repos } = setup(site);
    expect(await handleSiteReverify({ siteId }, ctx)).toBe('skipped');
    expect(verifyOwnership).not.toHaveBeenCalled();
    expect(repos.sites.recordReverifyResult).not.toHaveBeenCalled();
  });

  it('weekly sweep queues one job per site', async () => {
    const { ctx } = setup();
    const enqueue = vi.fn().mockResolvedValue('job');
    expect(await handleSiteReverifySweep(ctx, enqueue)).toBe(2);
    expect(enqueue.mock.calls).toEqual([['a'], ['b']]);
  });

  it('E-09 renders a plain-text version', () => {
    const out = renderEmail('E-09', {
      siteName: 'Oakhaus',
      rootUrl: 'https://oakhaus.com',
      method: 'dns',
      failureCount: 3,
      reason: 'No TXT record found.',
      verifyUrl: 'https://app/sites/1/verify',
    });
    expect(out.text).toContain('DNS TXT record');
    expect(out.text).toContain('https://app/sites/1/verify');
  });
});
