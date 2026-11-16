import type { Platform } from '../scanner/types.js';

/**
 * How each platform is named in the interface, emails and reports. `custom` is shown as
 * "Custom code" (sites built with React, Next.js, plain HTML, PHP…); see docs/adr/0001.
 */
export const PLATFORM_LABELS: Record<Platform, string> = {
  shopify: 'Shopify',
  wordpress: 'WordPress',
  woocommerce: 'WooCommerce',
  webflow: 'Webflow',
  wix: 'Wix',
  squarespace: 'Squarespace',
  custom: 'Custom code',
  unknown: 'Not sure',
};

export function platformLabel(platform: string | null | undefined): string {
  return PLATFORM_LABELS[(platform ?? 'unknown') as Platform] ?? platform ?? 'Not sure';
}

/** Short names for the values stored in `sites.framework` (the site's tech stack). */
export const FRAMEWORK_LABELS: Record<string, string> = {
  nextjs: 'Next.js',
  nuxt: 'Nuxt',
  gatsby: 'Gatsby',
  remix: 'Remix',
  astro: 'Astro',
  sveltekit: 'SvelteKit',
  angular: 'Angular',
  react: 'React',
  vue: 'Vue',
  svelte: 'Svelte',
  laravel: 'Laravel',
  symfony: 'Symfony',
  django: 'Django',
  rails: 'Ruby on Rails',
  aspnet: '.NET',
  php: 'PHP',
  drupal: 'Drupal',
  joomla: 'Joomla',
  magento: 'Magento',
  ghost: 'Ghost',
  hugo: 'Hugo',
  jekyll: 'Jekyll',
  html: 'Plain HTML',
  other: 'Other',
};

export function frameworkLabel(framework: string | null | undefined): string | null {
  return framework ? (FRAMEWORK_LABELS[framework] ?? framework) : null;
}

/** "Custom code (Next.js)" when the stack is known, otherwise just the platform name. */
export function platformWithStack(
  platform: string | null | undefined,
  framework: string | null | undefined,
): string {
  const base = platformLabel(platform);
  const stack = platform === 'custom' || platform === 'unknown' ? frameworkLabel(framework) : null;
  return stack ? `${platformLabel('custom')} (${stack})` : base;
}

/**
 * The fix-guide platform a request or site maps to. Guides exist for Shopify, WordPress and
 * Custom code; WooCommerce uses the WordPress guides and every other site the Custom code ones.
 * Accepts interface labels ("Custom code") and the legacy `generic` value.
 */
export function guidePlatform(value: string | null | undefined): 'shopify' | 'wordpress' | 'custom' {
  const v = (value ?? '').trim().toLowerCase();
  if (v === 'shopify') return 'shopify';
  if (v === 'wordpress' || v === 'woocommerce') return 'wordpress';
  return 'custom';
}

/** Public URL segment for a guide platform: `/fix/custom-code/...` for the `custom` value. */
export function guideUrlSegment(platform: string | null | undefined): string {
  const p = guidePlatform(platform);
  return p === 'custom' ? 'custom-code' : p;
}
