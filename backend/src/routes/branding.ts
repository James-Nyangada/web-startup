import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import type { StorageService } from '../storage/index.js';
import { requireOrgRole } from '../middleware/org.js';
import { getPlanDefinition } from '../shared/plans.js';
import { ErrorCode } from '../shared/errors.js';
import { getContrastAgainstWhite, findAccessibleAlternative } from '../shared/contrast.js';

const updateBrandingSchema = z.object({
  displayName: z.string().max(100).nullable().optional(),
  primaryColor: z
    .string()
    .regex(/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/, 'Must be a valid hex color code (e.g. #0F3D3E)')
    .nullable()
    .optional(),
  emailSenderName: z.string().max(100).nullable().optional(),
  reportFooter: z.string().max(500).nullable().optional(),
  hideProductBrand: z.boolean().optional(),
});

const uploadLogoSchema = z.object({
  type: z.enum(['light', 'dark']),
  dataUrl: z.string().min(1),
});

export function orgBrandingRouter(repos: Repositories, storage: StorageService): Router {
  const router = Router({ mergeParams: true });

  // GET /v1/orgs/:orgId/branding - Retrieve organisation branding
  router.get('/', async (req: Request, res: Response): Promise<void> => {
    const orgId = req.orgId!;
    const branding = await repos.branding.findByOrgId(orgId);

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const logoLightUrl = branding?.logoLightKey
      ? `${appUrl}/v1/orgs/${orgId}/branding/logo/light`
      : null;
    const logoDarkUrl = branding?.logoDarkKey
      ? `${appUrl}/v1/orgs/${orgId}/branding/logo/dark`
      : null;

    res.status(200).json({
      data: {
        branding: branding
          ? {
              displayName: branding.displayName,
              logoLightKey: branding.logoLightKey,
              logoDarkKey: branding.logoDarkKey,
              logoLightUrl,
              logoDarkUrl,
              primaryColor: branding.primaryColor,
              emailSenderName: branding.emailSenderName,
              reportFooter: branding.reportFooter,
              hideProductBrand: branding.hideProductBrand,
              customDomain: branding.customDomain,
              customDomainVerifiedAt: branding.customDomainVerifiedAt,
            }
          : null,
      },
    });
  });

  // POST /v1/orgs/:orgId/branding/check-contrast - Preview contrast ratio and accessible alternative
  router.post('/check-contrast', (req: Request, res: Response): void => {
    const body = req.body as { color?: unknown } | undefined;
    const color = typeof body?.color === 'string' ? body.color : null;
    if (!color) {
      res.status(400).json({
        error: { code: 'INVALID_INPUT', message: 'Colour string is required' },
      });
      return;
    }

    const { contrast, valid } = getContrastAgainstWhite(color);
    const suggestedAlternative = valid ? color : findAccessibleAlternative(color, 4.5);

    res.status(200).json({
      data: {
        color,
        contrastRatio: contrast,
        valid,
        suggestedAlternative,
      },
    });
  });

  // GET /v1/orgs/:orgId/branding/logo/:type - Serve brand logo
  router.get('/logo/:type', async (req: Request, res: Response): Promise<void> => {
    const orgId = req.orgId!;
    const type = req.params.type as 'light' | 'dark';

    const branding = await repos.branding.findByOrgId(orgId);
    const key = type === 'dark' ? branding?.logoDarkKey : branding?.logoLightKey;

    if (!key) {
      res.status(404).json({
        error: { code: 'NOT_FOUND', message: `No ${type} logo uploaded for this organization` },
      });
      return;
    }

    try {
      const body = await storage.getObject(key);
      if (!body) {
        res
          .status(404)
          .json({ error: { code: 'NOT_FOUND', message: 'Logo file not found in storage' } });
        return;
      }

      const isSvg = key.endsWith('.svg');
      const isJpeg = key.endsWith('.jpg') || key.endsWith('.jpeg');
      const isWebp = key.endsWith('.webp');
      const contentType = isSvg
        ? 'image/svg+xml'
        : isJpeg
          ? 'image/jpeg'
          : isWebp
            ? 'image/webp'
            : 'image/png';

      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
      res.status(200).send(body);
    } catch {
      res
        .status(500)
        .json({ error: { code: 'STORAGE_ERROR', message: 'Failed to retrieve logo' } });
    }
  });

  // All mutating endpoints require Admin or Owner
  router.use(requireOrgRole('admin'));

  // PATCH /v1/orgs/:orgId/branding - Update branding settings (Spec P4-07)
  router.patch('/', async (req: Request, res: Response): Promise<void> => {
    const orgId = req.orgId!;
    const org = await repos.organizations.findById(orgId);

    if (!org) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Organisation not found' } });
      return;
    }

    // 1. Plan feature check: white-label branding requires Agency or Agency Pro
    const plan = org.plan ?? 'trial';
    const planDef = getPlanDefinition(plan);
    if (!planDef.features.whiteLabel) {
      res.status(422).json({
        error: {
          code: ErrorCode.PLAN_LIMIT,
          message: 'White-label branding requires an Agency or Agency Pro plan.',
          details: { limit: 'whiteLabel', current: plan, upgradeTo: 'agency' },
        },
      });
      return;
    }

    // 2. Validate request body
    const parseRes = updateBrandingSchema.safeParse(req.body);
    if (!parseRes.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseRes.error.issues[0]?.message || 'Invalid branding input',
          details: parseRes.error.format(),
        },
      });
      return;
    }

    const { displayName, primaryColor, emailSenderName, reportFooter, hideProductBrand } =
      parseRes.data;

    // 3. Acceptance criterion: Colours failing 4.5:1 on white cannot be saved for buttons/links
    if (primaryColor) {
      const { contrast, valid } = getContrastAgainstWhite(primaryColor);
      if (!valid) {
        const suggested = findAccessibleAlternative(primaryColor, 4.5);
        res.status(400).json({
          error: {
            code: 'INVALID_CONTRAST',
            message: 'Primary colour fails the 4.5:1 WCAG contrast requirement on white.',
            details: {
              contrastRatio: contrast,
              requiredRatio: 4.5,
              suggestedAlternative: suggested,
            },
          },
        });
        return;
      }
    }

    // 4. Upsert branding record
    const updated = await repos.branding.upsert(orgId, {
      ...(displayName !== undefined ? { displayName } : {}),
      ...(primaryColor !== undefined ? { primaryColor } : {}),
      ...(emailSenderName !== undefined ? { emailSenderName } : {}),
      ...(reportFooter !== undefined ? { reportFooter } : {}),
      ...(hideProductBrand !== undefined ? { hideProductBrand } : {}),
    });

    // 5. Audit log
    await repos.auditLog.write(orgId, {
      actorId: req.auth?.user.id ?? null,
      actorType: 'user',
      action: 'branding.updated',
      targetType: 'branding',
      targetId: updated.id,
      data: parseRes.data,
    });

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    res.status(200).json({
      data: {
        branding: {
          displayName: updated.displayName,
          logoLightKey: updated.logoLightKey,
          logoDarkKey: updated.logoDarkKey,
          logoLightUrl: updated.logoLightKey
            ? `${appUrl}/v1/orgs/${orgId}/branding/logo/light`
            : null,
          logoDarkUrl: updated.logoDarkKey ? `${appUrl}/v1/orgs/${orgId}/branding/logo/dark` : null,
          primaryColor: updated.primaryColor,
          emailSenderName: updated.emailSenderName,
          reportFooter: updated.reportFooter,
          hideProductBrand: updated.hideProductBrand,
          customDomain: updated.customDomain,
          customDomainVerifiedAt: updated.customDomainVerifiedAt,
        },
      },
    });
  });

  // POST /v1/orgs/:orgId/branding/logo - Upload light or dark brand logo
  router.post('/logo', async (req: Request, res: Response): Promise<void> => {
    const orgId = req.orgId!;
    const org = await repos.organizations.findById(orgId);

    if (!org) {
      res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Organisation not found' } });
      return;
    }

    const plan = org.plan ?? 'trial';
    const planDef = getPlanDefinition(plan);
    if (!planDef.features.whiteLabel) {
      res.status(422).json({
        error: {
          code: ErrorCode.PLAN_LIMIT,
          message: 'White-label branding requires an Agency or Agency Pro plan.',
          details: { limit: 'whiteLabel', current: plan, upgradeTo: 'agency' },
        },
      });
      return;
    }

    const parseRes = uploadLogoSchema.safeParse(req.body);
    if (!parseRes.success) {
      res.status(400).json({
        error: {
          code: 'VALIDATION_ERROR',
          message: parseRes.error.issues[0]?.message || 'Invalid logo upload',
        },
      });
      return;
    }

    const { type, dataUrl } = parseRes.data;

    // Parse Data URL: data:image/png;base64,iVBORw0KGgo...
    const matches = dataUrl.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/);
    if (!matches || !matches[1] || !matches[2]) {
      res.status(400).json({
        error: {
          code: 'INVALID_FORMAT',
          message: 'Expected a base64 data URL (e.g. data:image/png;base64,...)',
        },
      });
      return;
    }

    const contentType = matches[1];
    const base64Data = matches[2];

    const allowedTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];
    if (!allowedTypes.includes(contentType)) {
      res.status(400).json({
        error: {
          code: 'INVALID_TYPE',
          message: 'Only PNG, JPEG, WebP, and SVG images are supported.',
        },
      });
      return;
    }

    const buffer = Buffer.from(base64Data, 'base64');
    if (buffer.length > 2 * 1024 * 1024) {
      res.status(400).json({
        error: { code: 'FILE_TOO_LARGE', message: 'Logo file size exceeds the 2 MB limit.' },
      });
      return;
    }

    const ext = contentType === 'image/svg+xml' ? 'svg' : contentType.split('/')[1] || 'png';
    const key = `branding/${orgId}/logo-${type}-${Date.now()}.${ext}`;

    await storage.putObject(key, buffer, contentType);

    const updateData = type === 'light' ? { logoLightKey: key } : { logoDarkKey: key };
    await repos.branding.upsert(orgId, updateData);

    await repos.auditLog.write(orgId, {
      actorId: req.auth?.user.id ?? null,
      actorType: 'user',
      action: `branding.logo_${type}_uploaded`,
      targetType: 'branding',
      data: { key, contentType, size: buffer.length },
    });

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    res.status(200).json({
      data: {
        type,
        logoKey: key,
        logoUrl: `${appUrl}/v1/orgs/${orgId}/branding/logo/${type}`,
      },
    });
  });

  // DELETE /v1/orgs/:orgId/branding/logo/:type - Remove light or dark logo
  router.delete('/logo/:type', async (req: Request, res: Response): Promise<void> => {
    const orgId = req.orgId!;
    const type = req.params.type as 'light' | 'dark';

    const branding = await repos.branding.findByOrgId(orgId);
    const key = type === 'dark' ? branding?.logoDarkKey : branding?.logoLightKey;
    if (key) {
      await storage.deleteObject(key).catch(() => {});
    }

    const updateData = type === 'light' ? { logoLightKey: null } : { logoDarkKey: null };
    await repos.branding.upsert(orgId, updateData);

    await repos.auditLog.write(orgId, {
      actorId: req.auth?.user.id ?? null,
      actorType: 'user',
      action: `branding.logo_${type}_removed`,
      targetType: 'branding',
    });

    res.status(200).json({
      data: { success: true },
    });
  });

  return router;
}
