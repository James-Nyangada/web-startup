/**
 * Upload checks for logos (spec 11.1, P6-10): the type comes from the file's bytes, not the
 * name or the declared MIME type, raster images are limited in size, and SVGs that could run
 * script or load other resources are refused.
 */

export type ImageType = 'image/png' | 'image/jpeg' | 'image/webp' | 'image/svg+xml';

export function sniffImageType(buf: Buffer): ImageType | null {
  if (
    buf.length >= 8 &&
    buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return 'image/png';
  }
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) {
    return 'image/webp';
  }
  const head = buf
    .subarray(0, 1024)
    .toString('utf8')
    .replace(/^\uFEFF/, '')
    .trimStart();
  if (/^(<\?xml[^>]*>\s*)?(<!--[\s\S]*?-->\s*)*(<!DOCTYPE svg[^>]*>\s*)?<svg[\s>]/i.test(head)) {
    return 'image/svg+xml';
  }
  return null;
}

/** Pixel size of a PNG, JPEG or WebP, or null if it cannot be read. */
export function imageDimensions(
  buf: Buffer,
  type: ImageType,
): { width: number; height: number } | null {
  try {
    if (type === 'image/png') {
      return { width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
    }
    if (type === 'image/webp') {
      const chunk = buf.toString('ascii', 12, 16);
      if (chunk === 'VP8X')
        return { width: 1 + buf.readUIntLE(24, 3), height: 1 + buf.readUIntLE(27, 3) };
      if (chunk === 'VP8L') {
        const b = buf.readUInt32LE(21);
        return { width: 1 + (b & 0x3fff), height: 1 + ((b >> 14) & 0x3fff) };
      }
      if (chunk === 'VP8 ')
        return { width: buf.readUInt16LE(26) & 0x3fff, height: buf.readUInt16LE(28) & 0x3fff };
      return null;
    }
    if (type === 'image/jpeg') {
      let p = 2;
      while (p + 9 < buf.length) {
        if (buf[p] !== 0xff) return null;
        const marker = buf[p + 1]!;
        const len = buf.readUInt16BE(p + 2);
        // SOF0–SOF15 except DHT (C4), JPG (C8) and DAC (CC) carry the frame size.
        if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
          return { height: buf.readUInt16BE(p + 5), width: buf.readUInt16BE(p + 7) };
        }
        p += 2 + len;
      }
    }
  } catch {
    return null;
  }
  return null;
}

/**
 * Refuses SVG features that can execute code or fetch other resources. A logo needs none of
 * them; rejecting is safer than trying to rewrite the markup.
 */
export function unsafeSvgReason(svg: string): string | null {
  const s = svg.toLowerCase();
  if (/<script[\s>]/.test(s)) return 'scripts';
  if (/<foreignobject[\s>]/.test(s)) return 'embedded HTML (foreignObject)';
  if (/\son[a-z]+\s*=/.test(s)) return 'event handler attributes';
  if (/(href|src)\s*=\s*["']?\s*(javascript|data:text\/html|vbscript)/.test(s))
    return 'script links';
  if (/<!entity/.test(s)) return 'XML entities';
  if (/(xlink:)?href\s*=\s*["']\s*(https?:)?\/\//.test(s)) return 'links to external files';
  if (/<(iframe|embed|object|use)[\s>][^>]*(href|src)\s*=\s*["']\s*(https?:)?\/\//.test(s)) {
    return 'external content';
  }
  if (/@import|url\(\s*["']?\s*(https?:)?\/\//.test(s)) return 'external stylesheets or images';
  return null;
}
