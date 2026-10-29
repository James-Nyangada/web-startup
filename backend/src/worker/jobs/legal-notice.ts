import { EmailSender } from '../../emails/sender.js';
import type { WorkerContext } from '../types.js';

export interface LegalNoticePayload {
  noticeId: string;
}

const PAGE_NAMES: Record<string, string> = {
  'legal.terms': 'Terms of Service',
  'legal.privacy': 'Privacy Policy',
  'legal.refunds': 'Refund Policy',
};

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Sends this many emails per second at most. */
const SEND_INTERVAL_MS = 120;

export function renderLegalNotice(pageKey: string, summary: string, linkUrl: string) {
  const name = PAGE_NAMES[pageKey] ?? 'legal terms';
  const subject = `We have updated our ${name}`;
  const text = `We have updated our ${name}.\n\nWhat changed: ${summary}\n\nRead the new version: ${linkUrl}\n\nIf you have questions, reply to this email.`;
  const html = `<p>We have updated our ${escapeHtml(name)}.</p><p><strong>What changed:</strong> ${escapeHtml(summary)}</p><p><a href="${escapeHtml(linkUrl)}">Read the new version</a></p><p>If you have questions, reply to this email.</p>`;
  return { subject, text, html };
}

/**
 * legal.notice: emails every account owner and admin about a Terms, Privacy or Refund change.
 * Batched and rate-limited; progress is saved after each send, so a retry resumes where the
 * last attempt stopped (recipients are sorted, `sentCount` is the resume offset).
 */
export async function handleLegalNotice(
  payload: LegalNoticePayload,
  ctx: WorkerContext,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<{ sent: number; total: number }> {
  const notice = await ctx.repos.staff.getLegalNotice(payload.noticeId);
  if (!notice) return { sent: 0, total: 0 };
  if (notice.status === 'sent') return { sent: notice.sentCount, total: notice.recipientsTotal };

  const recipients = await ctx.repos.staff.listLegalNoticeRecipients();
  await ctx.repos.staff.updateLegalNotice(notice.id, { status: 'sending', recipientsTotal: recipients.length });

  const sender = ctx.emailSender ?? new EmailSender();
  const message = renderLegalNotice(notice.pageKey, notice.summary, notice.linkUrl);
  let sent = notice.sentCount;
  try {
    for (; sent < recipients.length; sent++) {
      if (ctx.abortSignal?.aborted) throw new Error('Worker is shutting down.');
      await sender.sendRaw({ to: recipients[sent]!, ...message });
      await ctx.repos.staff.updateLegalNotice(notice.id, { sentCount: sent + 1 });
      await sleep(SEND_INTERVAL_MS);
    }
  } catch (err) {
    await ctx.repos.staff.updateLegalNotice(notice.id, {
      status: 'failed',
      error: err instanceof Error ? err.message : 'Sending failed',
    });
    throw err; // pg-boss retries; the next run resumes from sentCount
  }
  await ctx.repos.staff.updateLegalNotice(notice.id, { status: 'sent', error: null });
  return { sent, total: recipients.length };
}
