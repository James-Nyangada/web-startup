import { describe, expect, it } from 'vitest';
import {
  base32Decode,
  base32Encode,
  generateTotpSecret,
  totpCode,
  totpUri,
  verifyTotp,
} from '../../src/lib/totp.js';

// RFC 6238 appendix B test secret ("12345678901234567890" as ASCII), SHA-1.
const RFC_SECRET = base32Encode(Buffer.from('12345678901234567890'));

describe('P6-01: TOTP', () => {
  it('round-trips base32', () => {
    const bytes = Buffer.from('hello staff');
    expect(base32Decode(base32Encode(bytes)).equals(bytes)).toBe(true);
  });

  it('matches the RFC 6238 SHA-1 test vectors (last 6 digits)', () => {
    expect(totpCode(RFC_SECRET, new Date(59 * 1000))).toBe('287082');
    expect(totpCode(RFC_SECRET, new Date(1111111109 * 1000))).toBe('081804');
    expect(totpCode(RFC_SECRET, new Date(1234567890 * 1000))).toBe('005924');
    expect(totpCode(RFC_SECRET, new Date(2000000000 * 1000))).toBe('279037');
  });

  it('accepts the current code and one step of drift, rejects older codes', () => {
    const secret = generateTotpSecret();
    const now = new Date('2026-10-21T12:00:00Z');
    expect(verifyTotp(secret, totpCode(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, new Date(now.getTime() - 30_000)), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, new Date(now.getTime() - 120_000)), now)).toBe(
      false,
    );
  });

  it('rejects malformed codes', () => {
    const secret = generateTotpSecret();
    expect(verifyTotp(secret, '12345')).toBe(false);
    expect(verifyTotp(secret, 'abcdef')).toBe(false);
    expect(verifyTotp(secret, '')).toBe(false);
  });

  it('builds an otpauth URI with issuer and account', () => {
    const uri = totpUri('JBSWY3DPEHPK3PXP', 'staff@example.com', 'EveryVisitor Staff');
    expect(uri.startsWith('otpauth://totp/EveryVisitor%20Staff%3Astaff%40example.com?')).toBe(true);
    expect(uri).toContain('secret=JBSWY3DPEHPK3PXP');
    expect(uri).toContain('issuer=EveryVisitor+Staff');
  });
});
