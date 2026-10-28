import { Router, type Request, type Response } from 'express';
import type { PgBoss } from 'pg-boss';
import { z } from 'zod';
import type { Repositories } from '../db/repositories/index.js';
import { requireOrgRole } from '../middleware/org.js';
import { ErrorCode } from '../shared/errors.js';
import { csvField } from '../lib/csv.js';
import type { BulkAction, IssueListFilters } from '../db/repositories/issues.js';
import type { Impact, IssueStatus, IgnoredReason } from '../db/schema/index.js';
import { enqueueIssueRecheck } from '../worker/boss.js';
import { AiService, AiServiceError } from '../ai/service.js';
import { aiCacheScope, computeCacheKey, scrubHtmlSnippet } from '../ai/scrubber.js';
import type { Framework } from '../scanner/platform/framework.js';
import { isCustomPlatform, probeFramework } from '../scanner/platform/probe-framework.js';

const parseMulti = (val: unknown): string[] => {
  if (!val) return [];
  if (Array.isArray(val))
    return val
      .flatMap((v) => String(v).split(','))
      .map((s) => s.trim())
      .filter(Boolean);
  if (typeof val === 'string')
    return val
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  return [];
};

export interface IssuesRouterOptions {
  boss?: PgBoss;
  enqueueRecheck?: (issueId: string) => Promise<void>;
  aiService?: AiService;
}

const aiRequestBodySchema = z
  .object({ platform: z.string().optional(), cacheKey: z.string().optional() })
  .catch({});

function requestedPlatform(req: Request): string {
  const body = aiRequestBodySchema.parse(req.body);
  const query = typeof req.query.platform === 'string' ? req.query.platform : '';
  return (body.platform || query).toLowerCase();
}

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

export function orgIssuesRouter(repos: Repositories, options?: IssuesRouterOptions): Router {
  const router = Router();

  // GET /v1/orgs/:orgId/sites/:siteId/issues (S-25 Issues list, Section 7.5)
  router.get(
    '/sites/:siteId/issues',
    requireOrgRole('client_viewer'),
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

      if (req.membership?.role === 'client_viewer' && !req.clientSiteIds?.includes(siteId)) {
        res.status(404).json({
          error: {
            code: ErrorCode.NOT_FOUND,
            message: 'Site not found.',
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

  // GET /v1/orgs/:orgId/sites/:siteId/issues/export.csv (P2-22 CSV export)
  const exportCsvHandler = async (req: Request, res: Response): Promise<void> => {
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

    if (req.membership?.role === 'client_viewer' && !req.clientSiteIds?.includes(siteId)) {
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
      assignee: assigneeParam,
      isRegression,
      needsReview,
      q: search,
    } = queryParse.data;

    const parsedStatus = parseMulti(statusRaw) as IssueStatus[];
    const parsedImpact = parseMulti(impactRaw) as Impact[];

    const filters: IssueListFilters = {
      status: parsedStatus.length > 0 ? parsedStatus : undefined,
      impact: parsedImpact.length > 0 ? parsedImpact : undefined,
      wcag: wcag || undefined,
      templateKey: template || undefined,
      ruleId: rule || undefined,
      isRegression,
      needsReview,
      search: search || undefined,
    };

    if (assigneeParam) {
      filters.assigneeId = assigneeParam === 'me' ? req.auth!.user.id : assigneeParam;
    }

    const rows = await repos.issues.listBySite(req.orgId!, siteId, filters, {
      limit: 10000,
      offset: 0,
      maxLimit: 10000,
      sort: 'impact',
      order: 'desc',
    });

    // RFC 4180 escaping and UTF-8 BOM
    const headers = [
      'Issue ID',
      'Rule ID',
      'Rule Title',
      'Impact',
      'WCAG Criteria',
      'WCAG Level',
      'Template',
      'Status',
      'Occurrences',
      'Is Regression',
      'Needs Review',
      'Assigned To',
      'Due Date',
      'Ignored Reason',
      'Ignored Note',
      'CSS Selector',
      'HTML Snippet',
      'Failure Summary',
      'First Seen At',
      'Last Seen At',
    ];

    // Shared escaping also neutralises spreadsheet formulas in selectors and snippets (P6-10).
    const escapeCsv = csvField;

    const csvLines = [headers.map(escapeCsv).join(',')];

    for (const row of rows) {
      csvLines.push(
        [
          row.id,
          row.ruleId,
          row.title,
          row.impact,
          row.wcagCriteria?.join(', ') ?? '',
          row.wcagLevel ?? '',
          row.templateKey,
          row.status,
          row.occurrenceCount,
          row.isRegression ? 'Yes' : 'No',
          row.needsReview ? 'Yes' : 'No',
          row.assigneeName ?? (row.assigneeId ? 'Assigned' : 'Unassigned'),
          row.dueDate ? new Date(row.dueDate).toISOString().split('T')[0] : '',
          row.ignoredReason ?? '',
          row.ignoredNote ?? '',
          row.selector ?? '',
          row.htmlSnippet ?? '',
          row.failureSummary ?? '',
          row.createdAt ? new Date(row.createdAt).toISOString() : '',
          row.updatedAt ? new Date(row.updatedAt).toISOString() : '',
        ]
          .map(escapeCsv)
          .join(','),
      );
    }

    const csvContent = '\uFEFF' + csvLines.join('\r\n');
    const safeSiteSlug = (site.name || 'site').toLowerCase().replace(/[^a-z0-9_-]+/g, '-');
    const dateStamp = new Date().toISOString().split('T')[0];
    const filename = `issues-${safeSiteSlug}-${dateStamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.status(200).send(Buffer.from(csvContent, 'utf-8'));
  };

  router.get('/sites/:siteId/issues/export.csv', requireOrgRole('client_viewer'), exportCsvHandler);
  router.get('/sites/:siteId/issues/export', requireOrgRole('client_viewer'), exportCsvHandler);

  // GET /v1/orgs/:orgId/issues - Cross-site issues (agency / my-tasks)
  router.get(
    '/issues',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const assigneeParam = req.query.assignee;
      const assignee =
        assigneeParam === 'me' ? req.auth!.user.id : (assigneeParam as string | undefined);
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

    if (req.membership?.role === 'client_viewer' && !req.clientSiteIds?.includes(issue.siteId)) {
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

  router.get('/issues/:issueId', requireOrgRole('client_viewer'), getIssueDetailHandler);
  router.get(
    '/sites/:siteId/issues/:issueId',
    requireOrgRole('client_viewer'),
    getIssueDetailHandler,
  );

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

    if (req.membership?.role === 'client_viewer' && !req.clientSiteIds?.includes(issue.siteId)) {
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

  router.get(
    '/issues/:issueId/occurrences',
    requireOrgRole('client_viewer'),
    getOccurrencesHandler,
  );
  router.get(
    '/sites/:siteId/issues/:issueId/occurrences',
    requireOrgRole('client_viewer'),
    getOccurrencesHandler,
  );

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

    if (req.membership?.role === 'client_viewer' && !req.clientSiteIds?.includes(issue.siteId)) {
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
    const visibleItems =
      req.membership?.role === 'client_viewer' ? items.filter((n) => n.visibleToClient) : items;

    res.status(200).json({
      data: { items: visibleItems },
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

  router.get('/issues/:issueId/notes', requireOrgRole('client_viewer'), getNotesHandler);
  router.get(
    '/sites/:siteId/issues/:issueId/notes',
    requireOrgRole('client_viewer'),
    getNotesHandler,
  );
  router.post('/issues/:issueId/notes', requireOrgRole('member'), createNoteHandler);
  router.post('/sites/:siteId/issues/:issueId/notes', requireOrgRole('member'), createNoteHandler);

  // POST /v1/orgs/:orgId/issues/:issueId/ignore - Ignore with reason & required note
  const ignoreSchema = z
    .object({
      reason: z.enum(['false_positive', 'not_applicable', 'wont_fix', 'accepted_risk']),
      note: z.string().trim().optional(),
    })
    .refine(
      (data) => {
        if ((data.reason === 'accepted_risk' || data.reason === 'wont_fix') && !data.note) {
          return false;
        }
        return true;
      },
      {
        message: 'A note is required when ignoring with accepted_risk or wont_fix.',
        path: ['note'],
      },
    );

  const ignoreHandler = async (req: Request, res: Response): Promise<void> => {
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

    const parseResult = ignoreSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: parseResult.error.issues[0]?.message ?? 'Invalid ignore data.',
          details: { issues: parseResult.error.issues },
        },
      });
      return;
    }

    const updated = await repos.issues.ignore(
      req.orgId!,
      issueId,
      req.auth!.user.id,
      parseResult.data.reason,
      parseResult.data.note,
    );

    // Record compliance evidence event (P5-01)
    await repos.evidenceEvents.record(req.orgId!, {
      siteId: issue.siteId,
      type: 'issue_ignored',
      actorId: req.auth!.user.id,
      data: {
        issueId: issue.id,
        ruleId: issue.ruleId,
        reason: parseResult.data.reason,
        note: parseResult.data.note,
      },
    });

    res.status(200).json({
      data: { issue: updated },
    });
  };

  router.post('/issues/:issueId/ignore', requireOrgRole('member'), ignoreHandler);
  router.post('/sites/:siteId/issues/:issueId/ignore', requireOrgRole('member'), ignoreHandler);

  // POST /v1/orgs/:orgId/issues/:issueId/unignore - Reopen ignored issue
  const unignoreHandler = async (req: Request, res: Response): Promise<void> => {
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

    const updated = await repos.issues.unignore(req.orgId!, issueId, req.auth!.user.id);

    res.status(200).json({
      data: { issue: updated },
    });
  };

  router.post('/issues/:issueId/unignore', requireOrgRole('member'), unignoreHandler);
  router.post('/sites/:siteId/issues/:issueId/unignore', requireOrgRole('member'), unignoreHandler);
  router.post('/issues/:issueId/reopen', requireOrgRole('member'), unignoreHandler);
  router.post('/sites/:siteId/issues/:issueId/reopen', requireOrgRole('member'), unignoreHandler);

  // PATCH /v1/orgs/:orgId/issues/:issueId/assign - Assign or unassign
  const assignSchema = z.object({
    assigneeId: z.string().uuid().nullable(),
  });

  const assignHandler = async (req: Request, res: Response): Promise<void> => {
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

    const parseResult = assignSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: parseResult.error.issues[0]?.message ?? 'Invalid assignee data.',
          details: { issues: parseResult.error.issues },
        },
      });
      return;
    }

    const { assigneeId } = parseResult.data;
    if (assigneeId) {
      const membership = await repos.memberships.find(req.orgId!, assigneeId);
      if (!membership) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: 'Assignee must be a member of this organisation.',
            details: {},
          },
        });
        return;
      }
    }

    const updated = await repos.issues.assign(req.orgId!, issueId, req.auth!.user.id, assigneeId);

    if (assigneeId && assigneeId !== req.auth!.user.id && repos.notifications) {
      const orgSlug = req.org?.slug || req.orgId!;
      repos.notifications
        .createInApp(req.orgId!, assigneeId, {
          type: 'issue_assigned',
          title: 'Issue assigned to you',
          body: `You were assigned to: ${issue.title}`,
          link: `/${orgSlug}/sites/${issue.siteId}/issues?openId=${issue.id}`,
        })
        .catch((err) => {
          console.error('[notifications] Failed to create issue_assigned notification:', err);
        });
    }

    res.status(200).json({
      data: { issue: updated },
    });
  };

  router.patch('/issues/:issueId/assign', requireOrgRole('member'), assignHandler);
  router.patch('/sites/:siteId/issues/:issueId/assign', requireOrgRole('member'), assignHandler);

  // PATCH /v1/orgs/:orgId/issues/:issueId/due-date - Set or clear due date
  const dueDateSchema = z.object({
    dueDate: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD')
      .nullable(),
  });

  const dueDateHandler = async (req: Request, res: Response): Promise<void> => {
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

    const parseResult = dueDateSchema.safeParse(req.body);
    if (!parseResult.success) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: parseResult.error.issues[0]?.message ?? 'Invalid due date format (YYYY-MM-DD).',
          details: { issues: parseResult.error.issues },
        },
      });
      return;
    }

    const updated = await repos.issues.setDueDate(
      req.orgId!,
      issueId,
      req.auth!.user.id,
      parseResult.data.dueDate,
    );

    res.status(200).json({
      data: { issue: updated },
    });
  };

  router.patch('/issues/:issueId/due-date', requireOrgRole('member'), dueDateHandler);
  router.patch('/sites/:siteId/issues/:issueId/due-date', requireOrgRole('member'), dueDateHandler);

  // PATCH & DELETE /v1/orgs/:orgId/issues/:issueId/notes/:noteId
  const updateNoteSchema = z.object({
    body: z.string().trim().min(1, 'Note content is required.').max(10000),
    visibleToClient: z.boolean().optional(),
  });

  const updateNoteHandler = async (req: Request, res: Response): Promise<void> => {
    const { issueId: issueIdParam, noteId: noteIdParam } = req.params;
    const issueId = Array.isArray(issueIdParam) ? issueIdParam[0] : issueIdParam;
    const noteId = Array.isArray(noteIdParam) ? noteIdParam[0] : noteIdParam;

    if (!issueId || !noteId) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Issue ID and Note ID are required.',
          details: {},
        },
      });
      return;
    }

    const note = await repos.issues.findNoteById(req.orgId!, issueId, noteId);
    if (!note) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Note not found.',
          details: {},
        },
      });
      return;
    }

    const isAuthor = note.authorId === req.auth!.user.id;
    const isAdmin = req.membership?.role === 'admin' || req.membership?.role === 'owner';
    if (!isAuthor && !isAdmin) {
      res.status(403).json({
        error: {
          code: ErrorCode.FORBIDDEN,
          message: 'You can only edit your own notes.',
          details: {},
        },
      });
      return;
    }

    const parseResult = updateNoteSchema.safeParse(req.body);
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

    const updated = await repos.issues.updateNote(
      req.orgId!,
      issueId,
      noteId,
      parseResult.data.body,
      parseResult.data.visibleToClient,
    );

    res.status(200).json({
      data: { note: updated },
    });
  };

  const deleteNoteHandler = async (req: Request, res: Response): Promise<void> => {
    const { issueId: issueIdParam, noteId: noteIdParam } = req.params;
    const issueId = Array.isArray(issueIdParam) ? issueIdParam[0] : issueIdParam;
    const noteId = Array.isArray(noteIdParam) ? noteIdParam[0] : noteIdParam;

    if (!issueId || !noteId) {
      res.status(400).json({
        error: {
          code: ErrorCode.VALIDATION_ERROR,
          message: 'Issue ID and Note ID are required.',
          details: {},
        },
      });
      return;
    }

    const note = await repos.issues.findNoteById(req.orgId!, issueId, noteId);
    if (!note) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Note not found.',
          details: {},
        },
      });
      return;
    }

    const isAuthor = note.authorId === req.auth!.user.id;
    const isAdmin = req.membership?.role === 'admin' || req.membership?.role === 'owner';
    if (!isAuthor && !isAdmin) {
      res.status(403).json({
        error: {
          code: ErrorCode.FORBIDDEN,
          message: 'You can only delete your own notes.',
          details: {},
        },
      });
      return;
    }

    await repos.issues.deleteNote(req.orgId!, issueId, noteId);

    res.status(200).json({
      data: { success: true, message: 'Note deleted.' },
    });
  };

  router.patch('/issues/:issueId/notes/:noteId', requireOrgRole('member'), updateNoteHandler);
  router.patch(
    '/sites/:siteId/issues/:issueId/notes/:noteId',
    requireOrgRole('member'),
    updateNoteHandler,
  );
  router.delete('/issues/:issueId/notes/:noteId', requireOrgRole('member'), deleteNoteHandler);
  router.delete(
    '/sites/:siteId/issues/:issueId/notes/:noteId',
    requireOrgRole('member'),
    deleteNoteHandler,
  );

  // POST /v1/orgs/:orgId/issues/bulk - Bulk actions (≤ 200)
  const bulkActionSchema = z
    .object({
      issueIds: z
        .array(z.string().uuid())
        .min(1)
        .max(200, 'Bulk action is limited to 200 issues at a time.'),
      action: z.enum(['ignore', 'unignore', 'assign', 'set_due_date']),
      data: z
        .object({
          reason: z
            .enum(['false_positive', 'not_applicable', 'wont_fix', 'accepted_risk'])
            .optional(),
          note: z.string().trim().optional(),
          assigneeId: z.string().uuid().nullable().optional(),
          dueDate: z
            .string()
            .regex(/^\d{4}-\d{2}-\d{2}$/)
            .nullable()
            .optional(),
        })
        .optional(),
    })
    .refine(
      (val) => {
        if (val.action === 'ignore') {
          if (!val.data?.reason) return false;
          if (
            (val.data.reason === 'accepted_risk' || val.data.reason === 'wont_fix') &&
            !val.data.note
          ) {
            return false;
          }
        }
        return true;
      },
      {
        message: 'A note is required when ignoring with accepted_risk or wont_fix.',
        path: ['data', 'note'],
      },
    );

  router.post(
    '/issues/bulk',
    requireOrgRole('member'),
    async (req: Request, res: Response): Promise<void> => {
      const parseResult = bulkActionSchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          error: {
            code: ErrorCode.VALIDATION_ERROR,
            message: parseResult.error.issues[0]?.message ?? 'Invalid bulk action payload.',
            details: { issues: parseResult.error.issues },
          },
        });
        return;
      }

      const { issueIds, action, data } = parseResult.data;

      let bulkPayload: BulkAction;
      if (action === 'ignore') {
        bulkPayload = {
          type: 'ignore',
          reason: data!.reason as IgnoredReason,
          note: data?.note,
        };
      } else if (action === 'unignore') {
        bulkPayload = { type: 'unignore' };
      } else if (action === 'assign') {
        if (data?.assigneeId) {
          const membership = await repos.memberships.find(req.orgId!, data.assigneeId);
          if (!membership) {
            res.status(400).json({
              error: {
                code: ErrorCode.VALIDATION_ERROR,
                message: 'Assignee must be a member of this organisation.',
                details: {},
              },
            });
            return;
          }
        }
        bulkPayload = { type: 'assign', assigneeId: data?.assigneeId ?? null };
      } else {
        bulkPayload = { type: 'set_due_date', dueDate: data?.dueDate ?? null };
      }

      const outcome = await repos.issues.bulkAction(
        req.orgId!,
        issueIds,
        req.auth!.user.id,
        bulkPayload,
      );

      res.status(200).json({
        data: outcome,
      });
    },
  );

  // POST /v1/orgs/:orgId/issues/:issueId/recheck - Recheck job (issue.recheck)
  const recheckHandler = async (req: Request, res: Response): Promise<void> => {
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

    let jobId: string | null;
    if (options?.enqueueRecheck) {
      await options.enqueueRecheck(issueId);
      jobId = `recheck-${Date.now()}`;
    } else if (options?.boss) {
      jobId = await enqueueIssueRecheck(options.boss, issueId);
    } else {
      res.status(503).json({
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: 'Recheck is unavailable because the job queue is not running.',
          details: {},
        },
      });
      return;
    }

    res.status(200).json({
      data: {
        jobId,
        status: 'queued',
        message: 'Recheck queued.',
      },
    });
  };

  router.post('/issues/:issueId/recheck', requireOrgRole('member'), recheckHandler);
  router.post('/sites/:siteId/issues/:issueId/recheck', requireOrgRole('member'), recheckHandler);

  // POST /v1/orgs/:orgId/issues/:issueId/ai-suggestion (Phase 3 Chunk P3-07, Section 6.10 & 7.5)
  const aiService = options?.aiService ?? new AiService(repos);

  const aiSuggestionHandler = async (req: Request, res: Response): Promise<void> => {
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

    // Determine platform, and for custom-built sites the framework (Next.js, Laravel…)
    let platform = requestedPlatform(req);
    let framework: Framework | null = null;
    if (issue.siteId) {
      const site = await repos.sites.findById(req.orgId!, issue.siteId);
      if (site) {
        if (!platform && site.platform) platform = site.platform;
        if (isCustomPlatform(site.platform)) {
          framework = site.framework ?? null;
          // Sites added before framework detection (or whose first probe failed) are
          // detected on demand once, then remembered on the site.
          if (!framework) {
            const probed = await probeFramework(site.rootUrl);
            if (probed?.framework) {
              framework = probed.framework;
              await repos.sites.update(req.orgId!, site.id, { framework });
            }
          }
        }
      }
    }
    if (!platform) {
      platform = 'generic';
    }

    try {
      const result = await aiService.getOrGenerateSuggestion({
        orgId: req.orgId!,
        issueId: issue.id,
        ruleId: issue.ruleId,
        ruleTitle: issue.title,
        ruleDescription: issue.description,
        wcagCriteria: issue.wcagCriteria,
        platform,
        framework,
        htmlSnippet: issue.htmlSnippet ?? '',
        failureSummary: issue.failureSummary,
      });

      res.status(200).json({
        data: result,
      });
    } catch (err) {
      if (err instanceof AiServiceError) {
        res.status(err.statusCode).json({
          error: {
            code: err.code,
            message: err.message,
            details: err.details,
          },
        });
        return;
      }
      res.status(500).json({
        error: {
          code: ErrorCode.INTERNAL_ERROR,
          message: err instanceof Error ? err.message : 'Failed to generate AI suggestion.',
          details: {},
        },
      });
    }
  };

  const reportAiSuggestionHandler = async (req: Request, res: Response): Promise<void> => {
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

    let cacheKey = aiRequestBodySchema.parse(req.body).cacheKey;
    if (!cacheKey) {
      let platform = requestedPlatform(req);
      let framework: string | null = null;
      if (issue.siteId) {
        const site = await repos.sites.findById(req.orgId!, issue.siteId);
        if (!platform && site?.platform) platform = site.platform;
        if (site && isCustomPlatform(site.platform)) framework = site.framework ?? null;
      }
      platform = platform || 'generic';
      const scrubbed = scrubHtmlSnippet(issue.htmlSnippet || '');
      cacheKey = computeCacheKey(issue.ruleId, aiCacheScope(platform, framework), scrubbed);
    }

    const reportResult = await aiService.reportBadSuggestion(cacheKey);

    res.status(200).json({
      data: {
        success: true,
        flagged: reportResult.flagged,
        cacheKey: reportResult.cacheKey,
      },
    });
  };

  router.post('/issues/:issueId/ai-suggestion', requireOrgRole('member'), aiSuggestionHandler);
  router.post(
    '/sites/:siteId/issues/:issueId/ai-suggestion',
    requireOrgRole('member'),
    aiSuggestionHandler,
  );
  router.post(
    '/issues/:issueId/ai-suggestion/report',
    requireOrgRole('member'),
    reportAiSuggestionHandler,
  );
  router.post(
    '/sites/:siteId/issues/:issueId/ai-suggestion/report',
    requireOrgRole('member'),
    reportAiSuggestionHandler,
  );

  return router;
}
