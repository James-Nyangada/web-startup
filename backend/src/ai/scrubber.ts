import crypto from 'node:crypto';

const MAX_SNIPPET_LENGTH = 2000;
const MAX_OUTPUT_WORDS = 350;

// Matches email addresses
const EMAIL_REGEX =
  /[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+/g;

// Matches phone numbers in international and domestic formats
const PHONE_REGEXES = [
  // International with country code or parens: e.g. +1 (555) 123-4567, +44 20 7946 0958
  /(?:\+?\d{1,4}[-.\s]*)?(?:\(\d{2,5}\)|\d{2,5})[-.\s]*\d{2,5}[-.\s]*\d{2,5}(?:[-.\s]*\d{1,4})?\b/g,
  // Standard 10-digit US/Canada/UK format: e.g. 555-123-4567, 555.123.4567
  /\b\d{3}[-.\s]\d{3}[-.\s]\d{4}\b/g,
  // 10-15 digit raw phone numbers
  /\b\+?\d{10,15}\b/g,
];

// Matches value="..." or value='...' or value=xyz in HTML tags
const VALUE_ATTR_REGEX = /\s*\bvalue\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * Normalises and scrubs an HTML snippet according to Section 6.10:
 * - Capped at 2,000 characters
 * - Strips all `value` attributes
 * - Redacts email addresses
 * - Redacts phone numbers
 */
export function scrubHtmlSnippet(rawHtml: string): string {
  if (!rawHtml) return '';

  let scrubbed = rawHtml.slice(0, MAX_SNIPPET_LENGTH);

  // 1. Strip value attributes
  scrubbed = scrubbed.replace(VALUE_ATTR_REGEX, '');

  // 2. Redact emails
  scrubbed = scrubbed.replace(EMAIL_REGEX, '[REDACTED_EMAIL]');

  // 3. Redact phone numbers
  for (const regex of PHONE_REGEXES) {
    scrubbed = scrubbed.replace(regex, '[REDACTED_PHONE]');
  }

  return scrubbed.trim();
}

/**
 * Computes deterministic SHA-256 cache key per Section 5.3 & 6.10:
 * sha256(rule_id + ':' + platform + ':' + normalised_snippet)
 */
export function computeCacheKey(ruleId: string, platform: string, snippet: string): string {
  const normalisedSnippet = scrubHtmlSnippet(snippet);
  const composite = `${ruleId.trim().toLowerCase()}:${platform.trim().toLowerCase()}:${normalisedSnippet}`;
  return crypto.createHash('sha256').update(composite, 'utf8').digest('hex');
}

/** Cache scope: the same rule needs different code for Next.js than for plain HTML. */
export function aiCacheScope(platform: string, framework?: string | null): string {
  return framework && (platform === 'custom' || platform === 'unknown' || platform === 'generic')
    ? `${platform}:${framework}`
    : platform;
}

export interface PromptInput {
  ruleId: string;
  ruleTitle: string;
  ruleDescription?: string | null;
  wcagCriteria?: string[] | null;
  platform: string;
  framework?: string | null;
  scrubbedSnippet: string;
  failureSummary?: string | null;
}

interface StackProfile {
  label: string;
  /** Fence language for the answer. */
  lang: string;
  /** How to rewrite the rendered HTML into this stack's source syntax. */
  guidance: string;
}

const REACT_RULES =
  'Use JSX: `className` not `class`, `htmlFor` not `for`, camelCase event props, self-closed void tags, `aria-*` attributes as written.';

/** Source-level syntax per detected framework. The scanner only sees rendered HTML. */
export const STACK_PROFILES: Record<string, StackProfile> = {
  nextjs: {
    label: 'Next.js (React)',
    lang: 'tsx',
    guidance: `${REACT_RULES} Prefer \`next/image\` (\`<Image alt="…" />\`) and \`next/link\` over raw \`<img>\`/\`<a>\` where the snippet is one of those elements.`,
  },
  react: { label: 'React', lang: 'tsx', guidance: REACT_RULES },
  gatsby: { label: 'Gatsby (React)', lang: 'tsx', guidance: REACT_RULES },
  remix: { label: 'Remix (React)', lang: 'tsx', guidance: REACT_RULES },
  nuxt: {
    label: 'Nuxt (Vue)',
    lang: 'vue',
    guidance:
      'Write a Vue single-file-component `<template>` fragment. Use `:alt`/`:aria-label` bindings for dynamic values and `<NuxtLink>`/`<NuxtImg>` where the snippet is a link/image.',
  },
  vue: {
    label: 'Vue',
    lang: 'vue',
    guidance:
      'Write a Vue single-file-component `<template>` fragment. Use `:attr="expr"` bindings for dynamic values.',
  },
  angular: {
    label: 'Angular',
    lang: 'html',
    guidance:
      'Write an Angular component template. Use `[attr.aria-label]="…"` for dynamic ARIA values, `routerLink` for links and `[alt]` bindings for dynamic text.',
  },
  svelte: {
    label: 'Svelte',
    lang: 'svelte',
    guidance: 'Write Svelte markup. Use `{expr}` for dynamic values.',
  },
  sveltekit: {
    label: 'SvelteKit',
    lang: 'svelte',
    guidance: 'Write Svelte markup. Use `{expr}` for dynamic values.',
  },
  astro: {
    label: 'Astro',
    lang: 'astro',
    guidance: 'Write an `.astro` template fragment (HTML with `{expr}` expressions).',
  },
  laravel: {
    label: 'Laravel (Blade)',
    lang: 'blade',
    guidance:
      'Write a Blade template. Use `{{ }}` for escaped output, `__()` for translatable text and `@csrf`/`@error` where relevant.',
  },
  symfony: {
    label: 'Symfony (Twig)',
    lang: 'twig',
    guidance: 'Write a Twig template. Use `{{ }}` for output and `|trans` for translatable text.',
  },
  django: {
    label: 'Django',
    lang: 'django',
    guidance: 'Write a Django template. Use `{{ }}` for output and `{% trans %}` for text.',
  },
  rails: {
    label: 'Ruby on Rails (ERB)',
    lang: 'erb',
    guidance:
      'Write ERB. Prefer Rails helpers (`image_tag`, `link_to`, `label_tag`, `form_with`) over raw HTML where the snippet maps to one.',
  },
  aspnet: {
    label: 'ASP.NET (Razor)',
    lang: 'cshtml',
    guidance:
      'Write Razor markup. Prefer tag helpers (`asp-for`, `asp-action`) where the snippet is a form control or link.',
  },
  php: {
    label: 'PHP',
    lang: 'php',
    guidance:
      'Write a PHP template: HTML with `<?= htmlspecialchars($value) ?>` for dynamic output. Keep changes minimal.',
  },
  drupal: {
    label: 'Drupal (Twig)',
    lang: 'twig',
    guidance: 'Write a Drupal Twig template. Use `{{ }}` for output and `attributes.setAttribute()`.',
  },
  joomla: {
    label: 'Joomla (PHP)',
    lang: 'php',
    guidance: 'Write a Joomla PHP layout override. Use `$this->escape()` for output.',
  },
  magento: {
    label: 'Magento (PHTML)',
    lang: 'php',
    guidance: 'Write a PHTML template. Use `$escaper->escapeHtml()` for dynamic output.',
  },
  ghost: {
    label: 'Ghost (Handlebars)',
    lang: 'handlebars',
    guidance: 'Write a Handlebars theme template. Use `{{ }}` for output and `{{t "…"}}` for text.',
  },
  hugo: {
    label: 'Hugo',
    lang: 'go-html-template',
    guidance: 'Write a Hugo (Go template) partial. Use `{{ }}` for output.',
  },
  jekyll: {
    label: 'Jekyll (Liquid)',
    lang: 'liquid',
    guidance: 'Write a Jekyll Liquid template. Use `{{ }}` for output.',
  },
  html: {
    label: 'plain HTML',
    lang: 'html',
    guidance: 'Write plain, static HTML.',
  },
};

const PLATFORM_PROFILES: Record<string, StackProfile> = {
  shopify: {
    label: 'Shopify (Liquid theme)',
    lang: 'liquid',
    guidance: 'Write Liquid for a Shopify theme. Use `{{ }}` and Shopify filters such as `image_url`.',
  },
  wordpress: {
    label: 'WordPress',
    lang: 'php',
    guidance:
      'Write a WordPress theme template (PHP + HTML) and escape output with `esc_html()`/`esc_attr()`.',
  },
  woocommerce: {
    label: 'WooCommerce',
    lang: 'php',
    guidance:
      'Write a WooCommerce template override (PHP + HTML) and escape output with `esc_html()`/`esc_attr()`.',
  },
};

/** The stack the fix must be written for, from the detected platform and framework. */
export function resolveStackProfile(platform: string, framework?: string | null): StackProfile {
  const platformProfile = PLATFORM_PROFILES[platform];
  if (platformProfile) return platformProfile;
  return (framework && STACK_PROFILES[framework]) || STACK_PROFILES.html!;
}

/**
 * Builds the AI remediation prompt following Section 6.10 specifications.
 */
export function buildAiPrompt(input: PromptInput): string {
  const wcagList =
    input.wcagCriteria && input.wcagCriteria.length > 0
      ? input.wcagCriteria.join(', ')
      : 'WCAG 2.2 AA';
  const stack = resolveStackProfile(input.platform, input.framework);

  return `You are an expert accessibility engineer writing a fix for a developer who is not an accessibility specialist.

The website is built with: ${stack.label}.

Context:
- Rule ID: ${input.ruleId}
- Rule: ${input.ruleTitle}
${input.ruleDescription ? `- Description: ${input.ruleDescription}\n` : ''}- WCAG Criterion: ${wcagList}
${input.failureSummary ? `- Failure Summary: ${input.failureSummary}\n` : ''}
Rendered HTML the scanner found (this is what the browser received, not the source file):
\`\`\`html
${input.scrubbedSnippet}
\`\`\`

Rewrite the fix in the source syntax of ${stack.label}. ${stack.guidance}
If a value is dynamic in a real ${stack.label} app (text, URLs, image paths), keep it as a variable or expression instead of hard-coding the rendered value.

Reply in EXACTLY this layout, with nothing before or after it:

**Problem:** <one plain-English sentence: what is wrong and who it affects. No rule IDs or jargon.>

**Fix:** <one or two sentences: what you changed, in plain words.>

\`\`\`${stack.lang}
<the corrected code, ready to paste>
\`\`\`

**Tip:** <optional, one sentence, only if there is a genuinely useful alternative or caveat. Omit this line otherwise.>

Rules:
- Maximum 200 words in total, excluding the code.
- Exactly one fenced code block, closed properly.
- Do not put headings, notes or warnings before the code block.
- Only use variables, components or data that the snippet implies; do not invent new application data.
- No greeting, no filler, no personal data.`;
}

export interface OutputValidationResult {
  valid: boolean;
  markdown: string;
}

/**
 * Validates the AI model output structure per Section 6.10:
 * - Must contain a fenced code block with code
 * - Max 350 words
 * - On failure returns "Suggestion unavailable"
 */
export function validateAiOutput(rawMarkdown: string | null | undefined): OutputValidationResult {
  if (!rawMarkdown || typeof rawMarkdown !== 'string') {
    return { valid: false, markdown: 'Suggestion unavailable' };
  }

  const trimmed = rawMarkdown.trim();
  if (trimmed.length === 0) {
    return { valid: false, markdown: 'Suggestion unavailable' };
  }

  // Word count check
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length > MAX_OUTPUT_WORDS) {
    return { valid: false, markdown: 'Suggestion unavailable' };
  }

  // Fenced code block check: ```[lang]\n...\n```
  const codeBlockRegex = /```[a-zA-Z0-9_-]*[\r\n]+([\s\S]+?)[\r\n]+```/;
  const match = codeBlockRegex.exec(trimmed);

  if (!match || !match[1]?.trim()) {
    return { valid: false, markdown: 'Suggestion unavailable' };
  }

  return { valid: true, markdown: trimmed };
}
