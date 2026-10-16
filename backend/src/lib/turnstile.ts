const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

export type TurnstileVerifier = (
  token: string | undefined,
  ip: string | undefined,
) => Promise<boolean>;

/**
 * Without a secret (local development) every request passes. Production refuses
 * to start without one (see config/env.ts).
 */
export function createTurnstileVerifier(secret: string | undefined): TurnstileVerifier {
  if (!secret) return () => Promise.resolve(true);

  return async (token, ip) => {
    if (!token) return false;
    const form = new URLSearchParams({ secret, response: token });
    if (ip) form.set('remoteip', ip);
    try {
      const response = await fetch(VERIFY_URL, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(5_000),
      });
      const result = (await response.json()) as { success?: boolean };
      return result.success === true;
    } catch {
      return false;
    }
  };
}
