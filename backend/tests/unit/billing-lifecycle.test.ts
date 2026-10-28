import { describe, expect, it, vi } from 'vitest';
import { handleBillingLifecycle } from '../../src/worker/jobs/billing-lifecycle.js';
import type { WorkerContext } from '../../src/worker/types.js';

const DAY = 24 * 60 * 60 * 1000;

function makeCtx(opts: {
  subs?: Array<Record<string, unknown>>;
  inactive?: Array<Record<string, unknown>>;
  alreadySent?: boolean;
}) {
  const send = vi.fn().mockResolvedValue({ ok: true });
  const write = vi.fn().mockResolvedValue(undefined);
  const ctx = {
    emailSender: { send },
    repos: {
      subscriptions: { listRenewingBetween: vi.fn().mockResolvedValue(opts.subs ?? []) },
      staff: { listInactivePaying: vi.fn().mockResolvedValue(opts.inactive ?? []) },
      auditLog: {
        hasActionWithKey: vi.fn().mockResolvedValue(opts.alreadySent ?? false),
        write,
      },
      memberships: { findOwner: vi.fn().mockResolvedValue({ email: 'owner@shop.test', name: 'Sam' }) },
      organizations: { findById: vi.fn().mockResolvedValue({ name: 'Shop' }) },
    },
  } as unknown as WorkerContext;
  return { ctx, send, write };
}

const sub = (interval: 'month' | 'year', inDays: number) => ({
  id: 's1',
  orgId: 'o1',
  plan: 'growth',
  interval,
  currentPeriodEnd: new Date(Date.now() + inDays * DAY),
});

describe('billing.lifecycle', () => {
  it('reminds an annual plan 7 days out and a monthly plan 5 days out', async () => {
    const annual = makeCtx({ subs: [sub('year', 6.5)] });
    expect((await handleBillingLifecycle(annual.ctx)).renewalReminders).toBe(1);
    expect(annual.send).toHaveBeenCalledWith(expect.objectContaining({ templateId: 'E-25' }));

    const monthly = makeCtx({ subs: [sub('month', 4.5)] });
    expect((await handleBillingLifecycle(monthly.ctx)).renewalReminders).toBe(1);
  });

  it('does not remind a monthly plan 6 days out, or a period already reminded', async () => {
    const early = makeCtx({ subs: [sub('month', 6)] });
    expect((await handleBillingLifecycle(early.ctx)).renewalReminders).toBe(0);

    const dup = makeCtx({ subs: [sub('year', 3)], alreadySent: true });
    expect((await handleBillingLifecycle(dup.ctx)).renewalReminders).toBe(0);
    expect(dup.send).not.toHaveBeenCalled();
  });

  it('checks in once with an inactive customer and records it', async () => {
    const row = {
      orgId: 'o1',
      orgName: 'Shop',
      ownerEmail: 'owner@shop.test',
      ownerName: 'Sam',
      daysInactive: 16,
      lastActiveAt: new Date(Date.now() - 16 * DAY),
      lastCheckInAt: null,
    };
    const { ctx, send, write } = makeCtx({ inactive: [row] });
    expect((await handleBillingLifecycle(ctx)).checkIns).toBe(1);
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ templateId: 'E-26' }));
    expect(write).toHaveBeenCalledWith('o1', expect.objectContaining({ action: 'customer.check_in_sent' }));

    const recent = makeCtx({
      inactive: [{ ...row, lastCheckInAt: new Date(Date.now() - 5 * DAY) }],
    });
    expect((await handleBillingLifecycle(recent.ctx)).checkIns).toBe(0);
  });
});
