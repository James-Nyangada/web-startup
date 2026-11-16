import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface FixGuideFrontMatter {
  rule_id: string;
  platform: string;
  title: string;
  summary: string;
  reviewed_at: string;
}

export interface FixGuide {
  ruleId: string;
  platform: string;
  slug: string;
  title: string;
  summary: string;
  reviewedAt: string;
  bodyMd: string;
  filePath: string;
}

export interface ValidationError {
  file: string;
  message: string;
}

export const REQUIRED_SECTIONS = [
  "## What's wrong",
  '## Who it affects',
  '## How to fix on',
  '## Code example',
  '## How to check your fix',
];

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function parseFrontMatter(content: string): { data: Record<string, string>; body: string } {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) {
    throw new Error('Missing or malformed YAML front matter (must start and end with ---)');
  }

  const rawYaml = match[1] || '';
  const body = match[2] || '';
  const data: Record<string, string> = {};

  for (const line of rawYaml.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const colonIdx = trimmed.indexOf(':');
    if (colonIdx === -1) continue;
    const key = trimmed.slice(0, colonIdx).trim();
    let val = trimmed.slice(colonIdx + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    data[key] = val;
  }

  return { data, body };
}

export function validateFixGuideContent(content: string, filename: string): ValidationError[] {
  const errors: ValidationError[] = [];

  let data: Record<string, string>;
  let body: string;

  try {
    const parsed = parseFrontMatter(content);
    data = parsed.data;
    body = parsed.body;
  } catch (err) {
    errors.push({ file: filename, message: err instanceof Error ? err.message : String(err) });
    return errors;
  }

  if (!data.rule_id)
    errors.push({ file: filename, message: 'Missing required front matter: rule_id' });
  if (!data.platform)
    errors.push({ file: filename, message: 'Missing required front matter: platform' });
  if (!data.title) errors.push({ file: filename, message: 'Missing required front matter: title' });
  if (!data.summary)
    errors.push({ file: filename, message: 'Missing required front matter: summary' });
  if (!data.reviewed_at)
    errors.push({ file: filename, message: 'Missing required front matter: reviewed_at' });

  if (data.reviewed_at && isNaN(Date.parse(data.reviewed_at))) {
    errors.push({
      file: filename,
      message: `Invalid date format in reviewed_at: ${data.reviewed_at}`,
    });
  }

  for (const req of REQUIRED_SECTIONS) {
    if (!body.includes(req)) {
      errors.push({
        file: filename,
        message: `Missing required section heading: '${req}'`,
      });
    }
  }

  return errors;
}

export function parseFixGuide(content: string, filePath: string): FixGuide {
  const filename = path.basename(filePath);
  const errors = validateFixGuideContent(content, filename);
  if (errors.length > 0) {
    throw new Error(
      `Validation failed for ${filename}: ${errors.map((e) => e.message).join(', ')}`,
    );
  }

  const { data, body } = parseFrontMatter(content);
  // `slug:` front matter overrides the file name (Custom code guides: /fix/custom-code/image-alt).
  const slug = data.slug || filename.replace(/\.md$/, '');

  return {
    ruleId: data.rule_id || '',
    platform: data.platform || '',
    slug,
    title: data.title || '',
    summary: data.summary || '',
    reviewedAt: data.reviewed_at || new Date().toISOString(),
    bodyMd: body.trim(),
    filePath,
  };
}

export function getGuidesDirectory(): string {
  const candidates = [
    path.resolve(process.cwd(), '../packages/fix-guides/guides'),
    path.resolve(process.cwd(), 'packages/fix-guides/guides'),
    path.resolve(__dirname, '../../../packages/fix-guides/guides'),
    path.resolve(__dirname, '../../../../packages/fix-guides/guides'),
  ];

  for (const dir of candidates) {
    if (fs.existsSync(dir)) return dir;
  }
  return candidates[0]!;
}

export function loadAllFixGuides(dirPath?: string): FixGuide[] {
  const targetDir = dirPath || getGuidesDirectory();
  if (!fs.existsSync(targetDir)) {
    return [];
  }

  const files = fs.readdirSync(targetDir).filter((f) => f.endsWith('.md'));
  const guides: FixGuide[] = [];

  for (const file of files) {
    const fullPath = path.join(targetDir, file);
    const content = fs.readFileSync(fullPath, 'utf-8');
    guides.push(parseFixGuide(content, fullPath));
  }

  return guides;
}

export function getFixGuide(
  platform: string,
  ruleId: string,
  dirPath?: string,
): FixGuide | undefined {
  const guides = loadAllFixGuides(dirPath);
  return guides.find(
    (g) => g.platform.toLowerCase() === platform.toLowerCase() && g.ruleId === ruleId,
  );
}

export function getFixGuideBySlug(slug: string, dirPath?: string): FixGuide | undefined {
  const guides = loadAllFixGuides(dirPath);
  return guides.find((g) => g.slug === slug);
}
