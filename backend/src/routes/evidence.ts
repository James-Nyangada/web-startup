import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import { EVIDENCE_EVENT_TYPES } from '../db/schema/index.js';
import { requireOrgRole, enforceSiteAccess } from '../middleware/org.js';
import { ErrorCode } from '../shared/errors.js';

const getEvidenceQuerySchema = z.object({
  type: z.enum(EVIDENCE_EVENT_TYPES).optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export function orgEvidenceRouter(repos: Repositories): Router {
  const router = Router({ mergeParams: true });

  // GET /v1/orgs/:orgId/sites/:siteId/evidence (O A M C)
  router.get(
    '/:siteId/evidence',
    requireOrgRole('client_viewer'),
    enforceSiteAccess,
    async (req: Request, res: Response): Promise<void> => {
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

      const site = await repos.sites.findById(req.orgId!, siteId);
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

      const parse = getEvidenceQuerySchema.safeParse(req.query);
      if (!parse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid query parameters.',
            details: { issues: parse.error.issues },
          },
        });
        return;
      }

      const { type, from, to, limit, offset } = parse.data;

      let fromDate: Date | undefined;
      let toDate: Date | undefined;
      if (from) {
        const parsedFrom = new Date(from);
        if (!isNaN(parsedFrom.getTime())) fromDate = parsedFrom;
      }
      if (to) {
        const parsedTo = new Date(to);
        if (!isNaN(parsedTo.getTime())) toDate = parsedTo;
      }

      const events = await repos.evidenceEvents.list(req.orgId!, siteId, {
        type,
        from: fromDate,
        to: toDate,
        limit,
        offset,
      });

      const total = await repos.evidenceEvents.count(req.orgId!, siteId, {
        type,
        from: fromDate,
        to: toDate,
      });

      res.status(200).json({
        data: {
          events,
          total,
          limit,
          offset,
          hasMore: offset + events.length < total,
        },
      });
    },
  );

  return router;
}
