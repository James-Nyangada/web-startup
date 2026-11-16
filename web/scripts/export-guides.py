import os
import json
import re

guides_dir = 'packages/fix-guides/guides'
files = sorted(os.listdir(guides_dir))
items = []

for f in files:
    if not f.endswith('.md'):
        continue
    path = os.path.join(guides_dir, f)
    with open(path, 'r', encoding='utf-8') as fh:
        text = fh.read()

    fm_match = re.search(r'^---\n(.*?)\n---\n(.*)$', text, re.DOTALL)
    if not fm_match:
        continue

    fm_text = fm_match.group(1)
    body = fm_match.group(2).strip()

    meta = {}
    for line in fm_text.splitlines():
        if ':' in line:
            k, v = line.split(':', 1)
            meta[k.strip()] = v.strip().strip('"\'')

    # `slug:` front matter overrides the file name (Custom code guides: /fix/custom-code/image-alt).
    slug = meta.get('slug') or f.replace('.md', '')

    def extract_sec(title_pat):
        m = re.search(r'## ' + title_pat + r'\n\n(.*?)(?=\n## |\Z)', body, re.DOTALL)
        return m.group(1).strip() if m else ''

    wrong = extract_sec("What's wrong")
    affects = extract_sec("Who it affects")
    how_to_fix = extract_sec("How to fix on.*?")
    code = extract_sec("Code example")
    check = extract_sec("How to check your fix")

    items.append({
        'ruleId': meta.get('rule_id', ''),
        'platform': meta.get('platform', ''),
        'slug': slug,
        'title': meta.get('title', ''),
        'summary': meta.get('summary', ''),
        'reviewedAt': meta.get('reviewed_at', ''),
        'wrong': wrong,
        'affects': affects,
        'howToFix': how_to_fix,
        'codeSnippet': code,
        'howToCheck': check,
        'bodyMd': body
    })

ts_header = """// Auto-generated from packages/fix-guides/guides by web/scripts/export-guides.py. Do not edit.
import { guidePlatformFor, type GuidePlatform } from './platforms';

export interface FixGuideItem {
  ruleId: string;
  /** `custom` = Custom code guides, served at /fix/custom-code/... (docs/adr/0001). */
  platform: GuidePlatform;
  slug: string;
  title: string;
  summary: string;
  reviewedAt: string;
  wrong: string;
  affects: string;
  howToFix: string;
  codeSnippet: string;
  howToCheck: string;
  bodyMd: string;
}

export const FIX_GUIDES_DATA: FixGuideItem[] = """

ts_footer = """;

export function getAllFixGuides(): FixGuideItem[] {
  return FIX_GUIDES_DATA;
}

export function getFixGuideBySlug(slug: string): FixGuideItem | undefined {
  return FIX_GUIDES_DATA.find((g) => g.slug === slug);
}

export function getFixGuidesByPlatform(platform: GuidePlatform): FixGuideItem[] {
  return FIX_GUIDES_DATA.filter((g) => g.platform === platform);
}

/** Accepts a site platform or a tab label: WooCommerce maps to WordPress, others to Custom code. */
export function getFixGuideByRuleAndPlatform(
  ruleId: string,
  platform: string,
): FixGuideItem | undefined {
  const target = guidePlatformFor(platform);
  return FIX_GUIDES_DATA.find((g) => g.ruleId === ruleId && g.platform === target);
}
"""

with open('web/lib/fix-guides-data.ts', 'w', encoding='utf-8') as out:
    out.write(ts_header + json.dumps(items, indent=2) + ts_footer)

print(f'Wrote {len(items)} guides to web/lib/fix-guides-data.ts')
