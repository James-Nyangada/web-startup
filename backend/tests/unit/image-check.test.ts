import { describe, expect, it } from 'vitest';
import { imageDimensions, sniffImageType, unsafeSvgReason } from '../../src/lib/image-check.js';

function png(width: number, height: number): Buffer {
  const b = Buffer.alloc(33);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(b, 0);
  b.writeUInt32BE(13, 8);
  b.write('IHDR', 12, 'ascii');
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b;
}

function jpeg(width: number, height: number): Buffer {
  // SOI, APP0 (len 16), SOF0 (len 17)
  const app0 = Buffer.concat([Buffer.from([0xff, 0xe0, 0x00, 0x10]), Buffer.alloc(14)]);
  const sof = Buffer.alloc(19);
  sof.writeUInt16BE(0xffc0, 0);
  sof.writeUInt16BE(17, 2);
  sof[4] = 8;
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from([0xff, 0xd8]), app0, sof]);
}

describe('P6-10: logo upload checks', () => {
  it('sniffs the real type from the bytes', () => {
    expect(sniffImageType(png(10, 10))).toBe('image/png');
    expect(sniffImageType(jpeg(10, 10))).toBe('image/jpeg');
    expect(sniffImageType(Buffer.from('RIFF\0\0\0\0WEBPVP8X'))).toBe('image/webp');
    expect(
      sniffImageType(
        Buffer.from('<?xml version="1.0"?>\n<svg xmlns="http://www.w3.org/2000/svg"></svg>'),
      ),
    ).toBe('image/svg+xml');
    expect(sniffImageType(Buffer.from('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(sniffImageType(Buffer.from('MZ\x90\x00 not an image'))).toBeNull();
  });

  it('reads PNG and JPEG dimensions', () => {
    expect(imageDimensions(png(1200, 300), 'image/png')).toEqual({ width: 1200, height: 300 });
    expect(imageDimensions(jpeg(640, 480), 'image/jpeg')).toEqual({ width: 640, height: 480 });
  });

  it('refuses SVGs that can run script or load other files', () => {
    const ok =
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><circle r="4" fill="#123"/></svg>';
    expect(unsafeSvgReason(ok)).toBeNull();
    expect(unsafeSvgReason('<svg><script>alert(1)</script></svg>')).toBe('scripts');
    expect(unsafeSvgReason('<svg onload="alert(1)"></svg>')).toBe('event handler attributes');
    expect(unsafeSvgReason('<svg><foreignObject><div/></foreignObject></svg>')).toMatch(
      /foreignObject/,
    );
    expect(unsafeSvgReason('<svg><a href="javascript:alert(1)">x</a></svg>')).toBe('script links');
    expect(unsafeSvgReason('<svg><image href="https://evil.example/x.png"/></svg>')).toBe(
      'links to external files',
    );
    expect(unsafeSvgReason('<!DOCTYPE svg [<!ENTITY x "y">]><svg></svg>')).toBe('XML entities');
    expect(unsafeSvgReason('<svg><style>@import url(https://x/y.css)</style></svg>')).toMatch(
      /external/,
    );
  });
});
