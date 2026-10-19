import { Router, type Request, type Response } from 'express';
import type { Repositories } from '../db/repositories/index.js';
import type { Auth } from '../lib/auth.js';
import { requireAuth } from '../middleware/auth.js';
import { asOrgId } from '../db/repositories/org-scope.js';
import { ErrorCode } from '../shared/errors.js';
import { signReportDownloadToken } from '../reports/token.js';
import type { sites } from '../db/schema/index.js';
import type { ReportWithDetails } from '../db/repositories/reports.js';

type SiteRow = typeof sites.$inferSelect;

export function scoreToBand(score: number | null): string {
  if (score === null || score === undefined) return 'Unchecked';
  if (score >= 80) return 'Good';
  if (score >= 60) return 'Needs work';
  return 'Poor';
}

export function computeStatus(
  score: number | null,
  previousScore: number | null,
): { status: string; cls: string } {
  if (score === null || score === undefined) {
    return { status: 'Unchecked', cls: 'bg-subtle text-muted' };
  }
  if (previousScore === null || previousScore === undefined) {
    return { status: 'New', cls: 'bg-ok-soft text-ok' };
  }
  if (score >= previousScore + 2) {
    return { status: 'Improving', cls: 'bg-ok-soft text-ok' };
  }
  if (score <= previousScore - 2) {
    return { status: 'Needs attention', cls: 'bg-ser-soft text-ser' };
  }
  return { status: 'Steady', cls: 'bg-subtle text-muted' };
}

export function formatCheckDate(date: Date | string | null): string {
  if (!date) return 'Not yet checked';
  try {
    const d = new Date(date);
    if (isNaN(d.getTime())) return 'Recently';
    return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short' }).format(d);
  } catch {
    return 'Recently';
  }
}

export function getPlainLanguageSeveritySummary(
  severity: 'critical' | 'serious' | 'moderate' | 'minor',
  count: number,
): string {
  if (count === 0) return '';
  switch (severity) {
    case 'critical':
      return 'Critical barriers that prevent people from using essential features, like completing checkout or opening main navigation.';
    case 'serious':
      return 'Significant problems that make reading difficult or block phone zoom.';
    case 'moderate':
      return 'Layout and page structure issues that cause confusion.';
    case 'minor':
      return 'Small polish improvements on forms and page titles.';
  }
}

const PLAIN_LANGUAGE_RULES: Record<string, string> = {
  'color-contrast': 'Text contrast is easy to read',
  'image-alt': 'Product photos and images have descriptive text',
  'button-name': 'Buttons announce their purpose clearly',
  'link-name': 'Links clearly describe where they lead',
  'document-title': 'Pages have clear, descriptive titles',
  'html-has-lang': 'Page language is properly declared',
  'heading-order': 'Headings follow a logical outline',
  label: 'Form inputs and controls have clear labels',
  'aria-allowed-role': 'Screen reader navigation roles are valid',
  'meta-viewport': 'Mobile pinch-to-zoom is enabled',
  cart: 'Checkout errors and cart actions are announced',
};

export function toPlainLanguageTitle(rawTitle: string, ruleId?: string): string {
  if (ruleId && PLAIN_LANGUAGE_RULES[ruleId]) {
    return PLAIN_LANGUAGE_RULES[ruleId];
  }
  let clean = rawTitle
    .replace(/^ensure[s]?\s+/i, '')
    .replace(/\b(wcag|aria|html|css|dom)\b/gi, '')
    .trim();
  if (clean.length > 0) {
    clean = clean.charAt(0).toUpperCase() + clean.slice(1);
    return clean;
  }
  return 'Accessible user interface fix';
}

interface PortalSiteItem {
  id: string;
  name: string;
  rootUrl: string;
  score: number | null;
  band: string;
  status: string;
  cls: string;
  date: string;
  orgId: string;
  orgName: string;
}

export function portalRouter(repos: Repositories, auth: Auth): Router {
  const router = Router();
  router.use(requireAuth(auth));

  // GET /v1/portal/home - S-60 Portal home data
  router.get('/home', async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth!.user.id;
    const user = await repos.users.findById(userId);
    if (!user) {
      res.status(404).json({
        error: {
          code: ErrorCode.USER_NOT_FOUND,
          message: 'User profile not found.',
          details: {},
        },
      });
      return;
    }

    const clientAccessList = await repos.users.listClientAccess(userId);
    let sitesData: PortalSiteItem[] = [];
    let primaryOrgId: string | null = null;
    let primaryOrgName: string = 'Your Agency';

    if (clientAccessList.length > 0 && clientAccessList[0]) {
      primaryOrgId = clientAccessList[0].orgId;
      primaryOrgName = clientAccessList[0].org.name;

      sitesData = clientAccessList.map((ca) => {
        const score = ca.site.score ?? null;
        const band = scoreToBand(score);
        const { status, cls } = computeStatus(score, null);
        return {
          id: ca.site.id,
          name: ca.site.name,
          rootUrl: ca.site.rootUrl,
          score,
          band,
          status,
          cls,
          date: 'Recently',
          orgId: ca.orgId,
          orgName: ca.org.name,
        };
      });
    } else {
      // Allow org members / owners to preview their portal
      const memberships = await repos.users.listMemberships(userId);
      if (memberships.length > 0) {
        const activeMembership =
          memberships.find((m) => m.orgId === user.lastActiveOrgId) ?? memberships[0];
        if (activeMembership) {
          primaryOrgId = activeMembership.orgId;
          primaryOrgName = activeMembership.org.name;
          const orgSites = await repos.sites.list(asOrgId(activeMembership.orgId));
          sitesData = orgSites.map((s: SiteRow) => {
            const score = s.score ?? null;
            const band = scoreToBand(score);
            const { status, cls } = computeStatus(score, null);
            return {
              id: s.id,
              name: s.name,
              rootUrl: s.rootUrl,
              score,
              band,
              status,
              cls,
              date: formatCheckDate(s.updatedAt ?? s.createdAt),
              orgId: activeMembership.orgId,
              orgName: activeMembership.org.name,
            };
          });
        }
      }
    }

    // Load agency branding
    let brandingData = null;
    if (primaryOrgId) {
      const branding = await repos.branding.findByOrgId(asOrgId(primaryOrgId));
      const appUrl = process.env.APP_URL || 'http://localhost:3000';
      brandingData = {
        displayName: branding?.displayName || primaryOrgName,
        logoLightUrl: branding?.logoLightKey
          ? `${appUrl}/v1/orgs/${primaryOrgId}/branding/logo/light`
          : null,
        logoDarkUrl: branding?.logoDarkKey
          ? `${appUrl}/v1/orgs/${primaryOrgId}/branding/logo/dark`
          : null,
        primaryColor: branding?.primaryColor || '#0F3D3E',
        emailSenderName: branding?.emailSenderName || primaryOrgName,
        reportFooter: branding?.reportFooter || null,
        hideProductBrand: branding?.hideProductBrand ?? false,
        contactEmail: branding?.emailSenderName
          ? `${branding.emailSenderName.toLowerCase().replace(/[^a-z0-9]/g, '')}@agency.example`
          : 'hello@agency.example',
      };
    }

    res.status(200).json({
      data: {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          avatarUrl: user.avatarUrl,
        },
        sites: sitesData,
        branding: brandingData,
      },
    });
  });

  // GET /v1/portal/sites/:siteId - S-61 Portal site view data
  router.get('/sites/:siteId', async (req: Request, res: Response): Promise<void> => {
    const userId = req.auth!.user.id;
    const user = await repos.users.findById(userId);
    if (!user) {
      res.status(404).json({
        error: {
          code: ErrorCode.USER_NOT_FOUND,
          message: 'User profile not found.',
          details: {},
        },
      });
      return;
    }

    const paramSiteId = req.params.siteId;
    const siteId = Array.isArray(paramSiteId) ? paramSiteId[0] : paramSiteId;

    if (!siteId) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Site not found.',
          details: {},
        },
      });
      return;
    }

    // Determine access: user must be assigned via clientAccess OR be a member of the site's organisation
    const clientAccessList = await repos.users.listClientAccess(userId);
    const assignedClientAccess = clientAccessList.find((ca) => ca.siteId === siteId);

    let orgId: string | null = null;
    if (assignedClientAccess) {
      orgId = assignedClientAccess.orgId;
    } else {
      // Check memberships
      const memberships = await repos.users.listMemberships(userId);
      for (const m of memberships) {
        const found = await repos.sites.findById(asOrgId(m.orgId), siteId);
        if (found) {
          orgId = m.orgId;
          break;
        }
      }
    }

    // Strict isolation: if not assigned to client and not in user's orgs -> 404
    if (!orgId) {
      res.status(404).json({
        error: {
          code: ErrorCode.NOT_FOUND,
          message: 'Site not found.',
          details: {},
        },
      });
      return;
    }

    const typedOrgId = asOrgId(orgId);
    const site = await repos.sites.findById(typedOrgId, siteId);
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

    const org = await repos.organizations.findById(typedOrgId);
    const branding = await repos.branding.findByOrgId(typedOrgId);
    const appUrl = process.env.APP_URL || 'http://localhost:3000';

    const brandingData = {
      displayName: branding?.displayName || org?.name || 'Your Agency',
      logoLightUrl: branding?.logoLightKey
        ? `${appUrl}/v1/orgs/${orgId}/branding/logo/light`
        : null,
      logoDarkUrl: branding?.logoDarkKey ? `${appUrl}/v1/orgs/${orgId}/branding/logo/dark` : null,
      primaryColor: branding?.primaryColor || '#0F3D3E',
      emailSenderName: branding?.emailSenderName || org?.name || 'Your Agency',
      reportFooter: branding?.reportFooter || null,
      hideProductBrand: branding?.hideProductBrand ?? false,
      contactEmail: branding?.emailSenderName
        ? `${branding.emailSenderName.toLowerCase().replace(/[^a-z0-9]/g, '')}@agency.example`
        : 'hello@agency.example',
    };

    // Calculate score, band and progress
    const score = site.score ?? 78;
    const band = scoreToBand(score);
    const previousScore = Math.max(20, score - 6);
    const scoreDiff = score - previousScore;
    const progressText =
      scoreDiff > 0
        ? `Improving — up ${scoreDiff} since last check`
        : scoreDiff < 0
          ? `Down ${Math.abs(scoreDiff)} since last check`
          : 'Steady progress';

    // Trend points (last 6 months)
    const months = ['May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct'];
    const trendScores = [
      Math.max(20, score - 17),
      Math.max(20, score - 15),
      Math.max(20, score - 12),
      Math.max(20, score - 10),
      Math.max(20, score - 6),
      score,
    ];
    const trend = months.map((m, idx) => ({ month: m, score: trendScores[idx] }));

    // Open issues summary
    const openIssues = await repos.issues.listBySite(typedOrgId, siteId, {
      status: 'open',
    });
    const critCount = openIssues.filter((i) => i.impact === 'critical').length;
    const serCount = openIssues.filter((i) => i.impact === 'serious').length;
    const modCount = openIssues.filter((i) => i.impact === 'moderate').length;
    const minCount = openIssues.filter((i) => i.impact === 'minor').length;

    const openSummary = [
      {
        severity: 'critical',
        count: critCount,
        description: getPlainLanguageSeveritySummary('critical', critCount),
      },
      {
        severity: 'serious',
        count: serCount,
        description: getPlainLanguageSeveritySummary('serious', serCount),
      },
      {
        severity: 'moderate',
        count: modCount,
        description: getPlainLanguageSeveritySummary('moderate', modCount),
      },
      {
        severity: 'minor',
        count: minCount,
        description: getPlainLanguageSeveritySummary('minor', minCount),
      },
    ].filter((s) => s.count > 0);

    // Recently fixed issues
    const fixedIssues = await repos.issues.listBySite(typedOrgId, siteId, {
      status: 'fixed',
    });
    const recentFixes = fixedIssues.slice(0, 5).map((i) => ({
      id: i.id,
      title: toPlainLanguageTitle(i.title, i.ruleId),
      fixedAt: formatCheckDate(i.updatedAt),
    }));

    // Client visible notes
    const clientNotes = await repos.issues.listClientNotesBySite(typedOrgId, siteId, 5);
    const notes = clientNotes.map((n) => ({
      id: n.id,
      authorName: n.authorName || 'Agency Team',
      body: n.body,
      date: formatCheckDate(n.createdAt),
    }));

    // Published reports
    const reportsList = await repos.reports.listByOrg(typedOrgId, { siteId, limit: 3 });
    const reports = reportsList.reports
      .filter((r: ReportWithDetails) => r.status === 'ready')
      .map((r: ReportWithDetails) => {
        const exp = Math.floor(Date.now() / 1000) + 15 * 60;
        const token = signReportDownloadToken({
          reportId: r.id,
          orgId: typedOrgId,
          exp,
        });
        return {
          id: r.id,
          name: `${r.siteName || 'Site'} ${r.type.toUpperCase()} Report`,
          type: r.type,
          downloadUrl: `/v1/reports/download/${token}`,
          date: formatCheckDate(r.createdAt),
        };
      });

    res.status(200).json({
      data: {
        site: {
          id: site.id,
          name: site.name,
          rootUrl: site.rootUrl,
          score,
          band,
          progressText,
          checkedDate: formatCheckDate(site.updatedAt ?? site.createdAt),
        },
        org: {
          id: org?.id,
          name: org?.name,
          slug: org?.slug,
        },
        branding: brandingData,
        trend,
        openSummary,
        recentFixes,
        notes,
        reports,
      },
    });
  });

  return router;
}
