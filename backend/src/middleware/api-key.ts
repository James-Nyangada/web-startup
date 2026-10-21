import type { NextFunction, Request, Response } from 'express';
import type { Repositories } from '../db/repositories/index.js';
import { API_KEY_PREFIX, type PublicApiKey } from '../db/repositories/api-keys.js';
import { asOrgId } from '../db/repositories/org-scope.js';
import { withEffectivePlan } from '../db/repositories/organizations.js';
import type { ApiKeyScope } from '../db/schema/index.js';
import { MemoryRateLimiter } from '../lib/rate-limiter.js';
import { getPlanDefinition } from '../shared/plans.js';
import { ErrorCode } from '../shared/errors.js';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      apiKey?: PublicApiKey;
    }
  }
}

/** Spec 7.11 / 11.1: 60 requests per minute per key. */
export const API_KEY_RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60_000;

export function bearerToken(req: Request): string | null {
  const header = req.get('authorization');
  if (!header) return null;
  const match = /^Bearer\s+(\S+)$/i.exec(header);
  return match?.[1] ?? null;
}

/** True for requests that present a public API key rather than a session cookie. */
export function hasApiKey(req: Request): boolean {
  return bearerToken(req)?.startsWith(API_KEY_PREFIX) ?? false;
}

const unauthorized = (res: Response, message: string) => {
  res.setHeader('WWW-Authenticate', 'Bearer realm="api"');
  res.status(401).json({ error: { code: ErrorCode.API_KEY_INVALID, message, details: {} } });
};

/**
 * Authenticates `Authorization: Bearer psk_…` (P6-06). Sets the same `req.org` / `req.orgId`
 * context the session routes use, with a member-level role, so the existing handlers serve the
 * public API unchanged.
 */
export function apiKeyAuth(repos: Repositories, limiter = new MemoryRateLimiter()) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const secret = bearerToken(req);
    if (!secret?.startsWith(API_KEY_PREFIX)) {
      unauthorized(res, 'Send your API key as "Authorization: Bearer psk_…".');
      return;
    }

    const found = await repos.apiKeys.findActiveBySecret(secret);
    if (!found) {
      unauthorized(res, 'This API key is not valid or has been revoked.');
      return;
    }

    const rateKey = `api-key:${found.key.id}`;
    const limit = limiter.check(rateKey, API_KEY_RATE_LIMIT, RATE_WINDOW_MS);
    res.setHeader('X-RateLimit-Limit', String(API_KEY_RATE_LIMIT));
    if (!limit.allowed) {
      const retryAfter = Math.max(1, Math.ceil(limit.resetInMs / 1000));
      res.setHeader('X-RateLimit-Remaining', '0');
      res.setHeader('Retry-After', String(retryAfter));
      res.status(429).json({
        error: {
          code: ErrorCode.RATE_LIMITED,
          message: `Rate limit of ${API_KEY_RATE_LIMIT} requests per minute exceeded.`,
          details: { retryAfterSeconds: retryAfter },
        },
      });
      return;
    }
    limiter.record(rateKey, RATE_WINDOW_MS);
    res.setHeader('X-RateLimit-Remaining', String(Math.max(0, limit.remaining - 1)));

    const org = withEffectivePlan(found.org);
    // Keys keep working only while the org is on a plan with API access.
    if (!getPlanDefinition(org.plan).features.publicApi) {
      res.status(403).json({
        error: {
          code: ErrorCode.PLAN_LIMIT,
          message: 'The public API is available on the Agency Pro plan.',
          details: { plan: org.plan, upgradeTo: 'agency_pro' },
        },
      });
      return;
    }

    req.apiKey = found.key;
    req.org = org;
    req.orgId = asOrgId(org.id);
    req.membership = {
      id: `api-key-${found.key.id}`,
      orgId: org.id,
      userId: found.key.createdBy ?? 'api-key',
      role: 'member',
      createdAt: found.key.createdAt,
      updatedAt: found.key.createdAt,
    };
    void repos.apiKeys.touchLastUsed(found.key.id).catch(() => undefined);
    next();
  };
}

export function requireScope(scope: ApiKeyScope) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.apiKey?.scopes.includes(scope)) {
      res.status(403).json({
        error: {
          code: ErrorCode.API_KEY_SCOPE,
          message: `This API key does not have the "${scope}" scope.`,
          details: { requiredScope: scope, scopes: req.apiKey?.scopes ?? [] },
        },
      });
      return;
    }
    next();
  };
}
