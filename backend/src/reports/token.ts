import crypto from 'node:crypto';

export interface ReportDownloadTokenPayload {
  reportId: string;
  orgId: string;
  exp: number; // Unix timestamp in seconds
}

function getSecret(secret?: string): string {
  return (
    secret ??
    process.env.ENCRYPTION_KEY ??
    process.env.AUTH_SECRET ??
    'fallback-secret-for-report-download-signing'
  );
}

/**
 * Creates an HMAC-SHA256 signed download token for secure 15-minute report downloads.
 */
export function signReportDownloadToken(
  payload: ReportDownloadTokenPayload,
  secret?: string,
): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto
    .createHmac('sha256', getSecret(secret))
    .update(data)
    .digest('base64url');
  return `${data}.${signature}`;
}

/**
 * Verifies an HMAC-SHA256 signed download token and confirms it hasn't expired.
 */
export function verifyReportDownloadToken(
  token: string,
  secret?: string,
): ReportDownloadTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;

  const [data, signature] = parts;
  if (!data || !signature) return null;

  const expectedSignature = crypto
    .createHmac('sha256', getSecret(secret))
    .update(data)
    .digest('base64url');

  const sigBuf = Buffer.from(signature);
  const expBuf = Buffer.from(expectedSignature);

  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    return null;
  }

  try {
    const payload = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf-8'),
    ) as ReportDownloadTokenPayload;

    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}
