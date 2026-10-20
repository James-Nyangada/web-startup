import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import { requireOrgRole, enforceSiteAccess } from '../middleware/org.js';
import { ErrorCode } from '../shared/errors.js';
import {
  generateEmbedSnippet,
  renderAccessibilityStatementHtml,
  type StatementData,
} from '../statements/render.js';

const statementDataSchema = z.object({
  orgName: z.string().trim().min(1, 'Organisation name is required.').max(200),
  siteName: z.string().trim().min(1, 'Site name is required.').max(200),
  siteUrl: z.string().trim().url('A valid website URL is required.').max(500),
  scope: z.string().trim().max(2000).default(''),
  targetStandard: z.string().trim().min(1).default('WCAG 2.2 Level AA'),
  conformanceStatus: z
    .enum(['fully_conformant', 'partially_conformant', 'non_conformant'])
    .default('partially_conformant'),
  measuresTaken: z.array(z.string().trim()).default([]),
  knownLimitations: z
    .array(
      z.object({
        issueId: z.string().optional(),
        title: z.string().trim().min(1),
        description: z.string().trim().min(1),
        workaround: z.string().trim().optional(),
      }),
    )
    .default([]),
  feedbackContact: z.object({
    email: z.string().trim().email('Valid email is required.'),
    phone: z.string().trim().optional(),
    address: z.string().trim().optional(),
    responseTime: z.string().trim().optional(),
  }),
  enforcementProcedure: z
    .object({
      bodyName: z.string().trim().optional(),
      contactUrl: z.string().trim().optional(),
      description: z.string().trim().optional(),
    })
    .optional(),
  statementDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD.')
    .default(() => new Date().toISOString().split('T')[0]!),
});

const createStatementSchema = z.object({
  data: statementDataSchema,
});

export function orgStatementsRouter(repos: Repositories): Router {
  const router = Router({ mergeParams: true });

  // 1. GET /v1/orgs/:orgId/sites/:siteId/statements - List versions (O A M C)
  router.get(
    '/:siteId/statements',
    requireOrgRole('client_viewer'),
    enforceSiteAccess,
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const siteIdParam = req.params.siteId;
      const siteId = Array.isArray(siteIdParam) ? siteIdParam[0] : siteIdParam;

      if (!siteId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Site ID is required.',
            details: {},
          },
        });
        return;
      }

      const site = await repos.sites.findById(orgId, siteId);
      if (!site) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Site not found.',
            details: {},
          },
        });
        return;
      }

      const list = await repos.statements.listBySite(orgId, siteId);
      res.status(200).json({ data: list });
    },
  );

  // 2. GET /v1/orgs/:orgId/sites/:siteId/statements/latest - Get latest version (O A M C)
  router.get(
    '/:siteId/statements/latest',
    requireOrgRole('client_viewer'),
    enforceSiteAccess,
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const siteIdParam = req.params.siteId;
      const siteId = Array.isArray(siteIdParam) ? siteIdParam[0] : siteIdParam;

      if (!siteId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Site ID is required.',
            details: {},
          },
        });
        return;
      }

      const site = await repos.sites.findById(orgId, siteId);
      if (!site) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Site not found.',
            details: {},
          },
        });
        return;
      }

      const statement = await repos.statements.findLatestBySite(orgId, siteId);
      const embedSnippet = generateEmbedSnippet(site.id, site.name);
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const publicUrl = `${appUrl}/s/${site.id}/accessibility-statement`;

      res.status(200).json({
        data: {
          statement,
          embedSnippet,
          publicUrl,
        },
      });
    },
  );

  // 3. POST /v1/orgs/:orgId/sites/:siteId/statements - Save draft version (O A M)
  router.post(
    '/:siteId/statements',
    requireOrgRole('member'),
    enforceSiteAccess,
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const siteIdParam = req.params.siteId;
      const siteId = Array.isArray(siteIdParam) ? siteIdParam[0] : siteIdParam;

      if (!siteId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Site ID is required.',
            details: {},
          },
        });
        return;
      }

      const site = await repos.sites.findById(orgId, siteId);
      if (!site) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Site not found.',
            details: {},
          },
        });
        return;
      }

      const parse = createStatementSchema.safeParse(req.body);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: parse.error.issues[0]?.message || 'Invalid statement data.',
            details: { issues: parse.error.issues },
          },
        });
        return;
      }

      const nextVersion = await repos.statements.getNextVersion(siteId);

      const statement = await repos.statements.create(orgId, {
        siteId,
        version: nextVersion,
        status: 'draft',
        data: parse.data.data,
        renderedHtml: null,
        publishedAt: null,
        publishedBy: null,
      });

      res.status(201).json({ data: statement });
    },
  );

  return router;
}

export function orgStatementItemRouter(repos: Repositories): Router {
  const router = Router({ mergeParams: true });

  // POST /v1/orgs/:orgId/statements/:id/publish (O A M)
  router.post(
    '/:id/publish',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const orgId = req.orgId!;
      const idParam = req.params.id;
      const statementId = Array.isArray(idParam) ? idParam[0] : idParam;

      if (!statementId) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Statement ID is required.',
            details: {},
          },
        });
        return;
      }

      const statement = await repos.statements.findById(orgId, statementId);
      if (!statement) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Statement not found.',
            details: {},
          },
        });
        return;
      }

      const site = await repos.sites.findById(orgId, statement.siteId);
      if (!site) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Site associated with statement not found.',
            details: {},
          },
        });
        return;
      }

      // Fetch org branding for white-label styling
      const branding = await repos.branding.findByOrgId(orgId);

      const statementData = statement.data as unknown as StatementData;
      const renderedHtml = renderAccessibilityStatementHtml(statementData, {
        displayName: branding?.displayName,
        primaryColor: branding?.primaryColor,
      });

      const updated = await repos.statements.update(orgId, statementId, {
        status: 'published',
        renderedHtml,
        publishedAt: new Date(),
        publishedBy: req.auth!.user.id,
      });

      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      const publicUrl = `${appUrl}/s/${site.id}/accessibility-statement`;
      const embedSnippet = generateEmbedSnippet(site.id, site.name);

      // Record evidence event (§5.4)
      await repos.evidenceEvents.record(orgId, {
        siteId: site.id,
        type: 'statement_published',
        actorId: req.auth!.user.id,
        occurredAt: new Date(),
        data: {
          statementId: statement.id,
          version: statement.version,
          targetStandard: statementData.targetStandard,
          conformanceStatus: statementData.conformanceStatus,
          publicUrl,
        },
      });

      // Write to audit log
      await repos.auditLog.write(orgId, {
        actorId: req.auth?.user.id ?? null,
        actorType: 'user',
        action: 'statement.published',
        targetType: 'statement',
        targetId: statement.id,
        data: {
          siteId: site.id,
          version: statement.version,
        },
      });

      res.status(200).json({
        data: {
          statement: updated,
          publicUrl,
          embedSnippet,
        },
      });
    },
  );

  return router;
}

/**
 * Public router for viewing published accessibility statements: mounted at /v1/public/statements and /public/statements
 */
export function statementsPublicRouter(repos: Repositories): Router {
  const router = Router();

  // GET /v1/public/statements/:siteId
  router.get('/:siteId', async (req: Request, res: Response): Promise<void> => {
    const siteIdParam = req.params.siteId;
    const siteId = Array.isArray(siteIdParam) ? siteIdParam[0] : siteIdParam;

    if (!siteId) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Site ID is required.',
          details: {},
        },
      });
      return;
    }

    const statement = await repos.statements.findPublishedBySite(siteId);
    if (!statement || !statement.renderedHtml) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'No published accessibility statement found for this site.',
          details: {},
        },
      });
      return;
    }

    // If client requested HTML directly
    const acceptHeader = req.headers.accept || '';
    if (acceptHeader.includes('text/html') || req.query.format === 'html') {
      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.status(200).send(statement.renderedHtml);
      return;
    }

    const appUrl = process.env.APP_URL || 'http://localhost:3000';
    const publicUrl = `${appUrl}/s/${siteId}/accessibility-statement`;
    const siteName = (statement.data as unknown as StatementData)?.siteName ?? 'Website';
    const embedSnippet = generateEmbedSnippet(siteId, siteName);

    res.status(200).json({
      data: {
        statement,
        publicUrl,
        embedSnippet,
      },
    });
  });

  return router;
}
