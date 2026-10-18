import type { EmailSendJobPayload, WorkerContext } from '../types.js';
import { EmailSender } from '../../emails/sender.js';

/**
 * Handles email.send background job (Spec Section 9, P2-18).
 * Dispatches rendered accessible HTML and plain-text emails via configured transport.
 */
export async function handleEmailSend(
  job: EmailSendJobPayload,
  ctx: WorkerContext,
): Promise<{ ok: boolean; id?: string }> {
  const sender = ctx.emailSender ?? new EmailSender();
  const res = await sender.send({
    to: job.to,
    templateId: job.templateId,
    data: job.data as never,
    branding: job.branding,
  });
  return { ok: res.ok, id: res.id };
}
