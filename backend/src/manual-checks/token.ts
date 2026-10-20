import crypto from 'node:crypto';

export interface AttachmentDownloadTokenPayload {
  checkId: string;
  orgId: string;
  attachmentKey: string;
  exp: number; // Unix timestamp in seconds
}

function getSecret(secret?: string): string {
  return (
    secret ??
    process.env.ENCRYPTION_KEY ??
    process.env.AUTH_SECRET ??
    'fallback-secret-for-attachment-download-signing'
  );
}

/**
 * Creates an HMAC-SHA256 signed download token for secure 15-minute attachment downloads.
 */
export function signAttachmentDownloadToken(
  payload: AttachmentDownloadTokenPayload,
  secret?: string,
): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const signature = crypto.createHmac('sha256', getSecret(secret)).update(data).digest('base64url');
  return `${data}.${signature}`;
}

/**
 * Verifies an HMAC-SHA256 signed download token and confirms it hasn't expired.
 */
export function verifyAttachmentDownloadToken(
  token: string,
  secret?: string,
): AttachmentDownloadTokenPayload | null {
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
    ) as AttachmentDownloadTokenPayload;
    const nowSec = Math.floor(Date.now() / 1000);
    if (payload.exp < nowSec) return null;
    return payload;
  } catch {
    return null;
  }
}

export type AllowedAttachmentType = 'pdf' | 'png' | 'jpeg';

export interface ValidatedAttachment {
  type: AllowedAttachmentType;
  mimeType: string;
  extension: string;
}

/**
 * Validates file magic bytes to ensure real file type is PDF, PNG, or JPEG.
 */
export function detectAttachmentType(buffer: Buffer): ValidatedAttachment | null {
  if (buffer.length < 4) return null;

  // PDF magic bytes: %PDF (0x25 0x50 0x44 0x46)
  if (buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
    return {
      type: 'pdf',
      mimeType: 'application/pdf',
      extension: 'pdf',
    };
  }

  // PNG magic bytes: 0x89 0x50 0x4E 0x47 0x0D 0x0A 0x1A 0x0A
  if (
    buffer.length >= 8 &&
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return {
      type: 'png',
      mimeType: 'image/png',
      extension: 'png',
    };
  }

  // JPEG magic bytes: 0xFF 0xD8 0xFF
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return {
      type: 'jpeg',
      mimeType: 'image/jpeg',
      extension: 'jpg',
    };
  }

  return null;
}
