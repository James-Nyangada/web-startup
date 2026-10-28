import { authClient } from './auth-client';

/** Only same-site paths: "//evil.example" and "https://…" would turn sign-in into an open redirect. */
export function safeRedirectPath(raw: string | null | undefined): string | null {
  if (!raw || !raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return raw;
}

/**
 * Where to go once a session exists. Staff land on the staff dashboard (a `/staff` deep link is
 * kept); everyone else goes to the requested page or their overview.
 */
export async function landingPathAfterSignIn(requested?: string | null): Promise<string> {
  const target = safeRedirectPath(requested);
  const me = await authClient.getMe().catch(() => null);
  if (me?.mfaPending) {
    return `/sign-in/verify${target ? `?redirect=${encodeURIComponent(target)}` : ''}`;
  }
  if (me?.user.isStaff) return target?.startsWith('/staff') ? target : '/staff';
  return target ?? '/overview';
}
