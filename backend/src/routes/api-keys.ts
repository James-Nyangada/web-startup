import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import { API_KEY_SCOPES } from '../db/schema/index.js';
import { AppError } from '../lib/app-error.js';
import { requireOrgRole } from '../middleware/org.js';
import { ErrorCode } from '../shared/errors.js';
import { assertWithinPlan } from '../shared/plans.js';

/** Enough for one key per integration; more usually means keys are not being revoked. */
export const MAX_ACTIVE_API_KEYS = 20;

const createKeySchema = z.object({
  name: z.string().trim().min(1, 'Give the key a name.').max(80),
  scopes: z
    .array(z.enum(API_KEY_SCOPES))
    .min(1)
    .transform((scopes) => {
      // scan:write implies read: a key that can start scans must be able to read their results.
      const set = new Set(scopes);
      set.add('read');
      return [...set];
    }),
  siteIds: z.array(z.string().uuid()).optional(),
});

/** S-47 API keys, mounted at `/v1/orgs/:orgId/api-keys` (owners only, spec 7.8). */
export function orgApiKeysRouter(repos: Repositories): Router {
  const router = Router({ mergeParams: true });
  router.use(requireOrgRole('owner'));

  router.get('/', async (req: Request, res: Response) => {
    const keys = await repos.apiKeys.listByOrg(req.orgId!);
    res.json({ data: { keys } });
  });

  router.post('/', async (req: Request, res: Response) => {
    const body = createKeySchema.parse(req.body);
    const isIntegrationKey = body.scopes.includes('plugin');
    if (!isIntegrationKey) {
      assertWithinPlan(req.org, 'public_api');
    }
    if ((await repos.apiKeys.countActive(req.orgId!)) >= MAX_ACTIVE_API_KEYS) {
      throw new AppError(
        422,
        ErrorCode.PLAN_LIMIT,
        `You can have up to ${MAX_ACTIVE_API_KEYS} active keys. Revoke one you no longer use.`,
      );
    }
    const { key, secret } = await repos.apiKeys.create(req.orgId!, {
      name: body.name,
      scopes: body.scopes,
      siteIds: body.siteIds,
      createdBy: req.auth!.user.id,
    });
    await repos.auditLog.write(req.orgId!, {
      actorId: req.auth!.user.id,
      actorType: 'user',
      action: 'api_key.created',
      targetType: 'api_key',
      targetId: key.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      data: { name: key.name, prefix: key.prefix, scopes: key.scopes },
    });
    res.setHeader('Cache-Control', 'no-store');
    // The secret is returned this once and never again.
    res.status(201).json({ data: { key, secret } });
  });

  router.delete('/:keyId', async (req: Request, res: Response) => {
    const keyId = z.uuid().safeParse(req.params.keyId);
    const revoked = keyId.success ? await repos.apiKeys.revoke(req.orgId!, keyId.data) : null;
    if (!revoked) throw AppError.notFound('API key not found.');
    await repos.auditLog.write(req.orgId!, {
      actorId: req.auth!.user.id,
      actorType: 'user',
      action: 'api_key.revoked',
      targetType: 'api_key',
      targetId: revoked.id,
      ip: req.ip ?? null,
      userAgent: req.get('user-agent') ?? null,
      data: { name: revoked.name, prefix: revoked.prefix },
    });
    res.json({ data: { key: revoked } });
  });

  return router;
}
