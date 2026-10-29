import request from 'supertest';
import sharp from 'sharp';
import { describe, expect, it, vi } from 'vitest';
import { encrypt } from '../../src/lib/encryption.js';
import { generateTotpSecret } from '../../src/lib/totp.js';
import { AppError } from '../../src/lib/app-error.js';
import { ErrorCode } from '../../src/shared/errors.js';
import { MemoryStorageService } from '../../src/storage/index.js';
import { assertSafeSvg, detectMime, processRasterImage } from '../../src/lib/media-processing.js';
import { buildTestApp, mockAuth } from '../helpers/fakes.js';

const SECRET = generateTotpSecret();

const png = (width: number, height = 100) =>
  sharp({ create: { width, height, channels: 3, background: '#336699' } }).png().toBuffer();

function setup(role = 'editor', storage: unknown = new MemoryStorageService()) {
  const auth = mockAuth('staff-1');
  const built = buildTestApp({ auth, storage: storage as never });
  vi.mocked(built.repos.staff.getSessionState).mockResolvedValue({
    sessionId: 's',
    userId: 'staff-1',
    email: 'staff-1@example.com',
    isStaff: true,
    totpSecretEncrypted: encrypt(SECRET),
    totpEnabledAt: new Date(),
    staffVerifiedAt: new Date(),
    impersonatingOrgId: null,
    staffMemberId: 'sm-1',
    role,
  } as never);
  return { ...built, cookie: auth.cookie };
}

describe('media type detection and validation', () => {
  it('detects types from bytes, not names', async () => {
    expect(detectMime(await png(10))).toBe('image/png');
    expect(detectMime(Buffer.from('%PDF-1.7\n'))).toBe('application/pdf');
    expect(detectMime(Buffer.from('<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg"/>'))).toBe('image/svg+xml');
    expect(detectMime(Buffer.from('<html><body>hi</body></html>'))).toBeNull();
    expect(detectMime(Buffer.from('MZ\x90\x00 executable'))).toBeNull();
  });

  it('accepts a plain SVG and rejects active or external content', () => {
    const ok = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1 1"><rect width="1" height="1"/></svg>';
    expect(assertSafeSvg(Buffer.from(ok))).toBe(ok);
    for (const bad of [
      '<svg><script>alert(1)</script></svg>',
      '<svg onload="alert(1)"></svg>',
      '<svg><a href="javascript:alert(1)"><text>x</text></a></svg>',
      '<svg><foreignObject><div/></foreignObject></svg>',
      '<svg><image href="https://evil.test/x.png"/></svg>',
      '<svg><style>@import url(https://evil.test/a.css);</style></svg>',
      '<!DOCTYPE svg [<!ENTITY x SYSTEM "file:///etc/passwd">]><svg>&x;</svg>',
    ]) {
      expect(() => assertSafeSvg(Buffer.from(bad)), bad).toThrow(AppError);
    }
  });

  it('makes WebP and AVIF copies at 640, 1280 and 1920 for a large image', async () => {
    const out = await processRasterImage(await png(2400, 1200), 'image/png');
    expect(out).toMatchObject({ width: 2400, height: 1200 });
    expect(out.variants.map((v) => `${v.width}.${v.format}`)).toEqual([
      '640.webp', '640.avif', '1280.webp', '1280.avif', '1920.webp', '1920.avif',
    ]);
  });

  it('never enlarges: a small image gets one copy at its own width', async () => {
    const out = await processRasterImage(await png(300, 200), 'image/png');
    expect(out.variants.map((v) => `${v.width}.${v.format}`)).toEqual(['300.webp', '300.avif']);
  });

  it('rejects bytes that are not a readable image', async () => {
    await expect(processRasterImage(Buffer.from('not an image'), 'image/png')).rejects.toThrow(AppError);
  });
});

describe('POST /v1/staff/media', () => {
  it('stores the original and every variant, and saves one row', async () => {
    const storage = new MemoryStorageService();
    const { app, cookie, repos } = setup('editor', storage);
    const res = await request(app)
      .post('/v1/staff/media')
      .set('Cookie', cookie)
      .field('altText', 'A blue banner')
      .attach('file', await png(1500, 600), { filename: 'banner.png', contentType: 'image/png' })
      .expect(201);
    const row = vi.mocked(repos.staff.createMedia).mock.calls[0]![0] as unknown as { key: string; variants: { items: { key: string }[] } };
    expect(row).toMatchObject({ mime: 'image/png', width: 1500, height: 600, altText: 'A blue banner' });
    expect(row.variants.items).toHaveLength(4); // 640 and 1280, each webp + avif
    expect(storage.hasPublicFile(row.key)).toBe(true);
    for (const v of row.variants.items) expect(storage.hasPublicFile(v.key)).toBe(true);
    expect(res.body.data.id).toBe('media-1');
  });

  it('requires alt text for images unless marked decorative', async () => {
    const { app, cookie } = setup();
    const file = await png(100);
    await request(app).post('/v1/staff/media').set('Cookie', cookie)
      .attach('file', file, { filename: 'a.png' }).expect(400);
    await request(app).post('/v1/staff/media').set('Cookie', cookie)
      .field('isDecorative', 'true').attach('file', file, { filename: 'a.png' }).expect(201);
  });

  it('accepts a PDF without alt text', async () => {
    const { app, cookie } = setup();
    await request(app).post('/v1/staff/media').set('Cookie', cookie)
      .attach('file', Buffer.from('%PDF-1.7\n%%EOF'), { filename: 'guide.pdf' }).expect(201);
  });

  it('rejects files whose content is not an allowed type, whatever the name says', async () => {
    const { app, cookie } = setup();
    const res = await request(app).post('/v1/staff/media').set('Cookie', cookie)
      .field('altText', 'x')
      .attach('file', Buffer.from('<html><script>alert(1)</script></html>'), { filename: 'pic.png', contentType: 'image/png' })
      .expect(400);
    expect(res.body.error.message).toMatch(/unsupported/i);
  });

  it('rejects an SVG with script and stores nothing', async () => {
    const storage = new MemoryStorageService();
    const { app, cookie, repos } = setup('editor', storage);
    await request(app).post('/v1/staff/media').set('Cookie', cookie).field('altText', 'x')
      .attach('file', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>1</script></svg>'), { filename: 'x.svg' })
      .expect(400);
    expect(repos.staff.createMedia).not.toHaveBeenCalled();
  });

  it('removes stored files if saving the row fails', async () => {
    const storage = new MemoryStorageService();
    const { app, cookie, repos } = setup('editor', storage);
    vi.mocked(repos.staff.createMedia).mockRejectedValue(new Error('db down'));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    await request(app).post('/v1/staff/media').set('Cookie', cookie).field('altText', 'x')
      .attach('file', await png(700), { filename: 'a.png' }).expect(500);
    expect(storage.hasPublicFile(`media/`)).toBe(false);
    expect(storage.listPublicKeys('media/')).toEqual([]);
  });

  it('refuses roles without content permission', async () => {
    const { app, cookie } = setup('support');
    await request(app).post('/v1/staff/media').set('Cookie', cookie).field('altText', 'x')
      .attach('file', await png(100), { filename: 'a.png' }).expect(403);
  });

  it('reports when the server has no public file storage', async () => {
    const plain = new MemoryStorageService();
    const { app, cookie } = setup('editor', Object.assign(Object.create(plain), { publicFiles: false }));
    const res = await request(app).post('/v1/staff/media').set('Cookie', cookie).field('altText', 'x')
      .attach('file', await png(100), { filename: 'a.png' }).expect(503);
    expect(res.body.error.message).toMatch(/R2_PUBLIC_URL|Cloudinary/);
  });
});

describe('DELETE /v1/staff/media/:id', () => {
  it('is blocked with 409 while the file is in use, and keeps the stored files', async () => {
    const storage = new MemoryStorageService();
    await storage.putPublicFile('media/a/original.png', Buffer.from('x'), 'image/png');
    const { app, cookie, repos } = setup('editor', storage);
    const id = '018f0000-0000-7000-8000-0000000000c1';
    vi.mocked(repos.staff.findMediaById).mockResolvedValue({ id, key: 'media/a/original.png', mime: 'image/png', variants: {} } as never);
    vi.mocked(repos.staff.deleteMedia).mockRejectedValue(
      new AppError(409, ErrorCode.CONFLICT, 'Cannot delete media: it is currently used in 1 places.'),
    );
    await request(app).delete(`/v1/staff/media/${id}`).set('Cookie', cookie).expect(409);
    expect(storage.hasPublicFile('media/a/original.png')).toBe(true);
  });

  it('deletes the row and every stored file when unused', async () => {
    const storage = new MemoryStorageService();
    await storage.putPublicFile('media/a/original.png', Buffer.from('x'), 'image/png');
    await storage.putPublicFile('media/a/640.webp', Buffer.from('x'), 'image/webp');
    const { app, cookie, repos } = setup('editor', storage);
    const id = '018f0000-0000-7000-8000-0000000000c1';
    vi.mocked(repos.staff.findMediaById).mockResolvedValue({
      id, key: 'media/a/original.png', mime: 'image/png',
      variants: { items: [{ key: 'media/a/640.webp', format: 'webp' }] },
    } as never);
    await request(app).delete(`/v1/staff/media/${id}`).set('Cookie', cookie).expect(200);
    expect(storage.hasPublicFile('media/a/original.png')).toBe(false);
    expect(storage.hasPublicFile('media/a/640.webp')).toBe(false);
  });
});
