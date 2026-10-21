import type { OrgId } from '../db/repositories/org-scope.js';
import type { CreateInAppNotificationInput } from '../db/repositories/notifications.js';
import { EmailSender } from '../emails/sender.js';
import type { EmailBranding, EmailTemplateId, TemplateDataMap } from '../emails/types.js';
import { enqueueEmailSend } from './boss.js';
import type { WorkerContext } from './types.js';

type NotifyContext = Pick<WorkerContext, 'repos' | 'boss' | 'emailSender'>;

/**
 * Sends one email: through the email.send queue in the worker (retried there), or
 * directly when there is no queue (tests, inline execution).
 */
export async function sendEmail<T extends EmailTemplateId>(
  ctx: NotifyContext,
  to: string,
  templateId: T,
  data: TemplateDataMap[T],
  branding?: EmailBranding,
): Promise<void> {
  if (ctx.boss) {
    await enqueueEmailSend(ctx.boss, {
      to,
      templateId,
      data: data as unknown as Record<string, unknown>,
      branding,
    });
    return;
  }
  const sender = ctx.emailSender ?? new EmailSender();
  await sender.send({ to, templateId, data, branding });
}

/** In-app notification for several users; a failure here never fails the calling job. */
export async function notifyInApp(
  ctx: NotifyContext,
  orgId: OrgId,
  userIds: string[],
  notification: CreateInAppNotificationInput,
): Promise<void> {
  const unique = [...new Set(userIds)];
  if (unique.length === 0 || !ctx.repos.notifications) return;
  try {
    await ctx.repos.notifications.createInAppBatch(orgId, unique, notification);
  } catch (err) {
    console.error(`[notify] Failed to create in-app notification ${notification.type}:`, err);
  }
}

/** Owners and admins with an email address (E-09, E-21 recipients). */
export async function listOrgAdmins(
  ctx: NotifyContext,
  orgId: OrgId,
): Promise<Array<{ userId: string; email: string }>> {
  const members = await ctx.repos.memberships.list(orgId);
  const admins = members.filter((m) => m.role === 'owner' || m.role === 'admin');
  const result: Array<{ userId: string; email: string }> = [];
  for (const admin of admins) {
    const user = await ctx.repos.users.findById(admin.userId);
    if (user?.email) result.push({ userId: admin.userId, email: user.email });
  }
  return result;
}
