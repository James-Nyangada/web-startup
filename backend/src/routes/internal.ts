import { Router, type Request, type Response } from 'express';
import type { Repositories } from '../db/repositories/index.js';
import { normalizeDomain } from '../lib/custom-domain.js';

/**
 * Caddy on-demand TLS `ask` endpoint (spec 4, P6-07): 200 only for verified custom portal
 * domains, so certificates are never issued for anything else. Caddy reaches it on the
 * internal network; the public Caddy site must not proxy `/internal/*` (docs/infra/Caddyfile).
 */
export function internalRouter(repos: Repositories): Router {
  const router = Router();

  router.get('/tls-allowed', async (req: Request, res: Response) => {
    const raw = typeof req.query.domain === 'string' ? req.query.domain : '';
    const domain = normalizeDomain(raw);
    const found = domain ? await repos.branding.findVerifiedDomain(domain) : null;
    res.setHeader('Cache-Control', 'no-store');
    res.status(found ? 200 : 404).send(found ? 'ok' : 'unknown domain');
  });

  return router;
}

/**
 * Which org a verified custom domain belongs to, with the branding the portal shell needs
 * before sign-in. Mounted at `/v1/public/portal-domains`.
 */
export function portalDomainsRouter(repos: Repositories): Router {
  const router = Router();

  router.get('/:domain', async (req: Request, res: Response) => {
    const domain = normalizeDomain(String(req.params.domain ?? ''));
    const found = domain ? await repos.branding.findVerifiedDomain(domain) : null;
    if (!found) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: 'Unknown portal domain.', details: {} },
      });
      return;
    }
    const b = found.branding;
    const apiBase = `/v1/orgs/${found.org.id}/branding/logo`;
    res.setHeader('Cache-Control', 'public, max-age=60');
    res.json({
      data: {
        domain,
        org: { slug: found.org.slug, name: found.org.name },
        branding: {
          displayName: b.displayName ?? found.org.name,
          primaryColor: b.primaryColor,
          hideProductBrand: b.hideProductBrand,
          logoLightUrl: b.logoLightKey ? `${apiBase}/light` : null,
          logoDarkUrl: b.logoDarkKey ? `${apiBase}/dark` : null,
        },
      },
    });
  });

  return router;
}

/**
 * Origins Better Auth accepts for sign-in: our own, plus any verified custom portal domain
 * the request comes from (spec 4). Lookups are cached briefly.
 */
export function customDomainTrustedOrigins(repos: Repositories, base: string[]) {
  const cache = new Map<string, { ok: boolean; at: number }>();
  const TTL_MS = 60_000;
  return async (request?: Request | globalThis.Request): Promise<string[]> => {
    const origin =
      request && 'headers' in request && typeof request.headers.get === 'function'
        ? request.headers.get('origin')
        : null;
    if (!origin) return base;
    let host: string;
    try {
      host = new URL(origin).hostname;
    } catch {
      return base;
    }
    const hit = cache.get(host);
    let ok = hit && Date.now() - hit.at < TTL_MS ? hit.ok : undefined;
    if (ok === undefined) {
      ok = Boolean(await repos.branding.findVerifiedDomain(host).catch(() => null));
      cache.set(host, { ok, at: Date.now() });
    }
    return ok ? [...base, origin] : base;
  };
}
