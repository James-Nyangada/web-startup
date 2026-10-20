import crypto from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // 96 bits for GCM
const DEFAULT_KEY_SEED = 'dev_encryption_key_32_characters_long_for_aes_256';

function getKeyBuffer(keyOverride?: string): Buffer {
  const seed = keyOverride || process.env.ENCRYPTION_KEY || DEFAULT_KEY_SEED;
  return crypto.createHash('sha256').update(seed).digest();
}

/**
 * Encrypts a string using AES-256-GCM.
 * Output format: <hex_iv>:<hex_auth_tag>:<hex_ciphertext>
 */
export function encrypt(text: string, keyOverride?: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const key = getKeyBuffer(keyOverride);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

/**
 * Decrypts a string encrypted with encrypt().
 */
export function decrypt(payload: string, keyOverride?: string): string {
  const parts = payload.split(':');
  if (parts.length !== 3) {
    throw new Error('Invalid encrypted payload format');
  }

  const [ivHex, tagHex, cipherHex] = parts;
  const iv = Buffer.from(ivHex!, 'hex');
  const tag = Buffer.from(tagHex!, 'hex');
  const ciphertext = Buffer.from(cipherHex!, 'hex');
  const key = getKeyBuffer(keyOverride);

  const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);

  const decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return decrypted.toString('utf8');
}

/**
 * Generates an HMAC-SHA256 signature for generic webhook payloads.
 */
export function signHmacSha256(secret: string, payload: string): string {
  return crypto.createHmac('sha256', secret).update(payload, 'utf8').digest('hex');
}
