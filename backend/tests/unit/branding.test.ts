import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { buildTestApp } from '../helpers/fakes.js';
import type { Auth } from '../../src/lib/auth.js';
import { asOrgId } from '../../src/db/repositories/org-scope.js';
import {
  parseHexColor,
  getContrastAgainstWhite,
  findAccessibleAlternative,
} from '../../src/shared/contrast.js';
import { renderReportHtml } from '../../src/reports/render.js';
import type { ScanResult } from '../../src/scanner/scan.js';

describe('Chunk P4-07: White-label branding & contrast checks', () => {
  describe('Contrast & Accessible Alternative Math', () => {
    it('parses valid 3-char and 6-char hex strings and rejects invalid inputs', () => {
      expect(parseHexColor('#fff')).toEqual({ r: 255, g: 255, b: 255 });
      expect(parseHexColor('000')).toEqual({ r: 0, g: 0, b: 0 });
      expect(parseHexColor('#0F3D3E')).toEqual({ r: 15, g: 61, b: 62 });
      expect(parseHexColor('invalid')).toBeNull();
      expect(parseHexColor('#12345')).toBeNull();
    });

    it('accurately calculates contrast ratio against white background (#FFFFFF)', () => {
      const white = getContrastAgainstWhite('#FFFFFF');
      expect(white.contrast).toBe(1.0);
      expect(white.valid).toBe(false);

      const darkTeal = getContrastAgainstWhite('#0F3D3E');
      expect(darkTeal.contrast).toBeGreaterThan(9.0);
      expect(darkTeal.valid).toBe(true);

      const lightCyan = getContrastAgainstWhite('#38BDF8'); // Tailwind sky-400
      expect(lightCyan.contrast).toBeLessThan(4.5);
      expect(lightCyan.valid).toBe(false);
    });

    it('finds accessible darkened alternative that meets WCAG 2.1 AA 4.5:1 ratio', () => {
      const lightCyan = '#38BDF8';
      const alt = findAccessibleAlternative(lightCyan, 4.5);
      const altContrast = getContrastAgainstWhite(alt);
      expect(altContrast.contrast).toBeGreaterThanOrEqual(4.5);
      expect(altContrast.valid).toBe(true);

      const lightYellow = '#FACC15';
      const yellowAlt = findAccessibleAlternative(lightYellow, 4.5);
      const yellowContrast = getContrastAgainstWhite(yellowAlt);
      expect(yellowContrast.contrast).toBeGreaterThanOrEqual(4.5);
    });
  });

  describe('Branding API & Plan Gating', () => {
    function setupTest(opts: { plan?: 'agency' | 'store' | 'trial' | 'growth' } = {}) {
      const { plan = 'agency' } = opts;
      const orgId = asOrgId('018f0000-0000-7000-8000-000000000001');

      const user = {
        id: 'usr-agency-1',
        email: 'agency@example.com',
        name: 'Agency Admin',
        emailVerified: true,
        emailVerifiedAt: new Date(),
        avatarUrl: null,
        timeZone: 'UTC',
        isStaff: false,
        lastActiveOrgId: orgId,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const org = {
        id: orgId,
        name: 'Acme Agency',
        slug: 'acme-agency',
        type: 'agency' as const,
        plan,
        billingStatus: 'active' as const,
        trialEndsAt: null,
        paddleCustomerId: 'ctm_123',
        timeZone: 'UTC',
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      };

      const member = {
        id: 'mem-1',
        orgId,
        userId: user.id,
        role: 'owner' as const,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const fakeSession = {
        user: { id: user.id, email: user.email, name: user.name },
        session: { id: 'sess-1', userId: user.id, activeOrganizationId: orgId },
      };

      const auth = {
        api: {
          getSession: vi.fn().mockResolvedValue(fakeSession),
        },
      } as unknown as Auth;

      const { app, repos, storage } = buildTestApp({ auth });

      // Mock user, org, and member repos
      repos.users.findById = vi.fn().mockResolvedValue(user);
      repos.organizations.findById = vi.fn().mockResolvedValue(org);
      repos.organizations.findByIdOrSlug = vi.fn().mockResolvedValue(org);
      repos.memberships.find = vi.fn().mockResolvedValue(member);
      repos.memberships.findRole = vi.fn().mockResolvedValue(member.role);

      return { app, repos, orgId, user, storage };
    }

    it('returns 422 if attempting to update branding on a non-agency plan', async () => {
      const { app, orgId } = setupTest({ plan: 'store' });

      const res = await request(app).patch(`/v1/orgs/${orgId}/branding`).send({
        displayName: 'Acme Design',
        primaryColor: '#0F3D3E',
      });

      expect(res.status).toBe(422);
      expect(res.body.error.code).toBe('PLAN_LIMIT');
      expect(res.body.error.message).toMatch(/White-label branding requires an Agency/);
    });

    it('checks contrast via POST /check-contrast endpoint', async () => {
      const { app, orgId } = setupTest({ plan: 'agency' });

      const res = await request(app)
        .post(`/v1/orgs/${orgId}/branding/check-contrast`)
        .send({ color: '#38BDF8' });

      expect(res.status).toBe(200);
      expect(res.body.data.valid).toBe(false);
      expect(res.body.data.suggestedAlternative).toBeDefined();
    });

    it('rejects primary colors failing WCAG AA 4.5:1 contrast against white', async () => {
      const { app, orgId } = setupTest({ plan: 'agency' });

      const res = await request(app).patch(`/v1/orgs/${orgId}/branding`).send({
        displayName: 'Acme Design',
        primaryColor: '#38BDF8', // light cyan, contrast ~ 2.1:1
      });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe('INVALID_CONTRAST');
      expect(res.body.error.details.requiredRatio).toBe(4.5);
      expect(res.body.error.details.suggestedAlternative).toBeDefined();
    });

    it('successfully saves valid branding on agency plan', async () => {
      const { app, orgId, repos } = setupTest({ plan: 'agency' });

      const res = await request(app).patch(`/v1/orgs/${orgId}/branding`).send({
        displayName: 'Acme Design',
        primaryColor: '#0F3D3E', // valid contrast > 9:1
        emailSenderName: 'Acme Notifications',
        reportFooter: 'Custom confidentiality notice',
        hideProductBrand: true,
      });

      expect(res.status).toBe(200);
      expect(res.body.data.branding.displayName).toBe('Acme Design');
      expect(res.body.data.branding.primaryColor).toBe('#0F3D3E');
      expect(repos.branding.upsert).toHaveBeenCalled();
      expect(repos.auditLog.write).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ action: 'branding.updated' }),
      );
    });

    it('uploads, gets, and deletes brand logos', async () => {
      const { app, orgId, repos } = setupTest({ plan: 'agency' });

      // 1. Upload small valid 1x1 png base64
      const samplePng =
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const uploadRes = await request(app)
        .post(`/v1/orgs/${orgId}/branding/logo`)
        .send({ type: 'light', dataUrl: samplePng });

      expect(uploadRes.status).toBe(200);
      expect(uploadRes.body.data.logoKey).toContain(`branding/${orgId}/logo-light`);

      // 2. Fetch the uploaded logo
      repos.branding.findByOrgId = vi.fn().mockResolvedValue({
        id: 'brand-1',
        orgId,
        logoLightKey: uploadRes.body.data.logoKey,
        logoDarkKey: null,
      });

      const getRes = await request(app).get(`/v1/orgs/${orgId}/branding/logo/light`);

      expect(getRes.status).toBe(200);
      expect(getRes.headers['content-type']).toBe('image/png');

      // 3. Delete logo
      const delRes = await request(app).delete(`/v1/orgs/${orgId}/branding/logo/light`);

      expect(delRes.status).toBe(200);
      expect(delRes.body.data.success).toBe(true);
      expect(repos.branding.upsert).toHaveBeenCalledWith(
        orgId,
        expect.objectContaining({ logoLightKey: null }),
      );
    });
  });

  describe('Report Branding Integration', () => {
    const mockScan: ScanResult = {
      engineVersion: '1.0.0',
      axeVersion: '4.14.0',
      standard: 'wcag22aa',
      rootUrl: 'https://example.com',
      platform: 'custom',
      status: 'completed',
      startedAt: '2026-10-19T10:00:00Z',
      finishedAt: '2026-10-19T10:02:00Z',
      pagesDiscovered: 1,
      pagesPlanned: 1,
      pagesScanned: 1,
      pagesFailed: 0,
      templatesFound: 1,
      score: 95,
      counts: {
        critical: 0,
        serious: 0,
        moderate: 0,
        minor: 0,
        total: 0,
        needsReview: 0,
      },
      planned: [],
      pages: [],
      issues: [],
      discovery: {
        robots: { found: false, crawlDelaySeconds: undefined, sitemaps: [] },
        sitemapsRead: [],
        crawled: false,
        stats: { sitemapUrls: 0, crawlUrls: 0, dropped: 0, requestIntervalMs: 1000 },
        errors: [],
      },
      throttled: false,
    };

    it('injects primary color and prepared by displayName into HTML report', () => {
      const html = renderReportHtml(mockScan, 'summary', {
        displayName: 'Acme Digital Accessibility',
        primaryColor: '#1E3A8A',
        reportFooter: 'Prepared for Acme Client',
      });

      expect(html).toContain('--primary: #1E3A8A');
      expect(html).toContain('Prepared by <strong>Acme Digital Accessibility</strong>');
    });
  });
});
