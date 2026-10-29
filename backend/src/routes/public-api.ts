import { Router, type NextFunction, type Request, type Response } from 'express';
import type { Repositories } from '../db/repositories/index.js';
import type { ApiKeyScope } from '../db/schema/index.js';
import { apiKeyAuth, hasApiKey, requireScope } from '../middleware/api-key.js';
import { enforceReadOnlyOrg } from '../middleware/org.js';
import { ErrorCode } from '../shared/errors.js';
import { orgIssuesRouter } from './issues.js';
import { orgScansRouter, type ScansRouterOptions } from './scans.js';
import { orgSitesRouter } from './sites.js';

export interface PublicApiRoute {
  method: 'GET' | 'POST';
  /** OpenAPI-style path, e.g. `/sites/{siteId}`. */
  path: string;
  pattern: RegExp;
  scope: ApiKeyScope;
}

/** Spec 7.11: the only operations an API key can reach. Everything else is 404. */
export const PUBLIC_API_ROUTES: PublicApiRoute[] = [
  { method: 'GET', path: '/sites', pattern: /^\/sites\/?$/, scope: 'read' },
  {
    method: 'POST',
    path: '/sites/connect',
    pattern: /^\/sites\/connect\/?$/,
    scope: 'scan:write',
  },
  {
    method: 'POST',
    path: '/sites/shopify-plan-sync',
    pattern: /^\/sites\/shopify-plan-sync\/?$/,
    scope: 'plugin',
  },
  { method: 'GET', path: '/sites/{siteId}', pattern: /^\/sites\/[^/]+\/?$/, scope: 'read' },
  {
    method: 'GET',
    path: '/sites/{siteId}/issues',
    pattern: /^\/sites\/[^/]+\/issues\/?$/,
    scope: 'read',
  },
  { method: 'GET', path: '/issues/{issueId}', pattern: /^\/issues\/[^/]+\/?$/, scope: 'read' },
  {
    method: 'GET',
    path: '/sites/{siteId}/scans',
    pattern: /^\/sites\/[^/]+\/scans\/?$/,
    scope: 'read',
  },
  { method: 'GET', path: '/scans/{scanId}', pattern: /^\/scans\/[^/]+\/?$/, scope: 'read' },
  {
    method: 'POST',
    path: '/sites/{siteId}/scans',
    pattern: /^\/sites\/[^/]+\/scans\/?$/,
    scope: 'scan:write',
  },
];

export function matchPublicApiRoute(method: string, path: string): PublicApiRoute | null {
  const m = method === 'HEAD' ? 'GET' : method;
  return PUBLIC_API_ROUTES.find((r) => r.method === m && r.pattern.test(path)) ?? null;
}

/**
 * Public REST API (Agency Pro, P6-06), mounted at `/v1`. It only handles requests carrying a
 * `psk_` bearer key; anything else falls through to the session routes. The handlers are the
 * same ones the web app uses, reached through an allow-list and per-route scope checks.
 */
export function publicApiRouter(repos: Repositories, scansOptions?: ScansRouterOptions): Router {
  const router = Router();

  router.use((req: Request, _res: Response, next: NextFunction) =>
    hasApiKey(req) ? next() : next('router'),
  );
  router.use(apiKeyAuth(repos));
  router.use((req: Request, res: Response, next: NextFunction) => {
    const route = matchPublicApiRoute(req.method, req.path);
    if (!route) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: `No public API route for ${req.method} ${req.path}. See /v1/openapi.json.`,
          details: {},
        },
      });
      return;
    }
    requireScope(route.scope)(req, res, next);
  });
  router.use(enforceReadOnlyOrg);

  // Enforce site-scoped keys (Spec 7.11 / P7-01): keys with non-empty siteIds can only access their assigned sites.
  router.use(async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    if (!req.apiKey?.siteIds || req.apiKey.siteIds.length === 0) {
      return next();
    }
    const allowed = new Set(req.apiKey.siteIds);

    // /sites/:siteId...
    const siteMatch = /^\/sites\/([^/]+)/.exec(req.path);
    if (siteMatch) {
      const siteId = siteMatch[1]!;
      if (siteId !== 'connect' && siteId !== 'shopify-plan-sync') {
        if (!allowed.has(siteId)) {
          res.status(404).json({
            error: {
              code: ErrorCode.NOT_FOUND,
              message: 'Site not found.',
              details: {},
            },
          });
          return;
        }
      }
    }

    // /scans/:scanId
    const scanMatch = /^\/scans\/([^/]+)/.exec(req.path);
    if (scanMatch) {
      const scanId = scanMatch[1]!;
      const scan = await repos.scans.findById(req.orgId!, scanId);
      if (!scan || !allowed.has(scan.siteId)) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Scan not found.',
            details: {},
          },
        });
        return;
      }
    }

    // /issues/:issueId
    const issueMatch = /^\/issues\/([^/]+)/.exec(req.path);
    if (issueMatch) {
      const issueId = issueMatch[1]!;
      const issue = await repos.issues.findById(req.orgId!, issueId);
      if (!issue || !allowed.has(issue.siteId)) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Issue not found.',
            details: {},
          },
        });
        return;
      }
    }

    next();
  });

  router.use('/sites', orgSitesRouter(repos));
  router.use(orgScansRouter(repos, scansOptions));
  router.use(orgIssuesRouter(repos, scansOptions));

  return router;
}
