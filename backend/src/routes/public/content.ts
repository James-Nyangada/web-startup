import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../../db/repositories/index.js';
import { AppError } from '../../lib/app-error.js';
import type { BannerSurface, ContentPostType } from '../../db/schema/index.js';

interface PostLike {
  id?: string;
  status?: string;
  type: string;
  slug: string;
  title: string;
  excerpt?: string | null;
  bodyMd: string;
  tags?: string[] | null;
  coverUrl?: string | null;
  coverAlt?: string | null;
  publishedAt?: Date | null;
  updatedAt?: Date | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
  ogUrl?: string | null;
  canonicalUrl?: string | null;
  noindex?: boolean | null;
  ruleId?: string | null;
  platform?: string | null;
  sections?: unknown;
  reviewedAt?: Date | null;
  authorName?: string | null;
  authorJobTitle?: string | null;
  author?: { name?: string | null; jobTitle?: string | null } | null;
}

/** Only fields the public site needs; never internal ids such as who last edited it. */
export function toPublicPost(p: PostLike) {
  return {
    type: p.type,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt ?? null,
    bodyMd: p.bodyMd,
    tags: p.tags ?? [],
    coverUrl: p.coverUrl ?? null,
    coverAlt: p.coverAlt ?? null,
    publishedAt: p.publishedAt ?? null,
    updatedAt: p.updatedAt ?? null,
    seoTitle: p.seoTitle ?? null,
    seoDescription: p.seoDescription ?? null,
    ogUrl: p.ogUrl ?? null,
    canonicalUrl: p.canonicalUrl ?? null,
    noindex: Boolean(p.noindex),
    ruleId: p.ruleId ?? null,
    platform: p.platform ?? null,
    sections: p.sections ?? null,
    reviewedAt: p.reviewedAt ?? null,
    authorName: p.authorName ?? p.author?.name ?? null,
    authorJobTitle: p.authorJobTitle ?? p.author?.jobTitle ?? null,
  };
}

/** Preview adds what the staff "Return to editor" link needs; it is only reachable with a private token. */
export function toPreviewPost(p: PostLike) {
  return { ...toPublicPost(p), id: p.id, status: p.status };
}

export function publicContentRouter(repos: Repositories): Router {
  const router = Router();

  const postsQuerySchema = z.object({
    type: z.enum(['blog', 'guide']).default('blog'),
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(50).default(20),
    tag: z.string().trim().optional(),
  });

  router.get('/content/posts', async (req: Request, res: Response) => {
    const q = postsQuerySchema.parse(req.query);
    const offset = (q.page - 1) * q.limit;
    const { items, nextOffset } = await repos.staff.listContentPosts({
      type: q.type,
      status: 'published',
      tag: q.tag,
      limit: q.limit,
      offset,
      order: 'published',
      includeContent: true,
    });
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.json({
      data: items.map(toPublicPost),
      page: q.page,
      hasMore: nextOffset !== null,
    });
  });

  router.get('/content/posts/:type/:slug', async (req: Request, res: Response) => {
    const type = req.params.type as ContentPostType;
    if (type !== 'blog' && type !== 'guide') {
      throw AppError.notFound('Post type not found.');
    }
    const slug = req.params.slug as string;
    const post = await repos.staff.findContentPostBySlug(type, slug);
    if (!post || post.status !== 'published') {
      throw AppError.notFound('Post not found.');
    }
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.json({ data: toPublicPost(post) });
  });

  router.get('/content/pages/:pageKey', async (req: Request, res: Response) => {
    const page = await repos.staff.getPublishedPage(req.params.pageKey as string);
    if (!page) throw AppError.notFound('Page section not found.');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.json({ data: page });
  });

  // Old versions of legal pages stay readable (e.g. /legal/terms/v/2).
  router.get('/content/pages/:pageKey/versions', async (req: Request, res: Response) => {
    const key = req.params.pageKey as string;
    if (!key.startsWith('legal.')) throw AppError.notFound('Page section not found.');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.json({ data: await repos.staff.listPageVersions(key) });
  });

  router.get('/content/pages/:pageKey/versions/:version', async (req: Request, res: Response) => {
    const key = req.params.pageKey as string;
    const version = Number(req.params.version);
    if (!key.startsWith('legal.') || !Number.isInteger(version) || version < 1) {
      throw AppError.notFound('Page version not found.');
    }
    const page = await repos.staff.getPageVersion(key, version);
    if (!page) throw AppError.notFound('Page version not found.');
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.json({ data: page });
  });

  router.get('/content/changelog', async (_req: Request, res: Response) => {
    const items = await repos.staff.listChangelog(true);
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.json({
      data: items.map((e) => ({ id: e.id, date: e.date, title: e.title, type: e.type, bodyMd: e.bodyMd, showInApp: e.showInApp })),
    });
  });

  router.get('/content/redirects', async (_req: Request, res: Response) => {
    const items = await repos.staff.listRedirects();
    res.setHeader('Cache-Control', 'public, max-age=300, s-maxage=300');
    res.json({ data: items.map((r) => ({ fromPath: r.fromPath, toPath: r.toPath, statusCode: r.statusCode })) });
  });

  router.get('/content/preview/:token', async (req: Request, res: Response) => {
    const token = req.params.token as string;
    const cached = await repos.staff.getAnalyticsCache<{ postId: string; type: ContentPostType; slug: string }>(
      `preview:${token}`,
    );
    if (!cached) {
      throw AppError.notFound('Preview link has expired or is invalid.');
    }
    const post = await repos.staff.findContentPostById(cached.postId);
    if (!post) {
      throw AppError.notFound('Draft post not found.');
    }
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ data: toPreviewPost(post) });
  });

  return router;
}

export function publicBannersRouter(repos: Repositories): Router {
  const router = Router();

  router.get('/banners', async (req: Request, res: Response) => {
    const surface = (req.query.surface as BannerSurface) || 'site';
    const banner = await repos.staff.getActiveBanner(surface);
    res.setHeader('Cache-Control', 'public, max-age=60, s-maxage=60');
    res.json({ data: banner });
  });

  return router;
}
