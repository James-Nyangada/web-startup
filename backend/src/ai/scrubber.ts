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

export interface PromptInput {
  ruleId: string;
  ruleTitle: string;
  ruleDescription?: string | null;
  wcagCriteria?: string[] | null;
  platform: string;
  scrubbedSnippet: string;
  failureSummary?: string | null;
}

/**
 * Builds the AI remediation prompt following Section 6.10 specifications.
 */
export function buildAiPrompt(input: PromptInput): string {
  const wcagList =
    input.wcagCriteria && input.wcagCriteria.length > 0
      ? input.wcagCriteria.join(', ')
      : 'WCAG 2.2 AA';

  return `You are an expert accessibility remediation engineer.
Generate a concise, accessible fix for the following issue according to WCAG 2.2 AA standards.

Context:
- Rule ID: ${input.ruleId}
- Rule: ${input.ruleTitle}
${input.ruleDescription ? `- Description: ${input.ruleDescription}` : ''}
- WCAG Criterion: ${wcagList}
- Platform / CMS: ${input.platform}
${input.failureSummary ? `- Failure Summary: ${input.failureSummary}` : ''}

Target Code Snippet:
\`\`\`html
${input.scrubbedSnippet}
\`\`\`

Requirements (Strict):
1. Output format: Markdown, maximum 300 words.
2. Must include the corrected snippet in a fenced code block (e.g. \`\`\`html, \`\`\`liquid, or \`\`\`php).
3. Provide a brief 1-2 sentence explanation of what was fixed and why.
4. Never include filler preamble, pleasantries, or personal data.
5. Ensure the code is directly copyable and syntactically valid for ${input.platform}.`;
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
