/**
 * Converts a string into a URL-safe slug.
 */
export function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'org'
  );
}

/**
 * Org slugs live at the top of the app URL (`/<slug>`), so they must not collide with the web
 * app's own top-level routes or obvious future ones. Keep in step with `web/app/`.
 */
export const RESERVED_SLUGS = new Set([
  'accessibility-notes',
  'account',
  'admin',
  'agencies',
  'api',
  'app',
  'blog',
  'bot',
  'changelog',
  'check',
  'checkout',
  'connect',
  'developers',
  'docs',
  'fix',
  'for-agencies',
  'forgot-password',
  'foundations',
  'help',
  'invitations',
  'invite',
  'legal',
  'magic',
  'maintenance',
  'not-found',
  'onboarding',
  'org',
  'overview',
  'portal',
  'preview',
  'pricing',
  'privacy',
  'reports',
  'reset-password',
  's',
  'settings',
  'sign-in',
  'sign-out',
  'sign-up',
  'sites',
  'staff',
  'status',
  'support',
  'tasks',
  'terms',
  'verify-email',
  'www',
]);

export function isReservedSlug(slug: string): boolean {
  return RESERVED_SLUGS.has(slug.toLowerCase());
}
