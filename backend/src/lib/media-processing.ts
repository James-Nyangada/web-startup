import sharp, { type Metadata } from 'sharp';
import { AppError } from './app-error.js';

/** Allowed uploads (staff spec 3.6) with the size limit for each kind. */
export const MEDIA_LIMITS = {
  image: 20 * 1024 * 1024,
  svg: 1024 * 1024,
  video: 50 * 1024 * 1024,
  pdf: 20 * 1024 * 1024,
} as const;

export const VARIANT_WIDTHS = [640, 1280, 1920] as const;

export type MediaMime =
  | 'image/png'
  | 'image/jpeg'
  | 'image/webp'
  | 'image/gif'
  | 'image/svg+xml'
  | 'video/mp4'
  | 'application/pdf';

const EXTENSIONS: Record<MediaMime, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
  'video/mp4': 'mp4',
  'application/pdf': 'pdf',
};

export function extensionFor(mime: MediaMime): string {
  return EXTENSIONS[mime];
}

export function isRasterImage(mime: string): boolean {
  return ['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime);
}

export function isImage(mime: string): boolean {
  return mime.startsWith('image/');
}

/** The real type from the file's bytes; the browser-supplied type is never trusted. */
export function detectMime(buf: Buffer): MediaMime | null {
  if (buf.length >= 8 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length >= 12 && buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') {
    return 'image/webp';
  }
  if (buf.length >= 6 && ['GIF87a', 'GIF89a'].includes(buf.toString('ascii', 0, 6))) return 'image/gif';
  if (buf.length >= 12 && buf.toString('ascii', 4, 8) === 'ftyp') return 'video/mp4';
  if (buf.length >= 5 && buf.toString('ascii', 0, 5) === '%PDF-') return 'application/pdf';
  const head = buf.subarray(0, 1024).toString('utf8').replace(/^\uFEFF/, '').trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) {
    return 'image/svg+xml';
  }
  return null;
}

export function sizeLimitFor(mime: MediaMime): number {
  if (mime === 'image/svg+xml') return MEDIA_LIMITS.svg;
  if (mime === 'video/mp4') return MEDIA_LIMITS.video;
  if (mime === 'application/pdf') return MEDIA_LIMITS.pdf;
  return MEDIA_LIMITS.image;
}

const SVG_FORBIDDEN: { pattern: RegExp; reason: string }[] = [
  { pattern: /<\s*script/i, reason: 'scripts' },
  { pattern: /<\s*foreignObject/i, reason: 'foreignObject' },
  { pattern: /<\s*(iframe|embed|object|audio|video)\b/i, reason: 'embedded content' },
  { pattern: /<\s*(animate|set)\b[^>]*attributeName\s*=\s*["']?(href|xlink:href)/i, reason: 'animated links' },
  { pattern: /\son[a-z]+\s*=/i, reason: 'event handlers' },
  { pattern: /(javascript|vbscript)\s*:/i, reason: 'script URLs' },
  { pattern: /<!ENTITY/i, reason: 'entity declarations' },
  { pattern: /(?:href|src)\s*=\s*["']\s*(?:https?:)?\/\//i, reason: 'external references' },
  { pattern: /url\(\s*["']?\s*(?:https?:)?\/\//i, reason: 'external references' },
  { pattern: /@import/i, reason: 'CSS imports' },
  { pattern: /data\s*:\s*text\/html/i, reason: 'embedded HTML' },
];

/**
 * SVG can carry script, so it is validated rather than trusted: anything active or any
 * external reference rejects the upload. Nothing is rewritten, so what is stored is exactly
 * what was checked.
 */
export function assertSafeSvg(buf: Buffer): string {
  const text = buf.toString('utf8');
  for (const rule of SVG_FORBIDDEN) {
    if (rule.pattern.test(text)) {
      throw AppError.validation(`This SVG contains ${rule.reason}, which is not allowed. Export a plain SVG and try again.`);
    }
  }
  return text;
}

export interface ProcessedVariant {
  width: number;
  format: 'webp' | 'avif';
  data: Buffer;
  height: number;
}

export interface ProcessedImage {
  width: number;
  height: number;
  variants: ProcessedVariant[];
}

/**
 * Reads the image size and makes WebP and AVIF copies at 640, 1280 and 1920 px wide. Widths
 * larger than the original are skipped; an image narrower than 640 px gets one copy at its own
 * width.
 */
export async function processRasterImage(buf: Buffer, mime: string): Promise<ProcessedImage> {
  const animated = mime === 'image/gif';
  let meta: Metadata;
  try {
    meta = await sharp(buf, { limitInputPixels: 50_000_000, animated }).metadata();
  } catch {
    throw AppError.validation('That file could not be read as an image.');
  }
  const width = meta.width;
  const height = animated && meta.pageHeight ? meta.pageHeight : meta.height;
  if (!width || !height) throw AppError.validation('That file could not be read as an image.');

  const widths: number[] = VARIANT_WIDTHS.filter((w) => w <= width);
  if (widths.length === 0) widths.push(width);

  const variants: ProcessedVariant[] = [];
  for (const w of widths) {
    for (const format of ['webp', 'avif'] as const) {
      const pipeline = sharp(buf, { limitInputPixels: 50_000_000, animated })
        .rotate()
        .resize({ width: w, withoutEnlargement: true });
      const out = await (format === 'webp' ? pipeline.webp({ quality: 80 }) : pipeline.avif({ quality: 55 })).toBuffer({
        resolveWithObject: true,
      });
      variants.push({
        width: out.info.width,
        height: animated && out.info.pageHeight ? out.info.pageHeight : out.info.height,
        format,
        data: out.data,
      });
    }
  }
  return { width, height, variants };
}
