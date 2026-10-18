import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import { requireOrgRole } from '../middleware/org.js';
import { ErrorCode } from '../shared/errors.js';
import type { IssueListFilters } from '../db/repositories/issues.js';
import type { Impact, IssueStatus } from '../db/schema/index.js';

const parseMulti = (val: unknown): string[] => {
  if (!val) return [];
  if (Array.isArray(val)) return val.flatMap((v) => String(v).split(',')).map((s) => s.trim()).filter(Boolean);
  if (typeof val === 'string') return val.split(',').map((s) => s.trim()).filter(Boolean);
  return [];
};

const issuesQuerySchema = z.object({
  status: z.union([z.string(), z.array(z.string())]).optional(),
  impact: z.union([z.string(), z.array(z.string())]).optional(),
  wcag: z.string().trim().optional(),
  template: z.string().trim().optional(),
  rule: z.string().trim().optional(),
  assignee: z.string().trim().optional(),
  isRegression: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  needsReview: z
    .enum(['true', 'false'])
    .optional()
    .transform((v) => (v === undefined ? undefined : v === 'true')),
  q: z.string().trim().optional(),
  group: z.enum(['rule', 'template', 'none']).default('rule'),
  sort: z.enum(['impact', 'occurrences', 'firstSeen', 'lastSeen']).default('impact'),
  order: z.enum(['asc', 'desc']).default('desc'),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  page: z.coerce.number().int().min(1).default(1),
});

export function orgIssuesRouter(repos: Repositories): Router {
  const router = Router();

  // GET /v1/orgs/:orgId/sites/:siteId/issues (S-25 Issues list, Section 7.5)
  router.get(
    '/sites/:siteId/issues',
    requireOrgRole('member'),
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

      const queryParse = issuesQuerySchema.safeParse(req.query);
      if (!queryParse.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Invalid query parameters.',
            details: { issues: queryParse.error.issues },
          },
        });
        return;
      }

      const {
        status: statusRaw,
        impact: impactRaw,
        wcag,
        template,
        rule,
        assignee,
        isRegression,
        needsReview,
        q,
        group,
        sort,
        order,
        limit,
        page,
      } = queryParse.data;

      const statuses = parseMulti(statusRaw) as IssueStatus[];
      const impacts = parseMulti(impactRaw) as Impact[];

      const filters: IssueListFilters = {
        status: statuses.length > 0 ? statuses : undefined,
        impact: impacts.length > 0 ? impacts : undefined,
        wcag,
        templateKey: template,
        ruleId: rule,
        assigneeId: assignee,
        isRegression,
        needsReview,
        search: q,
      };

      const offset = (page - 1) * limit;

      const [items, total, severityCounts, templates] = await Promise.all([
        repos.issues.listBySite(req.orgId!, siteId, filters, {
          limit,
          offset,
          sort,
          order,
        }),
        repos.issues.countBySite(req.orgId!, siteId, filters),
        repos.issues.getSeverityCounts(req.orgId!, siteId),
        repos.issues.listTemplatesBySite(req.orgId!, siteId),
      ]);

      const totalPages = Math.ceil(total / limit) || 1;

      // Grouping
      let groups: Array<{
        key: string;
        title: string;
        ruleId?: string;
        templateKey?: string;
        impact: Impact;
        totalOccurrences: number;
        issueCount: number;
        items: typeof items;
      }> = [];

      if (group === 'rule') {
        const byRule = new Map<string, typeof items>();
        for (const item of items) {
          const list = byRule.get(item.ruleId) ?? [];
          list.push(item);
          byRule.set(item.ruleId, list);
        }
        groups = Array.from(byRule.entries()).map(([ruleId, ruleItems]) => {
          const first = ruleItems[0];
          return {
            key: ruleId,
            ruleId,
            title: first?.title ?? ruleId,
            impact: first?.impact ?? 'minor',
            totalOccurrences: ruleItems.reduce((acc, i) => acc + i.occurrenceCount, 0),
            issueCount: ruleItems.length,
            items: ruleItems,
          };
        });
      } else if (group === 'template') {
        const byTemplate = new Map<string, typeof items>();
        for (const item of items) {
          const list = byTemplate.get(item.templateKey) ?? [];
          list.push(item);
          byTemplate.set(item.templateKey, list);
        }
        groups = Array.from(byTemplate.entries()).map(([templateKey, tItems]) => {
          const first = tItems[0];
          return {
            key: templateKey,
            templateKey,
            title: templateKey,
            impact: first?.impact ?? 'minor',
            totalOccurrences: tItems.reduce((acc, i) => acc + i.occurrenceCount, 0),
            issueCount: tItems.length,
            items: tItems,
          };
        });
      }

      res.status(200).json({
        data: {
          items,
          groups,
          total,
          page,
          limit,
          totalPages,
          facets: {
            severityCounts,
            templates,
          },
        },
      });
    },
  );

  // GET /v1/orgs/:orgId/issues - Cross-site issues (agency / my-tasks)
  router.get(
    '/issues',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const assigneeParam = req.query.assignee;
      const assignee = assigneeParam === 'me' ? req.auth!.user.id : (assigneeParam as string | undefined);
      const siteId = req.query.siteId as string | undefined;
      const limit = Math.min(200, Math.max(1, Number(req.query.limit || 50)));
      const page = Math.max(1, Number(req.query.page || 1));
      const offset = (page - 1) * limit;

      const items = await repos.issues.listCrossSite(
        req.orgId!,
        { assigneeId: assignee, siteId },
        { limit, offset },
      );

      res.status(200).json({
        data: {
          items,
          page,
          limit,
        },
      });
    },
  );

  // GET /v1/orgs/:orgId/issues/:issueId - Issue detail (S-26)
  const getIssueDetailHandler = async (req: Request, res: Response): Promise<void> => {
    const issueIdParam = req.params.issueId;
    const issueId = Array.isArray(issueIdParam) ? issueIdParam[0] : issueIdParam;

    if (!issueId) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Issue ID is required.',
          details: {},
        },
      });
      return;
    }

    const issue = await repos.issues.findById(req.orgId!, issueId);
    if (!issue) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Issue not found.',
          details: {},
        },
      });
      return;
    }

    // Check siteId matches if provided in route
    const siteIdParam = req.params.siteId;
    const siteId = Array.isArray(siteIdParam) ? siteIdParam[0] : siteIdParam;
    if (siteId && issue.siteId !== siteId) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Issue not found for this site.',
          details: {},
        },
      });
      return;
    }

    res.status(200).json({
      data: { issue },
    });
  };

  router.get('/issues/:issueId', requireOrgRole('member'), getIssueDetailHandler);
  router.get('/sites/:siteId/issues/:issueId', requireOrgRole('member'), getIssueDetailHandler);

  // GET /v1/orgs/:orgId/issues/:issueId/occurrences - Paginated occurrences
  const getOccurrencesHandler = async (req: Request, res: Response): Promise<void> => {
    const issueIdParam = req.params.issueId;
    const issueId = Array.isArray(issueIdParam) ? issueIdParam[0] : issueIdParam;

    if (!issueId) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Issue ID is required.',
          details: {},
        },
      });
      return;
    }

    const issue = await repos.issues.findById(req.orgId!, issueId);
    if (!issue) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Issue not found.',
          details: {},
        },
      });
      return;
    }

    const limit = Math.min(100, Math.max(1, Number(req.query.limit || 20)));
    const page = Math.max(1, Number(req.query.page || 1));
    const offset = (page - 1) * limit;

    const [items, total] = await Promise.all([
      repos.issues.listOccurrences(req.orgId!, issueId, { limit, offset }),
      repos.issues.countOccurrences(req.orgId!, issueId),
    ]);

    const totalPages = Math.ceil(total / limit) || 1;

    res.status(200).json({
      data: {
        items,
        total,
        page,
        limit,
        totalPages,
      },
    });
  };

  router.get('/issues/:issueId/occurrences', requireOrgRole('member'), getOccurrencesHandler);
  router.get('/sites/:siteId/issues/:issueId/occurrences', requireOrgRole('member'), getOccurrencesHandler);

  // GET /v1/orgs/:orgId/issues/:issueId/events - Timeline from issue_events
  const getEventsHandler = async (req: Request, res: Response): Promise<void> => {
    const issueIdParam = req.params.issueId;
    const issueId = Array.isArray(issueIdParam) ? issueIdParam[0] : issueIdParam;

    if (!issueId) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Issue ID is required.',
          details: {},
        },
      });
      return;
    }

    const issue = await repos.issues.findById(req.orgId!, issueId);
    if (!issue) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Issue not found.',
          details: {},
        },
      });
      return;
    }

    const items = await repos.issues.listEvents(req.orgId!, issueId);

    res.status(200).json({
      data: { items },
    });
  };

  router.get('/issues/:issueId/events', requireOrgRole('member'), getEventsHandler);
  router.get('/sites/:siteId/issues/:issueId/events', requireOrgRole('member'), getEventsHandler);

  // GET & POST /v1/orgs/:orgId/issues/:issueId/notes - Notes
  const getNotesHandler = async (req: Request, res: Response): Promise<void> => {
    const issueIdParam = req.params.issueId;
    const issueId = Array.isArray(issueIdParam) ? issueIdParam[0] : issueIdParam;

    if (!issueId) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Issue ID is required.',
          details: {},
        },
      });
      return;
    }

    const issue = await repos.issues.findById(req.orgId!, issueId);
    if (!issue) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Issue not found.',
          details: {},
        },
      });
      return;
    }

    const items = await repos.issues.listNotes(req.orgId!, issueId);

    res.status(200).json({
      data: { items },
    });
  };

  const createNoteSchema = z.object({
    body: z.string().trim().min(1, 'Note content is required.').max(10000),
    visibleToClient: z.boolean().optional().default(false),
  });

  const createNoteHandler = async (req: Request, res: Response): Promise<void> => {
    const issueIdParam = req.params.issueId;
    const issueId = Array.isArray(issueIdParam) ? issueIdParam[0] : issueIdParam;

    if (!issueId) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Issue ID is required.',
          details: {},
        },
      });
      return;
    }

    const issue = await repos.issues.findById(req.orgId!, issueId);
    if (!issue) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Issue not found.',
          details: {},
        },
      });
      return;
    }

    const parseResult = createNoteSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: parseResult.error.issues[0]?.message ?? 'Invalid note data.',
          details: { issues: parseResult.error.issues },
        },
      });
      return;
    }

    const authorId = req.auth?.user?.id;
    if (!authorId) {
      res.status(401).json({
        error: {
          code: ErrorCode.UNAUTHENTICATED,
          message: 'User authentication required.',
          details: {},
        },
      });
      return;
    }

    const note = await repos.issues.addNote(
      req.orgId!,
      issueId,
      authorId,
      parseResult.data.body,
      parseResult.data.visibleToClient,
    );

    res.status(201).json({
      data: { note },
    });
  };

  router.get('/issues/:issueId/notes', requireOrgRole('member'), getNotesHandler);
  router.get('/sites/:siteId/issues/:issueId/notes', requireOrgRole('member'), getNotesHandler);
  router.post('/issues/:issueId/notes', requireOrgRole('member'), createNoteHandler);
  router.post('/sites/:siteId/issues/:issueId/notes', requireOrgRole('member'), createNoteHandler);

  return router;
}
