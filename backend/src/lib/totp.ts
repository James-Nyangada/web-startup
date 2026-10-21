import crypto from 'node:crypto';

/**
 * Time-based one-time passwords (RFC 6238) for staff sessions (spec 7.12, P6-01).
 * SHA-1, 6 digits, 30-second steps: the defaults every authenticator app supports.
 */

const BASE32_ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;

export function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  return output;
}

export function base32Decode(input: string): Buffer {
  const clean = input.replace(/=+$/, '').replace(/\s+/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32_ALPHABET.indexOf(char);
    if (index === -1) throw new Error('Invalid base32 character');
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** A new 160-bit secret, base32-encoded for authenticator apps. */
export function generateTotpSecret(): string {
  return base32Encode(crypto.randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const message = Buffer.alloc(8);
  message.writeBigUInt64BE(BigInt(counter));
  const digest = crypto.createHmac('sha1', secret).update(message).digest();
  const offset = digest[digest.length - 1]! & 0x0f;
  const binary =
    ((digest[offset]! & 0x7f) << 24) |
    (digest[offset + 1]! << 16) |
    (digest[offset + 2]! << 8) |
    digest[offset + 3]!;
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function totpCode(secretBase32: string, at: Date = new Date()): string {
  return hotp(base32Decode(secretBase32), Math.floor(at.getTime() / 1000 / STEP_SECONDS));
}

/**
 * Checks a code against the current step and one step either side (clock drift).
 * Comparison is constant-time so response timing does not leak digits.
 */
export function verifyTotp(secretBase32: string, code: string, at: Date = new Date()): boolean {
  const candidate = code.replace(/\s+/g, '');
  if (!/^\d{6}$/.test(candidate)) return false;
  const secret = base32Decode(secretBase32);
  const counter = Math.floor(at.getTime() / 1000 / STEP_SECONDS);
  let matched = false;
  for (const drift of [-1, 0, 1]) {
    const expected = Buffer.from(hotp(secret, counter + drift));
    if (crypto.timingSafeEqual(expected, Buffer.from(candidate))) matched = true;
  }
  return matched;
}

/** The `otpauth://` URI that authenticator apps read from a QR code. */
export function totpUri(secretBase32: string, accountName: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${accountName}`);
  const params = new URLSearchParams({
    secret: secretBase32,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
