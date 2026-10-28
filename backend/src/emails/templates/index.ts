import { renderEmailLayout } from '../layout.js';
import type {
  EmailBranding,
  EmailRenderOutput,
  FirstScanReadyData,
  InvitationEmailData,
  MagicLinkData,
  ReportSharedData,
  ResetPasswordData,
  ScanSummaryData,
  VerifyEmailData,
  WelcomeEmailData,
  FreeCheckReportData,
  TrialEndingData,
  TrialEndedData,
  DataDeletionWarningData,
  PaymentFailedData,
  SubscriptionCanceledData,
  PlanChangedData,
  RegressionAlertData,
  WeeklyDigestData,
  MonthlyClientReportData,
  WebhookDisabledData,
  DataExportReadyData,
  SecurityNoticeData,
  SiteVerificationFailingData,
  PaidWelcomeData,
  RenewalReminderData,
  InactiveCheckInData,
} from '../types.js';

// E-01: Verify your email
export function renderVerifyEmail(
  data: VerifyEmailData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const subject = `Verify your email for ${brandName}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hello${data.name ? ` ${data.name}` : ''},</p>
    <p style="margin: 0 0 16px 0;">
      Thanks for signing up for ${brandName}. Please verify your email address to confirm your account and get started.
    </p>
    <p style="margin: 0;">
      This verification link is valid for 7 days. If you did not create this account, you can safely ignore this email.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `Verify your email address for ${brandName}`,
    title: 'Verify your email address',
    contentHtml,
    buttonLabel: 'Verify email address',
    buttonUrl: data.url,
    secondaryLinkText: 'Verification link',
    secondaryLinkUrl: data.url,
    branding,
  });

  const text = `Verify your email address for ${brandName}

Hello${data.name ? ` ${data.name}` : ''},

Thanks for signing up for ${brandName}. Please verify your email address by opening the following link in your browser:

${data.url}

This link is valid for 7 days. If you did not create this account, you can safely ignore this email.

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-02: Magic sign-in link
export function renderMagicLink(data: MagicLinkData, branding?: EmailBranding): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const subject = `Your sign-in link for ${brandName}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hello${data.name ? ` ${data.name}` : ''},</p>
    <p style="margin: 0 0 16px 0;">
      We received a request to sign in to your ${brandName} account using this email address.
    </p>
    <p style="margin: 0;">
      Click the button below to sign in instantly. This link is single-use and expires in 15 minutes.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `Click to sign in to your ${brandName} account`,
    title: 'Sign in to EveryVisitor',
    contentHtml,
    buttonLabel: 'Sign in to your account',
    buttonUrl: data.url,
    secondaryLinkText: 'Sign-in link',
    secondaryLinkUrl: data.url,
    branding,
  });

  const text = `Sign in to ${brandName}

Hello${data.name ? ` ${data.name}` : ''},

We received a request to sign in to your ${brandName} account. Use the link below to sign in:

${data.url}

This link is single-use and expires in 15 minutes. If you did not request this link, no action is needed.

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-03: Reset password
export function renderResetPassword(
  data: ResetPasswordData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const subject = `Reset your ${brandName} password`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hello${data.name ? ` ${data.name}` : ''},</p>
    <p style="margin: 0 0 16px 0;">
      We received a request to reset the password for your ${brandName} account.
    </p>
    <p style="margin: 0;">
      Click the button below to choose a new password. For security, this link will expire in 1 hour.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `Reset the password for your ${brandName} account`,
    title: 'Reset your password',
    contentHtml,
    buttonLabel: 'Reset password',
    buttonUrl: data.url,
    secondaryLinkText: 'Reset password link',
    secondaryLinkUrl: data.url,
    branding,
  });

  const text = `Reset your ${brandName} password

Hello${data.name ? ` ${data.name}` : ''},

We received a request to reset the password for your ${brandName} account. Open the link below to set a new password:

${data.url}

This link expires in 1 hour. If you didn't request a password reset, you can safely ignore this email.

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-04: Invitation to organisation
export function renderInvitationEmail(
  data: InvitationEmailData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const inviter = data.inviterName || 'A team administrator';
  const roleLabel =
    data.role === 'admin'
      ? 'an Administrator'
      : data.role === 'client_viewer'
        ? 'a Client Viewer'
        : 'a Member';

  const subject = `${inviter} invited you to join ${data.orgName} on ${brandName}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">
      <strong>${inviter}</strong> has invited you to join <strong>${data.orgName}</strong> as <strong>${roleLabel}</strong>.
    </p>
    <p style="margin: 0 0 16px 0;">
      With this invitation, you will be able to review accessibility audit results, inspect WCAG conformance reports, and collaborate on fixing accessibility issues.
    </p>
    <p style="margin: 0;">
      This invitation is single-use and will expire in ${data.expiresInDays ?? 7} days.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `${inviter} invited you to join ${data.orgName} on ${brandName}`,
    title: `You're invited to join ${data.orgName}`,
    contentHtml,
    buttonLabel: 'Accept invitation & join team',
    buttonUrl: data.inviteUrl,
    secondaryLinkText: 'Direct invitation link',
    secondaryLinkUrl: data.inviteUrl,
    branding,
  });

  const text = `You're invited to join ${data.orgName} on ${brandName}

${inviter} has invited you to join ${data.orgName} as ${roleLabel}.

Accept your invitation by visiting the link below:
${data.inviteUrl}

This invitation is single-use and expires in ${data.expiresInDays ?? 7} days.

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-05: Welcome + next steps
export function renderWelcomeEmail(
  data: WelcomeEmailData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const subject = `Welcome to ${brandName} — Next steps for ${data.orgName}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hello${data.name ? ` ${data.name}` : ''},</p>
    <p style="margin: 0 0 16px 0;">
      Welcome to ${brandName}! Your organisation <strong>${data.orgName}</strong> is ready.
    </p>
    <p style="margin: 0 0 12px 0;"><strong>Here are 3 quick steps to get started:</strong></p>
    <ol style="margin: 0 0 20px 0; padding-left: 20px; line-height: 24px;">
      <li style="margin-bottom: 8px;"><strong>Add your first site</strong>: Enter your storefront or website URL.</li>
      <li style="margin-bottom: 8px;"><strong>Run an automated scan</strong>: Check pages against WCAG 2.2 AA in minutes.</li>
      <li style="margin-bottom: 8px;"><strong>Invite your team</strong>: Add designers and engineers to resolve barriers.</li>
    </ol>
  `;

  const html = renderEmailLayout({
    preheader: `Welcome to ${brandName}. Here are the next steps to start scanning.`,
    title: `Welcome to ${brandName}`,
    contentHtml,
    buttonLabel: 'Go to your dashboard',
    buttonUrl: data.dashboardUrl,
    branding,
  });

  const text = `Welcome to ${brandName}!

Your organisation ${data.orgName} is ready.

Here are 3 quick steps to get started:
1. Add your first site: Enter your storefront or website URL.
2. Run an automated scan: Check pages against WCAG 2.2 AA in minutes.
3. Invite your team: Add designers and engineers to collaborate on fixes.

Access your dashboard:
${data.dashboardUrl}

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-06: First scan ready
export function renderFirstScanReady(
  data: FirstScanReadyData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const subject = `First scan complete for ${data.siteName}: Accessibility score ${data.score}/100`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">
      The initial accessibility audit for <strong>${data.siteName}</strong> (${data.rootUrl}) has completed.
    </p>
    <div style="background-color: #F8F7F4; border: 1px solid #E4E0D8; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="left" style="font-size: 14px; color: #635F59;">Overall Accessibility Score:</td>
          <td align="right" style="font-size: 20px; font-weight: 700; color: #1A1816;">${data.score}/100</td>
        </tr>
        <tr>
          <td align="left" style="font-size: 14px; color: #DC2626; padding-top: 8px;">Critical barriers:</td>
          <td align="right" style="font-size: 14px; font-weight: 600; color: #DC2626; padding-top: 8px;">${data.criticalCount}</td>
        </tr>
        <tr>
          <td align="left" style="font-size: 14px; color: #D97706; padding-top: 4px;">Serious issues:</td>
          <td align="right" style="font-size: 14px; font-weight: 600; color: #D97706; padding-top: 4px;">${data.seriousCount}</td>
        </tr>
      </table>
    </div>
    <p style="margin: 0;">
      Inspect individual violation occurrences, syntax-highlighted code snippets, and remediation guidance in your report.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `Audit complete for ${data.siteName}: Score ${data.score}/100 with ${data.criticalCount} critical issues.`,
    title: `First scan results: ${data.siteName}`,
    contentHtml,
    buttonLabel: 'View full audit results',
    buttonUrl: data.reportUrl,
    branding,
  });

  const text = `First scan complete for ${data.siteName}

The initial accessibility audit for ${data.siteName} (${data.rootUrl}) is finished.

Summary:
- Accessibility Score: ${data.score}/100
- Critical barriers: ${data.criticalCount}
- Serious issues: ${data.seriousCount}

View the full report and remediation guides:
${data.reportUrl}

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-07: Scan completed summary
export function renderScanSummary(
  data: ScanSummaryData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const delta =
    data.previousScore !== null && data.previousScore !== undefined
      ? data.score - data.previousScore
      : null;
  const deltaText =
    delta !== null ? (delta > 0 ? ` (+${delta})` : delta < 0 ? ` (${delta})` : ' (unchanged)') : '';

  const subject = `Scan summary for ${data.siteName}: Score ${data.score}/100${deltaText}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">
      Your automated scan for <strong>${data.siteName}</strong> has finished.
    </p>
    <div style="background-color: #F8F7F4; border: 1px solid #E4E0D8; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="left" style="font-size: 14px; color: #635F59;">Current Score:</td>
          <td align="right" style="font-size: 20px; font-weight: 700; color: #1A1816;">${data.score}/100${deltaText}</td>
        </tr>
        <tr>
          <td align="left" style="font-size: 14px; color: #16A34A; padding-top: 8px;">Fixed issues:</td>
          <td align="right" style="font-size: 14px; font-weight: 600; color: #16A34A; padding-top: 8px;">${data.fixedCount}</td>
        </tr>
        <tr>
          <td align="left" style="font-size: 14px; color: #DC2626; padding-top: 4px;">New violations:</td>
          <td align="right" style="font-size: 14px; font-weight: 600; color: #DC2626; padding-top: 4px;">${data.newCount}</td>
        </tr>
        <tr>
          <td align="left" style="font-size: 14px; color: #D97706; padding-top: 4px;">Regressed issues:</td>
          <td align="right" style="font-size: 14px; font-weight: 600; color: #D97706; padding-top: 4px;">${data.regressedCount}</td>
        </tr>
      </table>
    </div>
  `;

  const html = renderEmailLayout({
    preheader: `Scan summary for ${data.siteName}: Score ${data.score}/100, ${data.fixedCount} fixed, ${data.newCount} new.`,
    title: `Scan summary: ${data.siteName}`,
    contentHtml,
    buttonLabel: 'Review scan diff',
    buttonUrl: data.scanUrl,
    branding,
    unsubscribeUrl: data.unsubscribeUrl,
  });

  const text = `Scan summary for ${data.siteName}

Current score: ${data.score}/100${deltaText}
- Fixed issues: ${data.fixedCount}
- New issues: ${data.newCount}
- Regressed issues: ${data.regressedCount}

Review scan diff:
${data.scanUrl}

${data.unsubscribeUrl ? `Unsubscribe: ${data.unsubscribeUrl}` : ''}

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-11: Report ready / report shared
export function renderReportShared(
  data: ReportSharedData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const senderText = data.senderName
    ? `${data.senderName} shared an accessibility report`
    : 'Your accessibility report is ready';
  const subject = `${data.reportTitle} – ${data.siteName}`;

  const messageBlock = data.message
    ? `<div style="background-color: #F6F5F2; border-left: 3px solid #0F3D3E; border-radius: 4px; padding: 12px 16px; margin: 0 0 20px 0; font-size: 14px; line-height: 1.6; color: #1A1816; font-style: italic;">
        "${data.message.replace(/[<>&"]/g, '')}"
      </div>`
    : '';

  const expiryText = data.expiresInHours
    ? `This secure download link is valid for ${data.expiresInHours} hours.`
    : 'This secure download link is valid for 7 days.';

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">
      ${senderText} for <strong>${data.siteName}</strong>:
    </p>
    ${messageBlock}
    <div style="background-color: #FAFAF8; border: 1px solid #E6E4DF; border-radius: 6px; padding: 16px; margin: 0 0 20px 0;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="left" style="font-size: 14px; font-weight: 600; color: #1A1816;">Report:</td>
          <td align="right" style="font-size: 14px; color: #476788;">${data.reportTitle}</td>
        </tr>
        <tr>
          <td align="left" style="font-size: 14px; font-weight: 600; color: #1A1816; padding-top: 6px;">Site:</td>
          <td align="right" style="font-size: 14px; color: #476788; padding-top: 6px;">${data.siteName}</td>
        </tr>
        <tr>
          <td align="left" style="font-size: 14px; font-weight: 600; color: #1A1816; padding-top: 6px;">Format:</td>
          <td align="right" style="font-size: 14px; color: #476788; padding-top: 6px;">Tagged PDF (A4)</td>
        </tr>
      </table>
    </div>
    <p style="margin: 0 0 8px 0; font-size: 13px; color: #706E6B;">
      ${expiryText}
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `${data.reportTitle} for ${data.siteName} is ready to download.`,
    title: data.reportTitle,
    contentHtml,
    buttonLabel: 'Download report (PDF)',
    buttonUrl: data.downloadUrl,
    secondaryLinkText: 'Download report link',
    secondaryLinkUrl: data.downloadUrl,
    branding,
  });

  const text = `${data.reportTitle} – ${data.siteName}

${senderText} for ${data.siteName}.

${data.message ? `Message: "${data.message}"\n\n` : ''}Report: ${data.reportTitle}
Site: ${data.siteName}
Format: Tagged PDF (A4)

Download the report:
${data.downloadUrl}

${expiryText}

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-13: Free check report
export function renderFreeCheckReport(
  data: FreeCheckReportData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const subject = `Your accessibility audit report for ${data.url}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">
      Here is the free accessibility check report you requested for <strong>${data.url}</strong>:
    </p>
    <div style="background-color: #F8F7F4; border: 1px solid #E4E0D8; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%">
        <tr>
          <td align="left" style="font-size: 14px; color: #635F59;">Audit Score:</td>
          <td align="right" style="font-size: 20px; font-weight: 700; color: #1A1816;">${data.score}/100 (${data.scoreBand})</td>
        </tr>
        <tr>
          <td align="left" style="font-size: 14px; color: #DC2626; padding-top: 8px;">Critical barriers:</td>
          <td align="right" style="font-size: 14px; font-weight: 600; color: #DC2626; padding-top: 8px;">${data.criticalCount}</td>
        </tr>
        <tr>
          <td align="left" style="font-size: 14px; color: #D97706; padding-top: 4px;">Serious issues:</td>
          <td align="right" style="font-size: 14px; font-weight: 600; color: #D97706; padding-top: 4px;">${data.seriousCount}</td>
        </tr>
      </table>
    </div>
    <p style="margin: 0 0 16px 0;">
      Our automated audit evaluated 92 WCAG criteria. You can review your full interactive results, inspect code snippets, and download your tagged PDF report below.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `Audit report for ${data.url}: Score ${data.score}/100 with ${data.criticalCount} critical issues.`,
    title: `Accessibility report for ${data.url}`,
    contentHtml,
    buttonLabel: 'View full audit & download PDF',
    buttonUrl: data.reportUrl,
    secondaryLinkText: 'Direct report link',
    secondaryLinkUrl: data.reportUrl,
    branding,
  });

  const text = `Your accessibility audit report for ${data.url}

Summary:
- Score: ${data.score}/100 (${data.scoreBand})
- Critical barriers: ${data.criticalCount}
- Serious issues: ${data.seriousCount}

View the full report and download PDF:
${data.reportUrl}

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-14: Trial ending (day 10, day 13)
export function renderTrialEnding(
  data: TrialEndingData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const subject = `Your ${brandName} trial ends in ${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hello,</p>
    <p style="margin: 0 0 16px 0;">
      Your 14-day free trial for <strong>${data.orgName}</strong> will conclude in <strong>${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'}</strong> on ${new Date(data.trialEndsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}.
    </p>
    <p style="margin: 0 0 16px 0;">
      To keep automated WCAG monitoring, instant regression email alerts, and continuous verification active, choose a subscription plan before your trial ends.
    </p>
    <p style="margin: 0;">
      If you choose not to subscribe, your account will enter read-only mode when your trial expires. Your scan history, fixes and evidence log will be deleted 30 days after your trial ends unless you choose a plan.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `Keep your automated accessibility monitoring active for ${data.orgName}`,
    title: `Your trial ends in ${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'}`,
    contentHtml,
    buttonLabel: 'Choose a subscription plan',
    buttonUrl: data.upgradeUrl,
    secondaryLinkText: 'Billing settings',
    secondaryLinkUrl: data.upgradeUrl,
    branding,
  });

  const text = `Your ${brandName} trial ends in ${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'}

Hello,

Your 14-day free trial for ${data.orgName} will conclude in ${data.daysLeft} day${data.daysLeft === 1 ? '' : 's'} on ${new Date(data.trialEndsAt).toLocaleDateString('en-US')}.

To keep automated WCAG monitoring and continuous verification active, choose a subscription plan:
${data.upgradeUrl}

If you do not choose a plan, your account will enter read-only mode on expiry. Your scan history, fixes and evidence log will be deleted 30 days after your trial ends unless you choose a plan.

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-15: Trial ended, read-only
export function renderTrialEnded(
  data: TrialEndedData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const subject = `Your ${brandName} trial has ended — account in read-only mode`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hello,</p>
    <p style="margin: 0 0 16px 0;">
      The 14-day free trial for <strong>${data.orgName}</strong> has ended, and your organization has transitioned to <strong>read-only mode</strong>.
    </p>
    <p style="margin: 0 0 16px 0;">
      <strong>What this means:</strong>
    </p>
    <ul style="margin: 0 0 16px 0; padding-left: 20px;">
      <li>Automated scheduled scans and rechecks are temporarily paused.</li>
      <li>New member invitations are disabled.</li>
      <li>All existing scan histories, issue records, notes, and PDF reports remain completely safe and accessible.</li>
    </ul>
    <p style="margin: 0;">
      You can reactivate full scanning and team features at any time by selecting a subscription plan.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `Your scans are paused, but your data is safe for ${data.orgName}`,
    title: 'Your trial has ended',
    contentHtml,
    buttonLabel: 'Upgrade to resume monitoring',
    buttonUrl: data.upgradeUrl,
    secondaryLinkText: 'Choose plan',
    secondaryLinkUrl: data.upgradeUrl,
    branding,
  });

  const text = `Your ${brandName} trial has ended — account in read-only mode

Hello,

The 14-day free trial for ${data.orgName} has ended, and your organization has transitioned to read-only mode.

- Automated scheduled scans and rechecks are paused.
- Your scan history, fixes and evidence log will be deleted 30 days after your trial ends unless you choose a plan.

To resume automated monitoring and team access, choose a plan:
${data.upgradeUrl}

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-20: Data deletion warning (7 days, 1 day)
export function renderDataDeletionWarning(
  data: DataDeletionWarningData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const subject = `Action required: Data deletion notice for ${data.orgName} (${data.daysUntilDeletion} day${data.daysUntilDeletion === 1 ? '' : 's'} remaining)`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hello,</p>
    <p style="margin: 0 0 16px 0;">
      This is an important notice regarding <strong>${data.orgName}</strong>.
    </p>
    <p style="margin: 0 0 16px 0;">
      Your organization has been inactive in read-only mode for over 3 weeks. Under our data retention policy, all historical scan records, issue logs, and audit files are scheduled for permanent deletion in <strong>${data.daysUntilDeletion} day${data.daysUntilDeletion === 1 ? '' : 's'}</strong> on <strong>${new Date(data.deletionDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</strong>.
    </p>
    <p style="margin: 0 0 16px 0;">
      To keep your accessibility history, you can either reactivate your subscription or export your complete data before this date.
    </p>
    <p style="margin: 0;">
      <a href="${data.exportUrl}" style="color: #635F59; text-decoration: underline;">Download complete data export</a>
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `Your accessibility data will be deleted in ${data.daysUntilDeletion} days`,
    title: 'Data deletion notice',
    contentHtml,
    buttonLabel: 'Reactivate subscription',
    buttonUrl: data.reactivateUrl,
    secondaryLinkText: 'Export data before deletion',
    secondaryLinkUrl: data.exportUrl,
    branding,
  });

  const text = `Action required: Data deletion notice for ${data.orgName}

Hello,

Your organization ${data.orgName} has been inactive in read-only mode. All scan records, issue logs, and audit files will be permanently deleted in ${data.daysUntilDeletion} day${data.daysUntilDeletion === 1 ? '' : 's'} on ${new Date(data.deletionDate).toLocaleDateString('en-US')}.

To keep your monitoring and data active:
${data.reactivateUrl}

To export your data:
${data.exportUrl}

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-17: Payment failed / past due
export function renderPaymentFailed(
  data: PaymentFailedData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const subject = `Action required: Payment failed for ${data.orgName}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hello,</p>
    <p style="margin: 0 0 16px 0;">
      We were unable to process the subscription payment for <strong>${data.orgName}</strong>${data.amountFormatted ? ` (${data.amountFormatted})` : ''}.
    </p>
    <p style="margin: 0 0 16px 0;">
      Please update your payment method within <strong>${data.daysRemaining ?? 7} days</strong> to ensure your automated scans and accessibility monitoring continue uninterrupted.
    </p>
    <p style="margin: 0 0 16px 0; color: #635F59; font-size: 14px;">
      Your historical scan records and issue logs remain secure. If payment cannot be processed after 7 days, your organization will enter read-only mode and automated scanning will pause.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `Payment failed for ${data.orgName}. Update payment details to keep scanning active.`,
    title: 'Payment failed',
    contentHtml,
    buttonLabel: 'Update payment method',
    buttonUrl: data.updateBillingUrl,
    branding,
  });

  const text = `Action required: Payment failed for ${data.orgName}

Hello,

We were unable to process the subscription payment for ${data.orgName}${data.amountFormatted ? ` (${data.amountFormatted})` : ''}.

Please update your payment method within ${data.daysRemaining ?? 7} days to keep your automated scans and monitoring active:
${data.updateBillingUrl}

Your historical records remain secure. If payment cannot be processed after 7 days, your account will enter read-only mode and scanning will pause.

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-18: Subscription canceled / will end
export function renderSubscriptionCanceled(
  data: SubscriptionCanceledData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const formattedDate = new Date(data.effectiveDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
  const subject = data.isImmediate
    ? `Your subscription for ${data.orgName} has been canceled`
    : `Your subscription for ${data.orgName} is canceled and stays active until ${formattedDate}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hello,</p>
    <p style="margin: 0 0 16px 0;">
      Your subscription for <strong>${data.orgName}</strong> has been canceled.
    </p>
    <p style="margin: 0 0 16px 0;">
      ${
        data.isImmediate
          ? 'Your organization has transitioned to read-only mode. Automated scheduled scans and rechecks are now paused.'
          : `Your subscription features will remain active until the end of your current billing period on <strong>${formattedDate}</strong>, after which your account will transition to read-only mode.`
      }
    </p>
    <p style="margin: 0 0 16px 0; color: #635F59; font-size: 14px;">
      Under our retention policy, your scan data and reports will be preserved for 30 days. You can reactivate anytime to resume automated accessibility checks.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: data.isImmediate
      ? `Your subscription for ${data.orgName} has been canceled.`
      : `Your subscription for ${data.orgName} stays active until ${formattedDate}.`,
    title: 'Subscription canceled',
    contentHtml,
    buttonLabel: 'Reactivate subscription',
    buttonUrl: data.reactivateUrl,
    branding,
  });

  const text = `Your subscription for ${data.orgName} has been canceled

Hello,

Your subscription for ${data.orgName} has been canceled.

${
  data.isImmediate
    ? 'Your organization has transitioned to read-only mode. Scheduled scans are now paused.'
    : `Your subscription features will remain active until the end of your billing period on ${formattedDate}, after which your account will transition to read-only mode.`
}

Your scan history and reports will be retained for 30 days. You can reactivate anytime:
${data.reactivateUrl}

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-19: Plan changed
export function renderPlanChanged(
  data: PlanChangedData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const subject = `Your ${data.orgName} plan has been updated to ${data.newPlanName}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hello,</p>
    <p style="margin: 0 0 16px 0;">
      Your subscription plan for <strong>${data.orgName}</strong> has been successfully updated to <strong>${data.newPlanName}</strong> (${data.interval === 'year' ? 'Annual' : 'Monthly'} billing).
    </p>
    <p style="margin: 0 0 16px 0;">
      Your updated site limits, scan capacities, and feature access are now active on your dashboard.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `Your ${data.orgName} plan has been updated to ${data.newPlanName}.`,
    title: 'Plan updated',
    contentHtml,
    buttonLabel: 'View billing & limits',
    buttonUrl: data.billingUrl,
    branding,
  });

  const text = `Your ${data.orgName} plan has been updated to ${data.newPlanName}

Hello,

Your subscription plan for ${data.orgName} has been updated to ${data.newPlanName} (${data.interval === 'year' ? 'Annual' : 'Monthly'} billing).

Your updated site limits, scan capacities, and feature access are now active.

View your account details:
${data.billingUrl}

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-08: Regression alert
export function renderRegressionAlert(
  data: RegressionAlertData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const isRegression = data.regressedCount > 0;
  const subject = isRegression
    ? `Accessibility regression detected on ${data.siteName}`
    : `New critical accessibility issues detected on ${data.siteName}`;

  const summaryText = isRegression
    ? `${data.regressedCount} previously fixed issue${data.regressedCount === 1 ? '' : 's'} reappeared in the latest scan.`
    : `${data.newCriticalCount} new critical or serious accessibility problems were discovered in the latest scan.`;

  const itemsHtml = data.items
    .slice(0, 8)
    .map(
      (item) => `
    <li style="margin-bottom: 6px;">
      <strong style="color: ${item.impact === 'critical' ? '#DC2626' : '#D97706'};">[${item.impact.toUpperCase()}]</strong>
      ${item.title}
    </li>
  `,
    )
    .join('');

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">
      A scan on <strong>${data.siteName}</strong> detected accessibility regressions requiring developer attention.
    </p>
    <div style="background-color: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <p style="margin: 0 0 8px 0; font-weight: 600; color: #991B1B;">
        ${summaryText}
      </p>
      <ul style="margin: 0; padding-left: 20px; font-size: 14px; color: #7F1D1D;">
        ${itemsHtml}
      </ul>
    </div>
  `;

  const html = renderEmailLayout({
    preheader: summaryText,
    title: subject,
    contentHtml,
    buttonLabel: 'View issues',
    buttonUrl: data.viewUrl,
    branding,
    unsubscribeUrl: data.unsubscribeUrl,
  });

  const text = `${subject}\n\n${summaryText}\n\n${data.items.map((i) => `- [${i.impact}] ${i.title}`).join('\n')}\n\nView issues:\n${data.viewUrl}\n`;

  return { subject, html, text };
}

// E-10: Weekly digest
export function renderWeeklyDigest(
  data: WeeklyDigestData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const subject = `Weekly accessibility digest for ${data.orgName}`;

  const siteRows = data.sites
    .map(
      (s) => `
      <tr style="border-bottom: 1px solid #E5E7EB;">
        <td style="padding: 10px 8px; font-size: 14px; font-weight: 600; color: #111827;">${s.siteName}</td>
        <td style="padding: 10px 8px; font-size: 14px; text-align: center;">
          ${s.currentScore !== null ? `<strong>${s.currentScore}</strong>` : '—'}
          ${s.scoreDelta !== null && s.scoreDelta !== 0 ? `<span style="font-size: 12px; color: ${s.scoreDelta > 0 ? '#16A34A' : '#DC2626'};"> (${s.scoreDelta > 0 ? '+' : ''}${s.scoreDelta})</span>` : ''}
        </td>
        <td style="padding: 10px 8px; font-size: 14px; text-align: center; color: #16A34A;">${s.fixedIssuesCount}</td>
        <td style="padding: 10px 8px; font-size: 14px; text-align: center; color: ${s.regressedCount > 0 ? '#DC2626' : '#6B7280'}; font-weight: ${s.regressedCount > 0 ? '700' : 'normal'};">${s.regressedCount}</td>
      </tr>
    `,
    )
    .join('');

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">
      Here is your weekly summary of accessibility health across all sites in <strong>${data.orgName}</strong>.
    </p>
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="border-collapse: collapse; margin-bottom: 20px;">
      <thead>
        <tr style="border-bottom: 2px solid #E5E7EB; background-color: #F9FAFB;">
          <th align="left" style="padding: 8px; font-size: 12px; font-weight: 600; color: #6B7280; text-transform: uppercase;">Site</th>
          <th align="center" style="padding: 8px; font-size: 12px; font-weight: 600; color: #6B7280; text-transform: uppercase;">Score</th>
          <th align="center" style="padding: 8px; font-size: 12px; font-weight: 600; color: #6B7280; text-transform: uppercase;">Fixed</th>
          <th align="center" style="padding: 8px; font-size: 12px; font-weight: 600; color: #6B7280; text-transform: uppercase;">Regressed</th>
        </tr>
      </thead>
      <tbody>
        ${siteRows}
      </tbody>
    </table>
    ${
      data.overdueAssignedCount > 0
        ? `
      <div style="background-color: #FFFBEB; border: 1px solid #FDE68A; border-radius: 8px; padding: 12px 16px; margin-bottom: 20px;">
        <p style="margin: 0; font-size: 13px; color: #B45309;">
          <strong>Attention:</strong> You have ${data.overdueAssignedCount} overdue accessibility task${data.overdueAssignedCount === 1 ? '' : 's'} assigned to you.
        </p>
      </div>
    `
        : ''
    }
  `;

  const html = renderEmailLayout({
    preheader: `Weekly accessibility digest for ${data.orgName}: ${data.sites.length} sites checked.`,
    title: subject,
    contentHtml,
    buttonLabel: 'Open Dashboard',
    buttonUrl: data.viewUrl,
    branding,
    unsubscribeUrl: data.unsubscribeUrl,
  });

  const text = `${subject}\n\nWeekly accessibility summary for ${data.orgName}:\n${data.sites.map((s) => `- ${s.siteName}: Score ${s.currentScore ?? '—'}, Fixed ${s.fixedIssuesCount}, Regressed ${s.regressedCount}`).join('\n')}\n\nDashboard: ${data.viewUrl}\n`;

  return { subject, html, text };
}

// E-12: Monthly client report
export function renderMonthlyClientReport(
  data: MonthlyClientReportData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'Accessibility Audit';
  const subject = `${brandName} monthly accessibility report: ${data.siteName} (${data.reportPeriod})`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">
      ${data.clientName ? `Hello ${data.clientName},` : 'Hello,'}
    </p>
    <p style="margin: 0 0 16px 0;">
      Your monthly accessibility report for <strong>${data.siteName}</strong> (${data.reportPeriod}) is now available.
    </p>
    ${
      data.score !== null
        ? `
      <div style="background-color: #F8F7F4; border: 1px solid #E4E0D8; border-radius: 8px; padding: 16px; margin-bottom: 20px; text-align: center;">
        <p style="margin: 0 0 4px 0; font-size: 13px; color: #635F59;">Current Accessibility Score</p>
        <p style="margin: 0; font-size: 28px; font-weight: 700; color: #1A1816;">${data.score} / 100</p>
      </div>
    `
        : ''
    }
  `;

  const html = renderEmailLayout({
    preheader: `Monthly accessibility report for ${data.siteName} (${data.reportPeriod})`,
    title: `Monthly Accessibility Report: ${data.siteName}`,
    contentHtml,
    buttonLabel: 'Download Report (PDF)',
    buttonUrl: data.downloadUrl,
    branding,
  });

  const text = `${subject}\n\nYour monthly accessibility report for ${data.siteName} (${data.reportPeriod}) is available.\n\nDownload Report:\n${data.downloadUrl}\n`;

  return { subject, html, text };
}

// E-21: Webhook disabled after failures
export function renderWebhookDisabled(
  data: WebhookDisabledData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const subject = `Action required: Webhook auto-disabled for ${data.orgName}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">
      A webhook configured for <strong>${data.orgName}</strong> failed 10 consecutive delivery attempts and has been automatically disabled to prevent further delivery errors.
    </p>
    <div style="background-color: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <p style="margin: 0 0 6px 0; font-size: 13px; color: #991B1B;"><strong>Endpoint:</strong> ${data.webhookUrl}</p>
      <p style="margin: 0; font-size: 13px; color: #991B1B;"><strong>Consecutive Failures:</strong> ${data.failureCount}</p>
    </div>
    <p style="margin: 0 0 16px 0;">
      Please inspect your endpoint server logs, verify your HTTPS SSL certificates and firewall settings, and re-enable the webhook in Integrations settings once resolved.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `Webhook auto-disabled for ${data.orgName} after ${data.failureCount} consecutive failures.`,
    title: 'Webhook Disabled',
    contentHtml,
    buttonLabel: 'Manage Webhooks',
    buttonUrl: data.settingsUrl,
    branding,
  });

  const text = `${subject}\n\nWebhook ${data.webhookUrl} failed ${data.failureCount} times and was disabled.\n\nManage Integrations:\n${data.settingsUrl}\n`;

  return { subject, html, text };
}

// E-22: Personal data export ready
export function renderDataExportReady(
  data: DataExportReadyData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const subject = 'Your personal data export is ready';
  const expires = new Date(data.expiresAt).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
  const greeting = data.name ? `Hi ${escapeHtml(data.name)},` : 'Hi,';

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">${greeting}</p>
    <p style="margin: 0 0 16px 0;">
      The copy of your personal data you asked for is ready${data.sizeLabel ? ` (${escapeHtml(data.sizeLabel)})` : ''}. It is a zip file with your profile, roles, sign-in history, notification settings, notes you wrote and files you uploaded, in JSON.
    </p>
    <p style="margin: 0 0 16px 0;">
      You need to be signed in to download it. The link works until <strong>${expires}</strong>, then the file is deleted.
    </p>
    <p style="margin: 0 0 16px 0; font-size: 14px; color: #4A4640;">
      If you did not ask for this, sign in and change your password, then reply to this email.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `Your data export is ready to download until ${expires}.`,
    title: 'Your data export is ready',
    contentHtml,
    buttonLabel: 'Download your data',
    buttonUrl: data.downloadUrl,
    branding,
  });

  const text = `${subject}\n\nThe copy of your personal data you asked for is ready. Sign in to download it before ${expires}:\n${data.downloadUrl}\n\nIf you did not ask for this, sign in and change your password.\n`;

  return { subject, html, text };
}

// E-23: Security notice (password changed / new sign-in). Essential mail: no unsubscribe.
export function renderSecurityNotice(
  data: SecurityNoticeData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const changed = data.kind === 'password_changed';
  const subject = changed
    ? 'Your EveryVisitor password was changed'
    : 'New sign-in to your EveryVisitor account';
  const when = new Date(data.when).toUTCString();
  const greeting = data.name ? `Hi ${escapeHtml(data.name)},` : 'Hi,';
  const where = [data.ip, data.userAgent]
    .filter(Boolean)
    .map((v) => escapeHtml(String(v)))
    .join(' · ');

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">${greeting}</p>
    <p style="margin: 0 0 16px 0;">
      ${changed ? 'The password for your account was changed' : 'Your account was signed in to'} on <strong>${escapeHtml(when)}</strong>${where ? ` (${where})` : ''}.
    </p>
    <p style="margin: 0 0 16px 0;">If this was you, there is nothing to do.</p>
    <p style="margin: 0 0 16px 0;">
      If it was not you, reset your password now and sign out of every other session from your account settings, then reply to this email so we can help.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: changed
      ? 'Your password was just changed.'
      : 'Someone just signed in to your account.',
    title: changed ? 'Password changed' : 'New sign-in',
    contentHtml,
    buttonLabel: 'Review account security',
    buttonUrl: data.accountUrl,
    branding,
  });

  const text = `${subject}\n\n${changed ? 'Your password was changed' : 'Your account was signed in to'} on ${when}${where ? ` (${where})` : ''}.\n\nIf this was not you, reset your password and sign out of other sessions:\n${data.accountUrl}\n`;

  return { subject, html, text };
}

const escapeHtml = (value: string): string =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!,
  );

const VERIFY_METHOD_LABELS: Record<string, string> = {
  meta: 'meta tag',
  dns: 'DNS TXT record',
  file: 'verification file',
};

// E-09: Site verification failing (3 failed weekly re-verifications)
export function renderSiteVerificationFailing(
  data: SiteVerificationFailingData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const subject = `Action needed: we can no longer verify ${data.siteName}`;
  const method = VERIFY_METHOD_LABELS[data.method] ?? data.method;
  const siteName = escapeHtml(data.siteName);

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">
      We checked that you still own <strong>${siteName}</strong> (${escapeHtml(data.rootUrl)}) and the ${escapeHtml(method)} could not be confirmed ${data.failureCount} times in a row.
    </p>
    <div style="background-color: #FEF2F2; border: 1px solid #FCA5A5; border-radius: 8px; padding: 16px; margin-bottom: 20px;">
      <p style="margin: 0; font-size: 14px; color: #991B1B;"><strong>Last check:</strong> ${escapeHtml(data.reason)}</p>
    </div>
    <p style="margin: 0 0 16px 0;">
      This usually happens after a theme change, a site migration or a DNS update removed the ${escapeHtml(method)}. Add it back, then run the check again from the verification page.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `The ${method} for ${data.siteName} could not be confirmed ${data.failureCount} times in a row.`,
    title: 'Site verification failing',
    contentHtml,
    buttonLabel: 'Check verification',
    buttonUrl: data.verifyUrl,
    branding,
  });

  const text = `${subject}\n\nThe ${method} for ${data.siteName} (${data.rootUrl}) could not be confirmed ${data.failureCount} times in a row.\nLast check: ${data.reason}\n\nAdd it back, then run the check again:\n${data.verifyUrl}\n`;

  return { subject, html, text };
}

// E-24: Welcome after first payment + 3 next steps
export function renderPaidWelcome(data: PaidWelcomeData, branding?: EmailBranding): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const cycle = data.interval === 'year' ? 'yearly' : 'monthly';
  const subject = `Thank you. Your ${data.planName} plan is active`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hello${data.name ? ` ${data.name}` : ''},</p>
    <p style="margin: 0 0 16px 0;">
      Thank you for subscribing. <strong>${data.orgName}</strong> is now on the <strong>${data.planName}</strong> plan, billed ${cycle}.
    </p>
    <p style="margin: 0 0 12px 0;"><strong>The 3 most useful things to do next:</strong></p>
    <ol style="margin: 0 0 20px 0; padding-left: 20px; line-height: 24px;">
      <li style="margin-bottom: 8px;"><a href="${data.addSiteUrl}" style="color: #0F3D3E;"><strong>Add and verify your site</strong></a>, so scheduled scans can start.</li>
      <li style="margin-bottom: 8px;"><a href="${data.issuesUrl}" style="color: #0F3D3E;"><strong>Fix the worst problems first</strong></a>. Your issues list is sorted by impact, with plain-language fix guides.</li>
      <li style="margin-bottom: 8px;"><a href="${data.settingsUrl}" style="color: #0F3D3E;"><strong>Turn on alerts and invite your team</strong></a>, so a new problem reaches the right person quickly.</li>
    </ol>
    <p style="margin: 0 0 16px 0; color: #635F59; font-size: 14px;">
      Automated checks find only part of the accessibility problems on a site, so treat them as a strong starting point, not a guarantee. Questions? Reply to this email or write to support@everyvisitor.app.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `Your ${data.planName} plan is active. Here are 3 steps to get the most from it.`,
    title: `Welcome to ${data.planName}`,
    contentHtml,
    buttonLabel: 'Go to your dashboard',
    buttonUrl: data.dashboardUrl,
    branding,
  });

  const text = `Thank you for subscribing.

${data.orgName} is now on the ${data.planName} plan, billed ${cycle}.

The 3 most useful things to do next:
1. Add and verify your site: ${data.addSiteUrl}
2. Fix the worst problems first: ${data.issuesUrl}
3. Turn on alerts and invite your team: ${data.settingsUrl}

Automated checks find only part of the accessibility problems on a site, so treat them as a strong starting point, not a guarantee.

Dashboard: ${data.dashboardUrl}

Questions? Reply to this email or write to support@everyvisitor.app.

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-25: Renewal reminder
export function renderRenewalReminder(
  data: RenewalReminderData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const date = new Date(data.renewsAt).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
  const cycle = data.interval === 'year' ? 'yearly' : 'monthly';
  const amount = data.amountFormatted ? ` for ${data.amountFormatted}` : '';
  const subject = `Your ${data.planName} plan renews on ${date}`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hello,</p>
    <p style="margin: 0 0 16px 0;">
      A reminder that the ${cycle} <strong>${data.planName}</strong> plan for <strong>${data.orgName}</strong> renews automatically on <strong>${date}</strong>${amount}.
    </p>
    <p style="margin: 0 0 16px 0;">
      Nothing to do if you want to keep going. If you would rather change or stop, you can switch to a cheaper plan, pause for 1 to 3 months, or cancel from your billing page before then.
    </p>
    <p style="margin: 0 0 16px 0; color: #635F59; font-size: 14px;">
      See our <a href="https://everyvisitor.app/legal/refunds" style="color: #0F3D3E;">Refund Policy</a> for how refunds work.
    </p>
  `;

  const html = renderEmailLayout({
    preheader: `Your plan renews in ${data.daysUntilRenewal} days. Change or cancel any time before then.`,
    title: 'Your plan renews soon',
    contentHtml,
    buttonLabel: 'Manage your plan',
    buttonUrl: data.billingUrl,
    branding,
  });

  const text = `Hello,

The ${cycle} ${data.planName} plan for ${data.orgName} renews automatically on ${date}${amount}.

Nothing to do if you want to keep going. If you would rather change or stop, you can switch to a cheaper plan, pause for 1 to 3 months, or cancel from your billing page before then:
${data.billingUrl}

Refund Policy: https://everyvisitor.app/legal/refunds

— The ${brandName} Team`;

  return { subject, html, text };
}

// E-26: Personal check-in for inactive paying customers
export function renderInactiveCheckIn(
  data: InactiveCheckInData,
  branding?: EmailBranding,
): EmailRenderOutput {
  const brandName = branding?.displayName || 'EveryVisitor';
  const subject = `Can I help you get more from ${brandName}?`;

  const contentHtml = `
    <p style="margin: 0 0 16px 0;">Hello${data.name ? ` ${data.name}` : ''},</p>
    <p style="margin: 0 0 16px 0;">
      I noticed nobody from <strong>${data.orgName}</strong> has signed in for about ${data.daysSinceLogin} days, so I wanted to check that everything is working for you.
    </p>
    <p style="margin: 0 0 16px 0;">
      If something is unclear, a scan result looks wrong, or the product is not quite what you expected, just reply to this email. I read every reply, and I am happy to walk you through your results or set things up with you.
    </p>
    <p style="margin: 0 0 16px 0;">— James, founder of ${brandName}</p>
  `;

  const html = renderEmailLayout({
    preheader: 'Just checking in. Reply and I will help.',
    title: 'Checking in',
    contentHtml,
    buttonLabel: 'Open your dashboard',
    buttonUrl: data.dashboardUrl,
    branding,
  });

  const text = `Hello${data.name ? ` ${data.name}` : ''},

I noticed nobody from ${data.orgName} has signed in for about ${data.daysSinceLogin} days, so I wanted to check that everything is working for you.

If something is unclear, a scan result looks wrong, or the product is not quite what you expected, just reply to this email or write to ${data.supportEmail}. I read every reply, and I am happy to walk you through your results.

Dashboard: ${data.dashboardUrl}

— James, founder of ${brandName}`;

  return { subject, html, text };
}
