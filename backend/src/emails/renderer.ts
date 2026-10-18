import {
  renderFirstScanReady,
  renderInvitationEmail,
  renderMagicLink,
  renderReportShared,
  renderResetPassword,
  renderScanSummary,
  renderVerifyEmail,
  renderWelcomeEmail,
  renderFreeCheckReport,
} from './templates/index.js';
import type {
  EmailBranding,
  EmailRenderOutput,
  EmailTemplateId,
  FirstScanReadyData,
  InvitationEmailData,
  MagicLinkData,
  ReportSharedData,
  ResetPasswordData,
  ScanSummaryData,
  TemplateDataMap,
  VerifyEmailData,
  WelcomeEmailData,
  FreeCheckReportData,
} from './types.js';

export function renderEmail<T extends EmailTemplateId>(
  templateId: T,
  data: TemplateDataMap[T],
  branding?: EmailBranding,
): EmailRenderOutput {
  switch (templateId) {
    case 'E-01':
      return renderVerifyEmail(data as VerifyEmailData, branding);
    case 'E-02':
      return renderMagicLink(data as MagicLinkData, branding);
    case 'E-03':
      return renderResetPassword(data as ResetPasswordData, branding);
    case 'E-04':
      return renderInvitationEmail(data as InvitationEmailData, branding);
    case 'E-05':
      return renderWelcomeEmail(data as WelcomeEmailData, branding);
    case 'E-06':
      return renderFirstScanReady(data as FirstScanReadyData, branding);
    case 'E-07':
      return renderScanSummary(data as ScanSummaryData, branding);
    case 'E-11':
      return renderReportShared(data as ReportSharedData, branding);
    case 'E-13':
      return renderFreeCheckReport(data as FreeCheckReportData, branding);
    default:
      throw new Error(`Unsupported email template: ${templateId}`);
  }
}

export function getSampleTemplateData(templateId: EmailTemplateId): unknown {
  switch (templateId) {
    case 'E-01':
      return {
        url: 'http://localhost:3000/verify-email?token=sample_token_123',
        email: 'alex@example.com',
        name: 'Alex Johnson',
      };
    case 'E-02':
      return {
        url: 'http://localhost:3000/magic?token=magic_token_123',
        email: 'alex@example.com',
        name: 'Alex Johnson',
      };
    case 'E-03':
      return {
        url: 'http://localhost:3000/reset-password?token=reset_token_123',
        email: 'alex@example.com',
        name: 'Alex Johnson',
      };
    case 'E-04':
      return {
        inviterName: 'Daniel Mwangi',
        orgName: 'Brightline Studio',
        role: 'member',
        inviteUrl: 'http://localhost:3000/invitations/sample_invite_token',
        expiresInDays: 7,
      };
    case 'E-05':
      return {
        name: 'Daniel Mwangi',
        orgName: 'Brightline Studio',
        dashboardUrl: 'http://localhost:3000/overview',
      };
    case 'E-06':
      return {
        siteName: 'Oakhaus Furniture',
        rootUrl: 'https://oakhaus.com',
        score: 78,
        criticalCount: 3,
        seriousCount: 5,
        moderateCount: 4,
        reportUrl: 'http://localhost:3000/sites/oakhaus',
      };
    case 'E-07':
      return {
        siteName: 'Oakhaus Furniture',
        score: 82,
        previousScore: 78,
        newCount: 1,
        fixedCount: 3,
        regressedCount: 0,
        scanUrl: 'http://localhost:3000/sites/oakhaus/scans/scan-demo',
        unsubscribeUrl: 'http://localhost:3000/settings/notifications',
      };
    case 'E-11':
      return {
        reportTitle: 'Accessibility Scan Summary',
        siteName: 'Oakhaus Furniture',
        senderName: 'Daniel Mwangi',
        message: 'Here is the latest scan report for our staging deployment ahead of tomorrow’s product release.',
        downloadUrl: 'http://localhost:3000/v1/reports/download/sample_token_123',
        expiresInHours: 24,
      };
    case 'E-13':
      return {
        url: 'https://soraskin.co',
        score: 64,
        scoreBand: 'Poor',
        criticalCount: 2,
        seriousCount: 3,
        reportUrl: 'http://localhost:3000/check/sample_check_123',
        checkId: 'sample_check_123',
      };
  }
}
