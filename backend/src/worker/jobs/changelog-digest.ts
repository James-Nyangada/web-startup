import { EmailSender } from '../../emails/sender.js';
import type { WorkerContext } from '../types.js';

export interface ChangelogDigestPayload {
  /** YYYY-MM to send (the month whose entries are summarised); defaults to last month. */
  month?: string;
}

const TYPE_LABEL: Record<string, string> = { new: 'New', improved: 'Improved', fixed: 'Fixed' };
const SEND_INTERVAL_MS = 120;

const escapeHtml = (v: string) =>
  v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The previous calendar month as YYYY-MM (UTC). */
export function previousMonth(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return d.toISOString().slice(0, 7);
}

export function monthBounds(month: string): { from: string; to: string; label: string } {
  const [y, m] = month.split('-').map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return {
    from: `${month}-01`,
    to: `${month}-${String(last).padStart(2, '0')}`,
    label: new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }),
  };
}

export function renderChangelogDigest(
  label: string,
  entries: { date: string; title: string; type: string; bodyMd: string }[],
  siteUrl: string,
  settingsUrl: string,
) {
  const subject = `What's new in EveryVisitor: ${label}`;
  const text = [
    `What we shipped in ${label}`,
    '',
    ...entries.map((e) => `[${TYPE_LABEL[e.type] ?? e.type}] ${e.title} (${e.date})\n${e.bodyMd}\n`),
    `Full changelog: ${siteUrl}/changelog`,
    '',
    `You get this because product updates are on for your account. Turn them off: ${settingsUrl}`,
  ].join('\n');
  const html = `<h1 style="font-size:20px">What we shipped in ${escapeHtml(label)}</h1>${entries
    .map(
      (e) =>
        `<h2 style="font-size:16px;margin-bottom:4px">${escapeHtml(e.title)} <small style="color:#635F59">(${escapeHtml(TYPE_LABEL[e.type] ?? e.type)}, ${escapeHtml(e.date)})</small></h2><p style="white-space:pre-line;margin-top:0">${escapeHtml(e.bodyMd)}</p>`,
    )
    .join('')}<p><a href="${escapeHtml(siteUrl)}/changelog">See the full changelog</a></p><p style="font-size:12px;color:#635F59">You get this because product updates are on for your account. <a href="${escapeHtml(settingsUrl)}">Turn them off</a>.</p>`;
  return { subject, text, html };
}

/**
 * changelog.digest (1st of the month): emails last month's published changelog entries to
 * account owners and admins who have not turned product updates off. Progress is saved after each
 * send, so a retry resumes and a month is never sent twice.
 */
export async function handleChangelogDigest(
  payload: ChangelogDigestPayload | undefined,
  ctx: WorkerContext,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = new Date(),
): Promise<{ sent: number; total: number; skipped?: string }> {
  const month = payload?.month ?? previousMonth(now);
  const { from, to, label } = monthBounds(month);
  const entries = await ctx.repos.staff.listPublishedChangelogBetween(from, to);
  if (entries.length === 0) return { sent: 0, total: 0, skipped: 'no_entries' };

  const key = `changelog-digest:${month}`;
  const progress = (await ctx.repos.staff.getAnalyticsCache<{ sent: number; done: boolean }>(key)) ?? { sent: 0, done: false };
  if (progress.done) return { sent: progress.sent, total: progress.sent, skipped: 'already_sent' };

  const recipients = await ctx.repos.staff.listChangelogDigestRecipients();
  const siteUrl = process.env.SITE_URL || process.env.APP_URL || 'http://localhost:3000';
  const appUrl = process.env.APP_URL || siteUrl;
  const message = renderChangelogDigest(label, entries, siteUrl, `${appUrl}/settings/notifications`);
  const sender = ctx.emailSender ?? new EmailSender();
  const TTL = 45 * 86_400;

  let sent = progress.sent;
  for (; sent < recipients.length; sent++) {
    if (ctx.abortSignal?.aborted) throw new Error('Worker is shutting down.');
    await sender.sendRaw({ to: recipients[sent]!, ...message });
    await ctx.repos.staff.setAnalyticsCache(key, { sent: sent + 1, done: false }, TTL);
    await sleep(SEND_INTERVAL_MS);
  }
  await ctx.repos.staff.setAnalyticsCache(key, { sent, done: true }, TTL);
  return { sent, total: recipients.length };
}
