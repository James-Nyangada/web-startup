import { EmailSender } from '../../emails/sender.js';
import { DATA_EXPORT_TTL_MS } from '../../db/repositories/privacy.js';
import { logger } from '../../lib/logger.js';
import { createZip, type ZipEntry } from '../../lib/zip.js';
import type { DataExportJobPayload, WorkerContext } from '../types.js';

const README = `This archive holds the personal data Plainsight keeps about you (GDPR article 15/20).

personal-data.json   Your profile, organisation roles, client access, sign-in sessions,
                     linked sign-in methods, notification settings, in-app notifications,
                     issue notes you wrote, manual checks you logged and your recent activity.
files/               Attachments you uploaded to manual checks.

Sites, scans and issues belong to the organisations you work with. Ask an owner of each
organisation for an export of that data.
`;

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

const safeName = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-80);

/** privacy.export (P6-09): builds the zip, stores it, emails E-22. */
export async function handleDataExport(
  payload: DataExportJobPayload,
  ctx: WorkerContext,
): Promise<{ status: string; fileSize?: number }> {
  const row = await ctx.repos.privacy.findExportById(payload.exportId);
  // A failed attempt is picked up again by the pg-boss retry; a finished export is not redone.
  if (!row || row.status === 'ready') return { status: row?.status ?? 'missing' };

  try {
    const data = await ctx.repos.privacy.collectPersonalData(row.userId);
    if (!data) {
      await ctx.repos.privacy.updateExport(row.id, { status: 'failed', error: 'User not found' });
      return { status: 'failed' };
    }

    const entries: ZipEntry[] = [
      { name: 'README.txt', data: README },
      {
        name: 'personal-data.json',
        data: JSON.stringify({ exportedAt: new Date().toISOString(), ...data }, null, 2),
      },
    ];
    for (const check of data.manualChecks) {
      if (!check.attachmentKey) continue;
      const file = await ctx.storage.getObject(check.attachmentKey).catch(() => null);
      if (file) {
        entries.push({
          name: `files/manual-checks/${check.id}-${safeName(check.attachmentKey.split('/').pop() ?? 'attachment')}`,
          data: file,
        });
      }
    }

    const zip = createZip(entries);
    const fileKey = `exports/${row.userId}/${row.id}.zip`;
    await ctx.storage.putObject(fileKey, zip, 'application/zip');
    const expiresAt = new Date(Date.now() + DATA_EXPORT_TTL_MS);
    await ctx.repos.privacy.updateExport(row.id, {
      status: 'ready',
      fileKey,
      fileSize: zip.length,
      expiresAt,
      error: null,
    });

    const appUrl = (process.env.APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
    const sender = ctx.emailSender ?? new EmailSender();
    await sender.send({
      to: data.user.email,
      templateId: 'E-22',
      data: {
        name: data.user.name,
        downloadUrl: `${appUrl}/settings/account?export=${row.id}#privacy`,
        expiresAt,
        sizeLabel: formatBytes(zip.length),
      },
    });
    return { status: 'ready', fileSize: zip.length };
  } catch (err) {
    logger.error({ err, exportId: row.id }, 'privacy.export failed');
    await ctx.repos.privacy.updateExport(row.id, {
      status: 'failed',
      error: err instanceof Error ? err.message.slice(0, 500) : 'Export failed',
    });
    throw err;
  }
}
