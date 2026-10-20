import { describe, expect, it, vi } from 'vitest';
import { handleWebhookDeliver, formatSlackMessage } from '../../src/worker/jobs/webhook-deliver.js';
import { fakeRepos, testGuardPolicy } from '../helpers/fakes.js';
import type { WorkerContext } from '../../src/worker/types.js';
import { EmailSender, MockTransport } from '../../src/emails/sender.js';
import type { OrgId } from '../../src/db/repositories/org-scope.js';
import { encrypt, signHmacSha256 } from '../../src/lib/encryption.js';
import { BlockedUrlError } from '../../src/scanner/net/guard.js';

describe('P5-07: Webhooks and Slack integrations', () => {
  it('formats Slack messages correctly for all supported events', () => {
    const scanMsg = formatSlackMessage('scan.completed', {
      siteName: 'Acme Store',
      score: 95,
      criticalCount: 0,
      seriousCount: 2,
    });
    expect(scanMsg).toContain('*Scan completed for Acme Store*');
    expect(scanMsg).toContain('Score: *95*');

    const regMsg = formatSlackMessage('issue.regressed', {
      siteName: 'Acme Store',
      issueTitle: 'Images must have alternate text',
      impact: 'critical',
    });
    expect(regMsg).toContain(':warning: *Regression detected on Acme Store*');
    expect(regMsg).toContain('Images must have alternate text');

    const spikeMsg = formatSlackMessage('issues.new_critical', {
      siteName: 'Acme Store',
      count: 14,
    });
    expect(spikeMsg).toContain(':rotating_light: *High severity spike on Acme Store*');
    expect(spikeMsg).toContain('14 new critical or serious issues');

    const verMsg = formatSlackMessage('site.verification_failed', {
      siteName: 'Acme Store',
    });
    expect(verMsg).toContain(':x: *Site verification failed for Acme Store*');
  });

  it('rejects delivery to private/loopback URLs via SSRF guard', async () => {
    const { repos } = fakeRepos();
    const transport = new MockTransport();
    const emailSender = new EmailSender({ transport });

    const orgId = '11111111-1111-4111-8111-111111111111' as OrgId;
    const webhookId = '22222222-2222-4222-8222-222222222222';

    // Mock webhook pointing to localhost
    repos.webhooks.findRawById = vi.fn().mockResolvedValue({
      id: webhookId,
      orgId,
      kind: 'generic',
      url: 'http://127.0.0.1:8080/hook',
      urlEncrypted: encrypt('http://127.0.0.1:8080/hook'),
      events: ['scan.completed'],
      siteIds: [],
      active: true,
      lastStatus: null,
      lastError: null,
      failureCount: 0,
      secret: 'test-secret',
    });

    const ctx: WorkerContext = {
      repos: repos,
      storage: {} as never,
      emailSender,
      scannerPolicy: testGuardPolicy,
    };

    await expect(
      handleWebhookDeliver(
        {
          webhookId,
          event: 'scan.completed',
          payload: { siteName: 'Test' },
        },
        ctx,
      ),
    ).rejects.toThrow(BlockedUrlError);

    // Verified that SSRF failure was logged and failure recorded
    expect(repos.webhooks.logDelivery).toHaveBeenCalledWith(
      orgId,
      webhookId,
      expect.objectContaining({
        error: expect.stringContaining('SSRF Guard blocked delivery'),
      }),
    );
    expect(repos.webhooks.recordDeliveryResult).toHaveBeenCalledWith(
      webhookId,
      null,
      expect.stringContaining('SSRF Guard blocked delivery'),
      false,
    );
  });

  it('signs generic webhook payload with HMAC-SHA256 header X-Signature', async () => {
    const { repos } = fakeRepos();
    const transport = new MockTransport();
    const emailSender = new EmailSender({ transport });

    const orgId = '11111111-1111-4111-8111-111111111111' as OrgId;
    const webhookId = '22222222-2222-4222-8222-222222222222';
    const secret = 'super-secret-hmac-key';

    // Mock webhook with valid public URL
    repos.webhooks.findRawById = vi.fn().mockResolvedValue({
      id: webhookId,
      orgId,
      kind: 'generic',
      url: 'https://example.com/webhook',
      urlEncrypted: encrypt('https://example.com/webhook'),
      events: ['scan.completed'],
      siteIds: [],
      active: true,
      lastStatus: null,
      lastError: null,
      failureCount: 0,
      secret,
    });

    // Mock fetch
    let capturedHeaders: Record<string, string> | undefined;
    let capturedBody: string | undefined;

    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((url, init) => {
      capturedHeaders = init?.headers;
      capturedBody = init?.body;
      return Promise.resolve(new Response(JSON.stringify({ ok: true }), { status: 200 }));
    });

    try {
      const ctx: WorkerContext = {
        repos: repos,
        storage: {} as never,
        emailSender,
        scannerPolicy: testGuardPolicy,
      };

      const result = await handleWebhookDeliver(
        {
          webhookId,
          event: 'scan.completed',
          payload: { score: 98, siteName: 'Production' },
        },
        ctx,
      );

      expect(result.ok).toBe(true);
      expect(result.status).toBe(200);

      const headers = capturedHeaders as Record<string, string>;
      expect(headers['X-Signature']).toBeDefined();

      // Verify signature matches HMAC-SHA256 of the body
      const expectedSig = signHmacSha256(secret, capturedBody!);
      expect(headers['X-Signature']).toBe(expectedSig);

      // Verify delivery logged with success
      expect(repos.webhooks.recordDeliveryResult).toHaveBeenCalledWith(webhookId, 200, null, true);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it('auto-disables webhook and sends E-21 after 10 consecutive failures', async () => {
    const { repos } = fakeRepos();
    const transport = new MockTransport();
    const emailSender = new EmailSender({ transport });

    const orgId = '11111111-1111-4111-8111-111111111111' as OrgId;
    const webhookId = '22222222-2222-4222-8222-222222222222';

    repos.organizations.findById = vi.fn().mockResolvedValue({
      id: orgId,
      name: 'Acme Org',
    });

    repos.memberships.list = vi.fn().mockResolvedValue([
      { userId: 'admin-1', role: 'owner' },
      { userId: 'member-2', role: 'member' },
    ]);

    repos.users.findById = vi.fn().mockImplementation((userId) => {
      if (userId === 'admin-1') return Promise.resolve({ id: 'admin-1', email: 'owner@acme.com' });
      return Promise.resolve(null);
    });

    repos.webhooks.findRawById = vi.fn().mockResolvedValue({
      id: webhookId,
      orgId,
      kind: 'slack',
      url: 'https://hooks.slack.com/services/fail',
      urlEncrypted: encrypt('https://hooks.slack.com/services/fail'),
      events: ['scan.completed'],
      siteIds: [],
      active: true,
      lastStatus: 500,
      lastError: 'HTTP 500',
      failureCount: 9, // Will become 10th failure
    });

    // Mock recordDeliveryResult returns autoDisabled: true
    repos.webhooks.recordDeliveryResult = vi.fn().mockResolvedValue({
      webhook: { id: webhookId, active: false, failureCount: 10 },
      autoDisabled: true,
    });

    const originalFetch = global.fetch;
    global.fetch = vi
      .fn()
      .mockResolvedValue(new Response('Internal Server Error', { status: 500 }));

    try {
      const ctx: WorkerContext = {
        repos: repos,
        storage: {} as never,
        emailSender,
        scannerPolicy: testGuardPolicy,
      };

      await expect(
        handleWebhookDeliver(
          {
            webhookId,
            event: 'scan.completed',
            payload: {},
          },
          ctx,
        ),
      ).rejects.toThrow();

      // Proves E-21 was sent to the owner
      expect(transport.sent.length).toBe(1);
      const email = transport.sent[0];
      expect(email?.to).toBe('owner@acme.com');
      expect(email?.subject).toContain('Action required: Webhook auto-disabled for Acme Org');
      expect(email?.html).toContain('failed 10 consecutive delivery attempts');
    } finally {
      global.fetch = originalFetch;
    }
  });
});
