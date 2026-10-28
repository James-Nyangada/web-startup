import type { PgBoss } from 'pg-boss';
import type { Repositories } from '../db/repositories/index.js';
import { asOrgId } from '../db/repositories/org-scope.js';
import type { EmailSender } from '../emails/sender.js';
import { enqueueEmailSend } from '../worker/boss.js';

export interface OutreachOptions {
  boss?: PgBoss;
  emailSender?: EmailSender;
  appUrl?: string;
}

export type CheckInTrigger = 'auto' | 'staff';

export const INACTIVE_AFTER_DAYS = 14;
/** One automatic check-in per customer in this window, so nobody is nagged. */
export const CHECK_IN_COOLDOWN_DAYS = 30;

/**
 * Sends the personal check-in (E-26) to an org's owner and records it. Used by the daily job and
 * by the staff "send now" button, so both leave the same record.
 */
export async function sendCheckIn(
  repos: Repositories,
  opts: OutreachOptions,
  input: {
    orgId: string;
    orgName: string;
    ownerEmail: string;
    ownerName: string | null;
    daysInactive: number;
    trigger: CheckInTrigger;
    staffUserId?: string | null;
    ip?: string | null;
  },
): Promise<void> {
  const appUrl = opts.appUrl || process.env.APP_URL || 'http://localhost:3000';
  const payload = {
    name: input.ownerName,
    orgName: input.orgName,
    daysSinceLogin: input.daysInactive,
    dashboardUrl: `${appUrl}/overview`,
    supportEmail: 'support@everyvisitor.app',
  };
  if (opts.boss) {
    await enqueueEmailSend(opts.boss, { to: input.ownerEmail, templateId: 'E-26', data: payload });
  } else if (opts.emailSender) {
    await opts.emailSender.send({ to: input.ownerEmail, templateId: 'E-26', data: payload });
  } else {
    throw new Error('No email transport configured');
  }
  await repos.auditLog.write(asOrgId(input.orgId), {
    actorId: input.staffUserId ?? null,
    actorType: input.trigger === 'staff' ? 'staff' : 'system',
    action: 'customer.check_in_sent',
    targetType: 'organization',
    targetId: input.orgId,
    ip: input.ip ?? null,
    data: { trigger: input.trigger, daysInactive: input.daysInactive, to: input.ownerEmail },
  });
}
