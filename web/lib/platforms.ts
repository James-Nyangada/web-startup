/**
 * Platform and tech-stack names shown in the app and marketing site.
 * Mirrors backend/src/shared/platforms.ts; `custom` is shown as "Custom code" (docs/adr/0001).
 */

/** "How is your site built?" options, in the order the add-site and onboarding forms show them. */
export const PLATFORM_OPTIONS: { value: string; label: string }[] = [
  { value: "shopify", label: "Shopify" },
  { value: "wordpress", label: "WordPress" },
  { value: "woocommerce", label: "WooCommerce" },
  { value: "wix", label: "Wix" },
  { value: "webflow", label: "Webflow" },
  { value: "squarespace", label: "Squarespace" },
  { value: "custom", label: "Custom code" },
  { value: "unknown", label: "Not sure" },
];

export const PLATFORM_LABEL: Record<string, string> = Object.fromEntries(
  PLATFORM_OPTIONS.map((o) => [o.value, o.label]),
);

/** "Which technology?" options for custom-coded sites (stored in `sites.framework`). */
export const TECH_STACK_OPTIONS: { value: string; label: string }[] = [
  { value: "react", label: "React" },
  { value: "nextjs", label: "Next.js" },
  { value: "vue", label: "Vue" },
  { value: "nuxt", label: "Nuxt" },
  { value: "angular", label: "Angular" },
  { value: "svelte", label: "Svelte / SvelteKit" },
  { value: "html", label: "Plain HTML" },
  { value: "php", label: "PHP" },
  { value: "laravel", label: "Laravel" },
  { value: "django", label: "Django" },
  { value: "rails", label: "Ruby on Rails" },
  { value: "aspnet", label: ".NET" },
  { value: "other", label: "Other" },
];

/** Names for every stack detection can return, including ones not offered in the dropdown. */
export const FRAMEWORK_LABEL: Record<string, string> = {
  ...Object.fromEntries(TECH_STACK_OPTIONS.map((o) => [o.value, o.label])),
  svelte: "Svelte",
  sveltekit: "SvelteKit",
  gatsby: "Gatsby",
  remix: "Remix",
  astro: "Astro",
  symfony: "Symfony",
  drupal: "Drupal",
  joomla: "Joomla",
  magento: "Magento",
  ghost: "Ghost",
  hugo: "Hugo",
  jekyll: "Jekyll",
};

/** The dropdown value for a detected stack (SvelteKit is offered as "Svelte / SvelteKit"). */
export function techStackOption(framework: string | null | undefined): string {
  if (!framework) return "";
  if (framework === "sveltekit") return "svelte";
  return TECH_STACK_OPTIONS.some((o) => o.value === framework) ? framework : "other";
}

export const isCustomPlatform = (platform: string | null | undefined) =>
  platform === "custom" || platform === "unknown";

export function frameworkLabel(framework: string | null | undefined): string | null {
  return framework ? (FRAMEWORK_LABEL[framework] ?? framework) : null;
}

/** "Custom code (Next.js)" when the stack is known, otherwise the platform name. */
export function platformWithStack(platform: string | null | undefined, framework?: string | null): string {
  const stack = isCustomPlatform(platform) ? frameworkLabel(framework) : null;
  if (stack) return `Custom code (${stack})`;
  return PLATFORM_LABEL[platform ?? "unknown"] ?? platform ?? "Not sure";
}

/** Fix guides exist for these three; WooCommerce uses WordPress, everything else Custom code. */
export type GuidePlatform = "shopify" | "wordpress" | "custom";

export const GUIDE_PLATFORM_LABEL: Record<GuidePlatform, string> = {
  shopify: "Shopify",
  wordpress: "WordPress",
  custom: "Custom code",
};

export function guidePlatformFor(platform: string | null | undefined): GuidePlatform {
  const p = (platform ?? "").toLowerCase();
  if (p.includes("shopify")) return "shopify";
  if (p.includes("wordpress") || p.includes("woocommerce")) return "wordpress";
  return "custom";
}

/** URL segment: `/fix/custom-code/...` for Custom code guides, the platform value otherwise. */
export function guideUrlSegment(platform: GuidePlatform): string {
  return platform === "custom" ? "custom-code" : platform;
}

export function guidePlatformFromSegment(segment: string): GuidePlatform | null {
  if (segment === "custom-code") return "custom";
  if (segment === "shopify" || segment === "wordpress") return segment;
  return null;
}

export const guideHref = (g: { platform: GuidePlatform; slug: string }) =>
  `/fix/${guideUrlSegment(g.platform)}/${g.slug}`;
