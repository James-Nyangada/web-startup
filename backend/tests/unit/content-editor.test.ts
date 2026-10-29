import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { encrypt } from '../../src/lib/encryption.js';
import { generateTotpSecret } from '../../src/lib/totp.js';
import { buildTestApp, mockAuth } from '../helpers/fakes.js';

const SECRET = generateTotpSecret();
const POST_ID = '018f0000-0000-7000-8000-0000000000d1';
const AUTHOR = '018f0000-0000-7000-8000-0000000000b1';
const MEDIA = '018f0000-0000-7000-8000-0000000000e1';

function setup(role: string) {
  const auth = mockAuth('staff-1');
  const built = buildTestApp({ auth });
  vi.mocked(built.repos.staff.getSessionState).mockResolvedValue({
    sessionId: 's', userId: 'staff-1', email: 'staff-1@example.com', isStaff: true,
    totpSecretEncrypted: encrypt(SECRET), totpEnabledAt: new Date(), staffVerifiedAt: new Date(),
    impersonatingOrgId: null, staffMemberId: AUTHOR, role,
  } as never);
  return { ...built, cookie: auth.cookie };
}

const newPost = (over: Record<string, unknown> = {}) => ({
  type: 'blog', title: 'T', slug: 't', bodyMd: 'b', authorStaffId: AUTHOR, ...over,
});

describe('authors list', () => {
  it('is readable by an editor and lists only active staff', async () => {
    const { app, cookie, repos } = setup('editor');
    vi.mocked(repos.staff.listStaffMembers).mockResolvedValue([
      { id: 'a', active: true, displayName: 'Ada', jobTitle: 'Founder', name: 'x', email: 'a@x.test' },
      { id: 'b', active: false, displayName: 'Gone', jobTitle: null, name: 'y', email: 'b@x.test' },
    ] as never);
    const res = await request(app).get('/v1/staff/content/authors').set('Cookie', cookie).expect(200);
    expect(res.body.data).toEqual([{ id: 'a', displayName: 'Ada', jobTitle: 'Founder' }]);
  });

  it('is not open to support staff', async () => {
    const { app, cookie } = setup('support');
    await request(app).get('/v1/staff/content/authors').set('Cookie', cookie).expect(403);
  });
});

describe('slug checks', () => {
  it('reports whether a slug is free, ignoring the post being edited', async () => {
    const { app, cookie, repos } = setup('editor');
    vi.mocked(repos.staff.findContentPostBySlug).mockResolvedValue({ id: POST_ID } as never);
    const taken = await request(app).get('/v1/staff/content/posts/slug-available?type=blog&slug=hello').set('Cookie', cookie).expect(200);
    expect(taken.body.data.available).toBe(false);
    const own = await request(app).get(`/v1/staff/content/posts/slug-available?type=blog&slug=hello&excludeId=${POST_ID}`).set('Cookie', cookie).expect(200);
    expect(own.body.data.available).toBe(true);
  });

  it('refuses to change a post to a slug that another post uses', async () => {
    const { app, cookie, repos } = setup('editor');
    vi.mocked(repos.staff.findContentPostById).mockResolvedValue({ id: POST_ID, type: 'blog' } as never);
    vi.mocked(repos.staff.findContentPostBySlug).mockResolvedValue({ id: 'someone-else' } as never);
    await request(app).patch(`/v1/staff/content/posts/${POST_ID}`).set('Cookie', cookie).send({ slug: 'taken' }).expect(409);
    expect(repos.staff.updateContentPost).not.toHaveBeenCalled();
  });
});

describe('cover image alt text', () => {
  it('rejects a cover with no alt text anywhere, unless the image is decorative', async () => {
    const { app, cookie, repos } = setup('editor');
    vi.mocked(repos.staff.findMediaById).mockResolvedValue({ id: MEDIA, altText: null, isDecorative: false } as never);
    await request(app).post('/v1/staff/content/posts').set('Cookie', cookie).send(newPost({ coverMediaId: MEDIA })).expect(400);

    vi.mocked(repos.staff.findMediaById).mockResolvedValue({ id: MEDIA, altText: null, isDecorative: true } as never);
    vi.mocked(repos.staff.createContentPost).mockResolvedValue({ id: POST_ID } as never);
    await request(app).post('/v1/staff/content/posts').set('Cookie', cookie).send(newPost({ coverMediaId: MEDIA })).expect(201);
  });

  it('accepts the media library alt text or a per-post override', async () => {
    const { app, cookie, repos } = setup('editor');
    vi.mocked(repos.staff.createContentPost).mockResolvedValue({ id: POST_ID } as never);
    vi.mocked(repos.staff.findMediaById).mockResolvedValue({ id: MEDIA, altText: 'A chart', isDecorative: false } as never);
    await request(app).post('/v1/staff/content/posts').set('Cookie', cookie).send(newPost({ coverMediaId: MEDIA })).expect(201);
    vi.mocked(repos.staff.findMediaById).mockResolvedValue({ id: MEDIA, altText: null, isDecorative: false } as never);
    await request(app).post('/v1/staff/content/posts').set('Cookie', cookie).send(newPost({ coverMediaId: MEDIA, coverAlt: 'Override' })).expect(201);
  });
});

describe('scheduling and live edits', () => {
  it('only schedules for a future time', async () => {
    const { app, cookie, repos } = setup('editor');
    await request(app).post(`/v1/staff/content/posts/${POST_ID}/schedule`).set('Cookie', cookie)
      .send({ publishAt: new Date(Date.now() - 60_000).toISOString() }).expect(400);
    vi.mocked(repos.staff.scheduleContentPost).mockResolvedValue({ id: POST_ID, status: 'scheduled' } as never);
    await request(app).post(`/v1/staff/content/posts/${POST_ID}/schedule`).set('Cookie', cookie)
      .send({ publishAt: new Date(Date.now() + 3_600_000).toISOString() }).expect(200);
  });

  it('queues a site rebuild when a live post is edited, but not a draft', async () => {
    const { app, cookie, repos } = setup('editor');
    vi.mocked(repos.staff.listDeploysByStatus).mockResolvedValue([]);
    vi.mocked(repos.staff.createSiteDeploy).mockResolvedValue({ id: 'd1' } as never);
    vi.mocked(repos.staff.updateContentPost).mockResolvedValue({ id: POST_ID, slug: 's', status: 'draft' } as never);
    await request(app).patch(`/v1/staff/content/posts/${POST_ID}`).set('Cookie', cookie).send({ title: 'New' }).expect(200);
    expect(repos.staff.createSiteDeploy).not.toHaveBeenCalled();

    vi.mocked(repos.staff.updateContentPost).mockResolvedValue({ id: POST_ID, slug: 's', status: 'published' } as never);
    await request(app).patch(`/v1/staff/content/posts/${POST_ID}`).set('Cookie', cookie).send({ title: 'Newer' }).expect(200);
    await vi.waitFor(() => expect(repos.staff.createSiteDeploy).toHaveBeenCalledTimes(1));
  });
});

describe('guide review', () => {
  it('lets an admin mark a guide reviewed, recording who', async () => {
    const { app, cookie, repos } = setup('admin');
    vi.mocked(repos.staff.findContentPostById).mockResolvedValue({ id: POST_ID, type: 'guide', slug: 'g' } as never);
    vi.mocked(repos.staff.updateContentPost).mockResolvedValue({ id: POST_ID } as never);
    await request(app).post(`/v1/staff/content/posts/${POST_ID}/review`).set('Cookie', cookie).expect(200);
    expect(repos.staff.updateContentPost).toHaveBeenCalledWith(
      POST_ID, expect.objectContaining({ reviewedBy: 'staff-1', reviewedAt: expect.any(Date) }), 'staff-1',
    );
  });

  it('is refused for editors and for blog posts', async () => {
    const editor = setup('editor');
    await request(editor.app).post(`/v1/staff/content/posts/${POST_ID}/review`).set('Cookie', editor.cookie).expect(403);
    const admin = setup('admin');
    vi.mocked(admin.repos.staff.findContentPostById).mockResolvedValue({ id: POST_ID, type: 'blog' } as never);
    await request(admin.app).post(`/v1/staff/content/posts/${POST_ID}/review`).set('Cookie', admin.cookie).expect(400);
  });
});

describe('draft previews', () => {
  it('expire: a missing token returns 404 and a valid one is private and noindex', async () => {
    const { app, repos } = buildTestApp();
    await request(app).get('/v1/public/content/preview/abc').expect(404);
    vi.mocked(repos.staff.getAnalyticsCache).mockResolvedValue({ postId: POST_ID, type: 'blog', slug: 's' });
    vi.mocked(repos.staff.findContentPostById).mockResolvedValue({ id: POST_ID, type: 'blog', slug: 's', title: 'Draft', bodyMd: 'x', status: 'draft', updatedBy: 'secret-user-id' } as never);
    const res = await request(app).get('/v1/public/content/preview/abc').expect(200);
    expect(res.headers['x-robots-tag']).toContain('noindex');
    expect(res.headers['cache-control']).toContain('no-store');
    expect(res.body.data.status).toBe('draft');
    expect(res.body.data).not.toHaveProperty('updatedBy');
  });
});

describe('public post API', () => {
  it('never exposes internal ids or unpublished posts', async () => {
    const { app, repos } = buildTestApp();
    vi.mocked(repos.staff.findContentPostBySlug).mockResolvedValue({ id: POST_ID, type: 'blog', slug: 's', title: 'T', bodyMd: 'b', status: 'draft' } as never);
    await request(app).get('/v1/public/content/posts/blog/s').expect(404);
    vi.mocked(repos.staff.findContentPostBySlug).mockResolvedValue({
      id: POST_ID, type: 'blog', slug: 's', title: 'T', bodyMd: 'b', status: 'published', updatedBy: 'u1', reviewedBy: 'u2',
      authorStaffId: AUTHOR, author: { name: 'Ada', jobTitle: 'Founder' }, coverUrl: 'https://media.test/a.webp',
    } as never);
    const res = await request(app).get('/v1/public/content/posts/blog/s').expect(200);
    expect(res.body.data).toMatchObject({ slug: 's', authorName: 'Ada', coverUrl: 'https://media.test/a.webp' });
    for (const secret of ['id', 'updatedBy', 'reviewedBy', 'authorStaffId', 'status']) {
      expect(res.body.data).not.toHaveProperty(secret);
    }
  });
});
