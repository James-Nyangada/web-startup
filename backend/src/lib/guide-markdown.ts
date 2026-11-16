export interface GuideSections {
  whatsWrong: string;
  whoItAffects: string;
  howToFix: string;
  codeExample?: { incorrect?: string; correct?: string; language?: string };
  /**
   * Further labelled examples after Incorrect/Correct, e.g. "CSS", "React / Next.js (JSX)", "Vue".
   * Custom code guides use these for framework versions of the fix.
   */
  extraExamples?: { label: string; language?: string; code: string }[];
  howToCheck: string;
}

const PLATFORM_NAMES: Record<string, string> = {
  shopify: 'Shopify',
  wordpress: 'WordPress',
  custom: 'a custom-coded site',
  // Legacy value from before custom code guides had their own platform (docs/adr/0001).
  generic: 'a custom-coded site',
};

export function platformName(platform: string): string {
  return PLATFORM_NAMES[platform] ?? platform;
}

function sectionBody(md: string, heading: RegExp): string {
  const lines = md.split(/\r?\n/);
  const start = lines.findIndex((l) => heading.test(l));
  if (start === -1) return '';
  const out: string[] = [];
  for (let i = start + 1; i < lines.length; i++) {
    if (/^## /.test(lines[i]!)) break;
    out.push(lines[i]!);
  }
  return out.join('\n').trim();
}

function fence(md: string, label: 'Incorrect' | 'Correct') {
  const m = new RegExp(`###\\s*${label}\\s*\\n\`\`\`(\\w*)\\n([\\s\\S]*?)\\n\`\`\``, 'i').exec(md);
  return m ? { language: m[1] || undefined, code: m[2]! } : null;
}

/** Every `### Label` + fenced block in the code section other than Incorrect/Correct. */
function extraFences(md: string): NonNullable<GuideSections['extraExamples']> {
  const out: NonNullable<GuideSections['extraExamples']> = [];
  for (const m of md.matchAll(/^###\s*(.+?)\s*\n```(\w*)\n([\s\S]*?)\n```/gm)) {
    const label = m[1]!.trim();
    if (/^(incorrect|correct)$/i.test(label)) continue;
    out.push({ label, language: m[2] || undefined, code: m[3]! });
  }
  return out;
}

/** Splits a guide written in the five-section template into its fields. */
export function parseGuideSections(bodyMd: string): GuideSections {
  const code = sectionBody(bodyMd, /^## Code example/i);
  const incorrect = fence(code, 'Incorrect');
  const correct = fence(code, 'Correct');
  const extra = extraFences(code);
  return {
    whatsWrong: sectionBody(bodyMd, /^## What's wrong/i),
    whoItAffects: sectionBody(bodyMd, /^## Who it affects/i),
    howToFix: sectionBody(bodyMd, /^## How to fix/i),
    ...(incorrect || correct
      ? {
          codeExample: {
            incorrect: incorrect?.code,
            correct: correct?.code,
            language: correct?.language ?? incorrect?.language,
          },
        }
      : {}),
    ...(extra.length > 0 ? { extraExamples: extra } : {}),
    howToCheck: sectionBody(bodyMd, /^## How to check/i),
  };
}

/** Rebuilds the markdown body for the public site and the in-app panel. */
export function composeGuideBody(title: string, platform: string, s: GuideSections): string {
  const lang = s.codeExample?.language ?? '';
  const code: string[] = [];
  if (s.codeExample?.incorrect) code.push(`### Incorrect\n\`\`\`${lang}\n${s.codeExample.incorrect}\n\`\`\``);
  if (s.codeExample?.correct) code.push(`### Correct\n\`\`\`${lang}\n${s.codeExample.correct}\n\`\`\``);
  for (const x of s.extraExamples ?? []) {
    code.push(`### ${x.label}\n\`\`\`${x.language ?? ''}\n${x.code}\n\`\`\``);
  }
  return [
    `# ${title}`,
    `## What's wrong\n\n${s.whatsWrong}`,
    `## Who it affects\n\n${s.whoItAffects}`,
    `## How to fix on ${platformName(platform)}\n\n${s.howToFix}`,
    `## Code example\n\n${code.join('\n\n')}`.trimEnd(),
    `## How to check your fix\n\n${s.howToCheck}`,
  ].join('\n\n');
}
