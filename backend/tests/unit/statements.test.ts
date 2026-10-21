import type { Express } from 'express';
import request from 'supertest';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Auth } from '../../src/lib/auth.js';
import type { Repositories } from '../../src/db/repositories/index.js';
import { ErrorCode } from '../../src/shared/errors.js';
import { buildTestApp } from '../helpers/fakes.js';
import {
  renderAccessibilityStatementHtml,
  type StatementData,
} from '../../src/statements/render.js';

function createMockAuth(userId: string) {
  const mockUser = {
    id: userId,
    email: `${userId}@example.com`,
    name: `User ${userId}`,
    isStaff: false,
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
  const mockSession = {
    id: `sess-${userId}`,
    userId,
    token: `token-${userId}`,
    expiresAt: new Date(Date.now() + 86400000),
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const api = {
    getSession: vi.fn(
      ({ headers }: { headers?: Headers | Record<string, string | string[] | undefined> }) => {
        let cookie: string | null = null;
        if (headers instanceof Headers) {
          cookie = headers.get('cookie');
        } else if (headers && typeof headers === 'object' && 'cookie' in headers) {
          cookie = (headers.cookie as string) ?? null;
        }
        if (cookie && cookie.includes(`token-${userId}`)) {
          return Promise.resolve({ user: mockUser, session: mockSession });
        }
        return Promise.resolve(null);
      },
    ),
  };

  return { auth: { api } as unknown as Auth, user: mockUser };
}

describe('Accessibility Statement Generator (P5-03)', () => {
  const orgId = '018f0000-0000-7000-8000-000000000001';
  const siteId = '018f0000-0000-7000-8000-000000000010';
  const userId = '018f0000-0000-7000-8000-000000000002';
  const clientUserId = '018f0000-0000-7000-8000-000000000004';
  const statementId = '018f0000-0000-7000-8000-000000000099';

  let app: Express;
  let repos: Repositories;

  const mockOrg = {
    id: orgId,
    name: 'Acme Corp',
    slug: 'acme-corp',
    type: 'store' as const,
    plan: 'pro' as const,
    status: 'active' as const,
    timeZone: 'UTC',
    retentionDays: 90,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockSite = {
    id: siteId,
    orgId,
    name: 'Acme Store',
    url: 'https://store.acme.com',
    status: 'verified' as const,
    platform: 'shopify' as const,
    verificationMethod: 'dns' as const,
    verificationToken: 'token123',
    verifiedAt: new Date(),
    pagesLimit: 50,
    crawlSchedule: 'weekly' as const,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const sampleStatementData: StatementData = {
    orgName: 'Acme Corp',
    siteName: 'Acme Store',
    siteUrl: 'https://store.acme.com',
    scope: 'This statement applies to store.acme.com and all checkout flows.',
    targetStandard: 'WCAG 2.2 Level AA',
    conformanceStatus: 'partially_conformant',
    measuresTaken: [
      'Include accessibility throughout our internal policies',
      'Provide continual accessibility training for staff',
    ],
    knownLimitations: [
      {
        title: 'Video player captions',
        description: 'Some older promotional videos lack closed captions.',
        workaround: 'A written summary transcript is provided below the video.',
      },
    ],
    feedbackContact: {
      email: 'accessibility@acme.com',
      phone: '+1-555-0199',
      responseTime: '2 business days',
    },
    enforcementProcedure: {
      bodyName: 'Equality and Human Rights Commission (EHRC)',
      contactUrl: 'https://www.equalityhumanrights.com/',
      description: 'You can submit a complaint to the national enforcement body.',
    },
    statementDate: '2026-10-20',
  };

  beforeEach(() => {
    const { auth } = createMockAuth(userId);
    const testApp = buildTestApp({ auth });
    app = testApp.app;
    repos = testApp.repos;

    vi.mocked(repos.organizations.findById).mockResolvedValue(mockOrg as never);
    vi.mocked(repos.organizations.findBySlug).mockResolvedValue(mockOrg as never);
    vi.mocked(repos.organizations.findByIdOrSlug).mockResolvedValue(mockOrg as never);
    vi.mocked(repos.sites.findById).mockResolvedValue(mockSite as never);

    vi.mocked(repos.memberships.findRole).mockResolvedValue('member');
    vi.mocked(repos.memberships.find).mockResolvedValue({
      id: `mem-${userId}`,
      orgId,
      userId,
      role: 'member' as never,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  describe('HTML Generator (renderAccessibilityStatementHtml)', () => {
    it('produces valid accessible HTML with conformance status and disclaimer', () => {
      const html = renderAccessibilityStatementHtml(sampleStatementData, {
        displayName: 'Acme Corp',
        primaryColor: '#0F3D3E',
      });

      expect(html).toContain('<!DOCTYPE html>');
      expect(html).toContain('<h1>Accessibility Statement</h1>');
      expect(html).toContain('Partially conformant with WCAG 2.2 Level AA');
      expect(html).toContain('accessibility@acme.com');
      expect(html).toContain('Video player captions');
      expect(html).toContain('Equality and Human Rights Commission (EHRC)');
      expect(html).toContain('does not constitute formal legal advice');
      expect(html).toContain('datetime="2026-10-20"');

      // Ensure forbidden words like "compliant" are NOT used
      expect(html.toLowerCase()).not.toContain('compliant');
    });

    it('never renders javascript: or data: URLs as links, even from stored data', () => {
      const html = renderAccessibilityStatementHtml(
        {
          ...sampleStatementData,
          siteUrl: 'javascript:alert(1)',
          enforcementProcedure: {
            bodyName: 'Authority',
            contactUrl: 'data:text/html,<script>alert(1)</script>',
          },
        },
        { displayName: 'Acme Corp' },
      );
      expect(html).not.toMatch(/href="(javascript|data):/i);
    });
  });

  describe('GET /v1/orgs/:orgId/sites/:siteId/statements', () => {
    it('lists statement versions for site', async () => {
      const statementRow = {
        id: statementId,
        orgId,
        siteId,
        version: 1,
        status: 'draft' as const,
        data: sampleStatementData as unknown as Record<string, unknown>,
        renderedHtml: null,
        publishedAt: null,
        publishedBy: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      vi.mocked(repos.statements.listBySite).mockResolvedValue([statementRow]);

      const res = await request(app)
        .get(`/v1/orgs/${orgId}/sites/${siteId}/statements`)
        .set('Cookie', [`token-${userId}=active`]);

      expect(res.status).toBe(200);
      expect(res.body.data).toHaveLength(1);
      expect(res.body.data[0].version).toBe(1);
    });

    it('enforces client viewer site scoping', async () => {
      const { auth: clientAuth } = createMockAuth(clientUserId);
      const clientApp = buildTestApp({ auth: clientAuth, repos }).app;

      vi.mocked(repos.memberships.find).mockResolvedValue(null);
      vi.mocked(repos.memberships.findRole).mockResolvedValue(null);
      vi.mocked(repos.clientAccess.listByUserAndOrg).mockResolvedValue([
        { id: 'ca-1', orgId, siteId: 'different-site-id', createdAt: new Date() },
      ]);

      const res = await request(clientApp)
        .get(`/v1/orgs/${orgId}/sites/${siteId}/statements`)
        .set('Cookie', [`token-${clientUserId}=active`]);

      expect(res.status).toBe(404);
    });
  });

  describe('POST /v1/orgs/:orgId/sites/:siteId/statements', () => {
    it('creates a new statement draft version', async () => {
      vi.mocked(repos.statements.getNextVersion).mockResolvedValue(2);
      vi.mocked(repos.statements.create).mockImplementation((oId, data) =>
        Promise.resolve({
          id: statementId,
          orgId: oId,
          ...data,
          status: data.status ?? 'draft',
          data: data.data ?? {},
          renderedHtml: data.renderedHtml ?? null,
          publishedAt: data.publishedAt ?? null,
          publishedBy: data.publishedBy ?? null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }),
      );

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/statements`)
        .set('Cookie', [`token-${userId}=active`])
        .send({ data: sampleStatementData });

      expect(res.status).toBe(201);
      expect(res.body.data.version).toBe(2);
      expect(res.body.data.status).toBe('draft');
      expect(repos.statements.create).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          siteId,
          version: 2,
          status: 'draft',
        }),
      );
    });

    it('rejects invalid statement data with 400', async () => {
      const invalidData = {
        ...sampleStatementData,
        feedbackContact: { email: 'not-an-email' },
      };

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/statements`)
        .set('Cookie', [`token-${userId}=active`])
        .send({ data: invalidData });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it.each([
      ['siteUrl', { siteUrl: 'javascript:alert(document.cookie)' }],
      [
        'enforcementProcedure.contactUrl',
        { enforcementProcedure: { bodyName: 'X', contactUrl: 'javascript:alert(1)' } },
      ],
    ])('rejects a non-http(s) %s with 400', async (_field, override) => {
      const res = await request(app)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/statements`)
        .set('Cookie', [`token-${userId}=active`])
        .send({ data: { ...sampleStatementData, ...override } });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe(ErrorCode.VALIDATION_ERROR);
    });

    it('forbids client viewer role from creating statements (403)', async () => {
      const { auth: clientAuth } = createMockAuth(clientUserId);
      const clientApp = buildTestApp({ auth: clientAuth, repos }).app;

      vi.mocked(repos.memberships.find).mockResolvedValue(null);
      vi.mocked(repos.memberships.findRole).mockResolvedValue(null);
      vi.mocked(repos.clientAccess.listByUserAndOrg).mockResolvedValue([
        { id: 'ca-1', orgId, siteId, createdAt: new Date() },
      ]);

      const res = await request(clientApp)
        .post(`/v1/orgs/${orgId}/sites/${siteId}/statements`)
        .set('Cookie', [`token-${clientUserId}=active`])
        .send({ data: sampleStatementData });

      expect(res.status).toBe(403);
    });
  });

  describe('POST /v1/orgs/:orgId/statements/:id/publish', () => {
    const existingDraft = {
      id: statementId,
      orgId,
      siteId,
      version: 1,
      status: 'draft' as const,
      data: sampleStatementData as unknown as Record<string, unknown>,
      renderedHtml: null,
      publishedAt: null,
      publishedBy: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('publishes statement, renders HTML, writes audit log, and records evidence event', async () => {
      vi.mocked(repos.statements.findById).mockResolvedValue(existingDraft);
      vi.mocked(repos.branding.findByOrgId).mockResolvedValue({
        id: 'brand-1',
        orgId,
        displayName: 'Acme WhiteLabel',
        logoLightKey: null,
        logoDarkKey: null,
        primaryColor: '#123456',
        emailSenderName: 'Acme Team',
        reportFooter: null,
        hideProductBrand: true,
        customDomain: null,
        customDomainVerifiedAt: null,
        customDomainVerifyToken: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      vi.mocked(repos.statements.update).mockImplementation((oId, sId, data) =>
        Promise.resolve({
          ...existingDraft,
          ...data,
          status: 'published',
          publishedAt: new Date(),
          publishedBy: userId,
          updatedAt: new Date(),
        }),
      );

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/statements/${statementId}/publish`)
        .set('Cookie', [`token-${userId}=active`]);

      expect(res.status).toBe(200);
      expect(res.body.data.statement.status).toBe('published');
      expect(res.body.data.statement.renderedHtml).toContain('Accessibility Statement');
      expect(res.body.data.publicUrl).toContain(`/s/${siteId}/accessibility-statement`);
      expect(res.body.data.embedSnippet).toContain('Accessibility Statement');

      // Verify evidence event was emitted (§5.4)
      expect(repos.evidenceEvents.record).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          siteId,
          type: 'statement_published',
          actorId: userId,
          data: expect.objectContaining({
            statementId,
            version: 1,
            targetStandard: 'WCAG 2.2 Level AA',
            conformanceStatus: 'partially_conformant',
          }),
        }),
      );

      // Verify audit log write
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({
          action: 'statement.published',
          targetId: statementId,
        }),
      );
    });

    it('returns 404 if statement does not exist', async () => {
      vi.mocked(repos.statements.findById).mockResolvedValue(null);

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/statements/018f0000-0000-7000-8000-000000000999/publish`)
        .set('Cookie', [`token-${userId}=active`]);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });
  });

  describe('Public Statement View & Embed (/v1/public/statements/:siteId)', () => {
    const publishedStatement = {
      id: statementId,
      orgId,
      siteId,
      version: 1,
      status: 'published' as const,
      data: sampleStatementData as unknown as Record<string, unknown>,
      renderedHtml: '<html><body><h1>Accessibility Statement</h1></body></html>',
      publishedAt: new Date(),
      publishedBy: userId,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    it('returns JSON by default with public url and embed snippet', async () => {
      vi.mocked(repos.statements.findPublishedBySite).mockResolvedValue(publishedStatement);

      const res = await request(app).get(`/v1/public/statements/${siteId}`);

      expect(res.status).toBe(200);
      expect(res.body.data.statement.id).toBe(statementId);
      expect(res.body.data.embedSnippet).toContain('Accessibility Statement');
      // Public response carries no org, author or internal fields
      const statement = res.body.data.statement as Record<string, unknown>;
      expect(Object.keys(statement).sort()).toEqual(
        ['data', 'id', 'publishedAt', 'renderedHtml', 'siteId', 'version'].sort(),
      );
    });

    it('serves rendered HTML directly when Accept header is text/html', async () => {
      vi.mocked(repos.statements.findPublishedBySite).mockResolvedValue(publishedStatement);

      const res = await request(app)
        .get(`/v1/public/statements/${siteId}`)
        .set('Accept', 'text/html');

      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.text).toContain('<h1>Accessibility Statement</h1>');
    });

    it('returns 404 when site has no published statement', async () => {
      vi.mocked(repos.statements.findPublishedBySite).mockResolvedValue(null);

      const res = await request(app).get(`/v1/public/statements/${siteId}`);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe(ErrorCode.NOT_FOUND);
    });
  });
});
