import { z } from 'zod';
import { createScanSchema } from '../routes/scans.js';
import { PUBLIC_API_ROUTES } from '../routes/public-api.js';
import { API_KEY_RATE_LIMIT } from '../middleware/api-key.js';

/**
 * OpenAPI 3.1 document for the public REST API (spec 7.11), generated from Zod schemas.
 * Served at `/v1/openapi.json` and rendered at `docs.<domain>`.
 */

const dateTime = () => z.string().meta({ format: 'date-time' });
const uuid = () => z.string().meta({ format: 'uuid' });
const impact = z.enum(['critical', 'serious', 'moderate', 'minor']);

const ErrorSchema = z
  .object({
    error: z.object({
      code: z.string().meta({ description: 'Stable machine-readable code, e.g. NOT_FOUND.' }),
      message: z.string(),
      details: z.record(z.string(), z.unknown()),
    }),
  })
  .meta({ id: 'Error' });

const SiteSchema = z
  .looseObject({
    id: uuid(),
    name: z.string(),
    rootUrl: z.string().meta({ format: 'uri' }),
    platform: z.string(),
    clientName: z.string().nullable(),
    status: z.enum(['pending_verification', 'active', 'paused', 'error']),
    scanFrequency: z.enum(['weekly', 'daily', 'manual']),
    pageLimit: z.number().int(),
    standard: z.enum(['wcag21aa', 'wcag22aa']),
    score: z.number().int().min(0).max(100).nullable(),
    lastScanId: uuid().nullable(),
    nextScanAt: dateTime().nullable(),
    openCritical: z.number().int().optional(),
    openSerious: z.number().int().optional(),
    createdAt: dateTime(),
  })
  .meta({ id: 'Site', description: 'A monitored website.' });

const IssueSchema = z
  .looseObject({
    id: uuid(),
    siteId: uuid(),
    ruleId: z.string().meta({ example: 'image-alt' }),
    title: z.string(),
    impact,
    wcagCriteria: z.array(z.string()).meta({ example: ['1.1.1'] }),
    wcagLevel: z.enum(['A', 'AA']),
    templateKey: z.string(),
    selector: z.string(),
    htmlSnippet: z.string().nullable(),
    status: z.enum(['open', 'fixed', 'ignored']),
    isRegression: z.boolean(),
    occurrenceCount: z.number().int(),
    dueDate: z.string().meta({ format: 'date' }).nullable(),
    fixedAt: dateTime().nullable(),
    createdAt: dateTime(),
  })
  .meta({ id: 'Issue', description: 'One accessibility problem, grouped across pages.' });

const ScanSchema = z
  .looseObject({
    id: uuid(),
    siteId: uuid(),
    trigger: z.enum(['scheduled', 'manual', 'onboarding', 'api', 'plugin']),
    status: z.enum([
      'queued',
      'discovering',
      'scanning',
      'processing',
      'completed',
      'partial',
      'failed',
      'canceled',
    ]),
    queuedAt: dateTime(),
    startedAt: dateTime().nullable(),
    finishedAt: dateTime().nullable(),
    pagesPlanned: z.number().int(),
    pagesScanned: z.number().int(),
    score: z.number().int().nullable(),
    counts: z.record(z.string(), z.number()),
    errorCode: z.string().nullable(),
  })
  .meta({ id: 'Scan' });

const CreateScanSchema = createScanSchema
  .omit({ trigger: true })
  .meta({ id: 'CreateScan', description: 'All fields optional; the site settings apply.' });

const schemas = { ErrorSchema, SiteSchema, IssueSchema, ScanSchema, CreateScanSchema };

function componentSchemas(): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const schema of Object.values(schemas)) {
    const json = z.toJSONSchema(schema, { target: 'draft-2020-12', unrepresentable: 'any' }) as {
      $defs?: Record<string, unknown>;
    };
    Object.assign(out, json.$defs ?? {});
  }
  // Point nested refs at components instead of $defs.
  return JSON.parse(JSON.stringify(out).replaceAll('#/$defs/', '#/components/schemas/')) as Record<
    string,
    unknown
  >;
}

const ref = (name: string) => ({ $ref: `#/components/schemas/${name}` });
const json = (schema: unknown, example?: unknown) => ({
  'application/json': { schema, ...(example === undefined ? {} : { example }) },
});
const envelope = (props: Record<string, unknown>) => ({
  type: 'object',
  properties: { data: { type: 'object', properties: props } },
});

const exampleSite = {
  id: '01929b3e-5f0a-7c3d-9a1b-2c3d4e5f6a7b',
  name: 'Oakhaus',
  rootUrl: 'https://oakhaus.com',
  platform: 'shopify',
  clientName: 'Oakhaus Ltd',
  status: 'active',
  scanFrequency: 'weekly',
  pageLimit: 250,
  standard: 'wcag22aa',
  score: 82,
  lastScanId: '01929b40-1111-7c3d-9a1b-2c3d4e5f6a7b',
  nextScanAt: '2026-10-27T02:00:00.000Z',
  openCritical: 2,
  openSerious: 7,
  createdAt: '2026-08-12T09:15:00.000Z',
};
const exampleIssue = {
  id: '01929b41-2222-7c3d-9a1b-2c3d4e5f6a7b',
  siteId: exampleSite.id,
  ruleId: 'image-alt',
  title: 'Images must have alternative text',
  impact: 'critical',
  wcagCriteria: ['1.1.1'],
  wcagLevel: 'A',
  templateKey: 'product',
  selector: '.product-gallery img',
  htmlSnippet: '<img src="/cdn/shoe.jpg">',
  status: 'open',
  isRegression: false,
  occurrenceCount: 48,
  dueDate: null,
  fixedAt: null,
  createdAt: '2026-09-02T02:14:00.000Z',
};
const exampleScan = {
  id: exampleSite.lastScanId,
  siteId: exampleSite.id,
  trigger: 'api',
  status: 'queued',
  queuedAt: '2026-10-21T10:00:00.000Z',
  startedAt: null,
  finishedAt: null,
  pagesPlanned: 250,
  pagesScanned: 0,
  score: null,
  counts: {},
  errorCode: null,
};

const errorResponses = {
  '401': {
    description: 'Missing, invalid or revoked API key.',
    content: json(ref('Error'), {
      error: {
        code: 'API_KEY_INVALID',
        message: 'This API key is not valid or has been revoked.',
        details: {},
      },
    }),
  },
  '404': {
    description: 'Not found, or it belongs to another organisation.',
    content: json(ref('Error'), {
      error: { code: 'NOT_FOUND', message: 'Site not found.', details: {} },
    }),
  },
  '429': {
    description: `More than ${API_KEY_RATE_LIMIT} requests in a minute. See the Retry-After header.`,
    content: json(ref('Error'), {
      error: {
        code: 'RATE_LIMITED',
        message: 'Rate limit exceeded.',
        details: { retryAfterSeconds: 12 },
      },
    }),
  },
};

const siteIdParam = {
  name: 'siteId',
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
};

const operations: Record<string, Record<string, unknown>> = {
  'GET /sites': {
    operationId: 'listSites',
    summary: 'List sites',
    description: 'Every site in the organisation with its latest score and open problem counts.',
    parameters: [
      {
        name: 'status',
        in: 'query',
        schema: { type: 'string', enum: ['pending_verification', 'active', 'paused', 'error'] },
      },
      { name: 'q', in: 'query', description: 'Search by name or URL.', schema: { type: 'string' } },
      {
        name: 'sort',
        in: 'query',
        schema: { type: 'string', enum: ['score', 'name', 'lastScan', 'openCritical'] },
      },
    ],
    responses: {
      '200': {
        description: 'The sites.',
        content: json(envelope({ sites: { type: 'array', items: ref('Site') } }), {
          data: { sites: [exampleSite] },
        }),
      },
    },
  },
  'GET /sites/{siteId}': {
    operationId: 'getSite',
    summary: 'Get a site',
    description:
      'Site detail with the latest scan summary and the score trend of the last 12 scans.',
    parameters: [siteIdParam],
    responses: {
      '200': {
        description: 'The site.',
        content: json(
          envelope({
            site: ref('Site'),
            score: { type: ['integer', 'null'] },
            trend: { type: 'array', items: { type: 'object' } },
          }),
          {
            data: {
              site: exampleSite,
              score: 82,
              trend: [
                { scanId: exampleSite.lastScanId, score: 82, date: '2026-10-20T02:31:00.000Z' },
              ],
            },
          },
        ),
      },
    },
  },
  'GET /sites/{siteId}/issues': {
    operationId: 'listIssues',
    summary: 'List issues for a site',
    parameters: [
      siteIdParam,
      {
        name: 'status',
        in: 'query',
        description: 'Comma-separated: open, regressed, needsReview, fixed, ignored.',
        schema: { type: 'string' },
      },
      {
        name: 'impact',
        in: 'query',
        description: 'Comma-separated: critical, serious, moderate, minor.',
        schema: { type: 'string' },
      },
      {
        name: 'wcag',
        in: 'query',
        description: 'A WCAG criterion such as 1.4.3.',
        schema: { type: 'string' },
      },
      { name: 'template', in: 'query', schema: { type: 'string' } },
      { name: 'q', in: 'query', schema: { type: 'string' } },
      { name: 'page', in: 'query', schema: { type: 'integer', minimum: 1, default: 1 } },
      {
        name: 'limit',
        in: 'query',
        schema: { type: 'integer', minimum: 1, maximum: 200, default: 50 },
      },
    ],
    responses: {
      '200': {
        description: 'A page of issues.',
        content: json(
          envelope({
            items: { type: 'array', items: ref('Issue') },
            total: { type: 'integer' },
            page: { type: 'integer' },
            totalPages: { type: 'integer' },
          }),
          {
            data: { items: [exampleIssue], total: 1, page: 1, limit: 50, totalPages: 1 },
          },
        ),
      },
    },
  },
  'GET /issues/{issueId}': {
    operationId: 'getIssue',
    summary: 'Get an issue',
    parameters: [
      { name: 'issueId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: {
      '200': {
        description: 'The issue.',
        content: json(envelope({ issue: ref('Issue') }), { data: { issue: exampleIssue } }),
      },
    },
  },
  'GET /sites/{siteId}/scans': {
    operationId: 'listScans',
    summary: 'List scans for a site',
    description: 'Newest first.',
    parameters: [siteIdParam],
    responses: {
      '200': {
        description: 'The scans.',
        content: json(envelope({ scans: { type: 'array', items: ref('Scan') } }), {
          data: { scans: [exampleScan] },
        }),
      },
    },
  },
  'GET /scans/{scanId}': {
    operationId: 'getScan',
    summary: 'Get a scan',
    description:
      'Progress while running; score, counts and changes since the previous scan once finished.',
    parameters: [
      { name: 'scanId', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } },
    ],
    responses: {
      '200': {
        description: 'The scan.',
        content: json(envelope({ scan: ref('Scan') }), {
          data: { scan: { ...exampleScan, status: 'completed', score: 84, pagesScanned: 250 } },
        }),
      },
    },
  },
  'POST /sites/{siteId}/scans': {
    operationId: 'startScan',
    summary: 'Start a scan',
    description:
      'Queues a scan of a verified site. Needs the `scan:write` scope. API scans count toward the same daily allowance as manual scans.',
    parameters: [siteIdParam],
    requestBody: { required: false, content: json(ref('CreateScan'), { pagesPlanned: 100 }) },
    responses: {
      '201': {
        description: 'Scan queued.',
        content: json(envelope({ scan: ref('Scan') }), { data: { scan: exampleScan } }),
      },
      '403': {
        description: 'The key lacks the scan:write scope.',
        content: json(ref('Error'), {
          error: {
            code: 'API_KEY_SCOPE',
            message: 'This API key does not have the "scan:write" scope.',
            details: {},
          },
        }),
      },
      '409': {
        description: 'A scan is already running for this site.',
        content: json(ref('Error'), {
          error: {
            code: 'SCAN_IN_PROGRESS',
            message: 'A scan is already running for this site.',
            details: {},
          },
        }),
      },
      '422': {
        description: 'Site not verified, or the daily scan allowance is used up.',
        content: json(ref('Error'), {
          error: {
            code: 'PLAN_LIMIT',
            message: 'You have used today’s manual scans for this site.',
            details: {},
          },
        }),
      },
    },
  },
};

export function buildOpenApiDocument(serverUrl: string) {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of PUBLIC_API_ROUTES) {
    const op = operations[`${route.method} ${route.path}`];
    if (!op) throw new Error(`OpenAPI: no operation documented for ${route.method} ${route.path}`);
    paths[route.path] ??= {};
    paths[route.path]![route.method.toLowerCase()] = {
      tags: [
        route.path.startsWith('/scans') || route.path.endsWith('/scans')
          ? 'Scans'
          : route.path.includes('issue')
            ? 'Issues'
            : 'Sites',
      ],
      security: [{ apiKey: [route.scope] }],
      ...op,
      responses: { ...(op.responses as object), ...errorResponses },
    };
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'Plainsight API',
      version: '1.0.0',
      description: [
        'Read sites, scans and accessibility issues, and start scans, from your own tools.',
        '',
        'Available on the Agency Pro plan. Create a key under Settings → API keys and send it as `Authorization: Bearer psk_…`.',
        `Each key can make ${API_KEY_RATE_LIMIT} requests per minute; the \`X-RateLimit-Remaining\` header shows what is left.`,
        'Resources in other organisations always return 404.',
      ].join('\n'),
    },
    servers: [{ url: `${serverUrl.replace(/\/$/, '')}/v1` }],
    tags: [
      { name: 'Sites', description: 'Monitored websites.' },
      { name: 'Issues', description: 'Accessibility problems found by scans.' },
      { name: 'Scans', description: 'Scan runs and their results.' },
    ],
    components: {
      securitySchemes: {
        apiKey: {
          type: 'http',
          scheme: 'bearer',
          description: 'An API key starting `psk_`. Scopes: `read`, `scan:write`.',
        },
      },
      schemas: componentSchemas(),
    },
    paths,
  };
}
