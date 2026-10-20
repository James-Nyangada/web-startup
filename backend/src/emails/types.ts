export type EmailTemplateId =
  | 'E-01' // Verify your email
  | 'E-02' // Magic sign-in link
  | 'E-03' // Reset password
  | 'E-04' // Invitation to organisation
  | 'E-05' // Welcome + next steps
  | 'E-06' // First scan ready
  | 'E-07' // Scan completed summary
  | 'E-08' // Regression alert
  | 'E-10' // Weekly digest
  | 'E-11' // Report ready / report shared
  | 'E-12' // Monthly client report
  | 'E-13' // Free check report
  | 'E-14' // Trial ending (day 10, day 13)
  | 'E-15' // Trial ended, read-only
  | 'E-17' // Payment failed / past due
  | 'E-18' // Subscription canceled / will end
  | 'E-19' // Plan changed
  | 'E-20' // Data deletion warning (7 days, 1 day)
  | 'E-21'; // Webhook disabled after failures

export interface EmailRenderOutput {
  subject: string;
  html: string;
  text: string;
}

export interface EmailBranding {
  displayName?: string;
  logoUrl?: string;
  primaryColor?: string;
  senderName?: string;
}

export interface VerifyEmailData {
  url: string;
  email: string;
  name?: string | null;
}

export interface MagicLinkData {
  url: string;
  email: string;
  name?: string | null;
}

export interface ResetPasswordData {
  url: string;
  email: string;
  name?: string | null;
}

export interface InvitationEmailData {
  inviterName?: string | null;
  orgName: string;
  role: 'admin' | 'member' | 'client_viewer';
  inviteUrl: string;
  expiresInDays?: number;
}

export interface WelcomeEmailData {
  name?: string | null;
  orgName: string;
  dashboardUrl: string;
}

export interface FirstScanReadyData {
  siteName: string;
  rootUrl: string;
  score: number;
  criticalCount: number;
  seriousCount: number;
  moderateCount?: number;
  reportUrl: string;
}

export interface ScanSummaryData {
  siteName: string;
  score: number;
  previousScore?: number | null;
  newCount: number;
  fixedCount: number;
  regressedCount: number;
  scanUrl: string;
  unsubscribeUrl?: string;
}

export interface ReportSharedData {
  reportTitle: string;
  siteName: string;
  senderName?: string | null;
  message?: string | null;
  downloadUrl: string;
  expiresInHours?: number;
}

export interface FreeCheckReportData {
  url: string;
  score: number;
  scoreBand: string;
  criticalCount: number;
  seriousCount: number;
  reportUrl: string;
  checkId: string;
}

export interface TrialEndingData {
  daysLeft: number;
  orgName: string;
  upgradeUrl: string;
  trialEndsAt: string | Date;
}

export interface TrialEndedData {
  orgName: string;
  upgradeUrl: string;
  readOnlySince?: string | Date;
}

export interface DataDeletionWarningData {
  orgName: string;
  daysUntilDeletion: number;
  reactivateUrl: string;
  exportUrl: string;
  deletionDate: string | Date;
}

export interface PaymentFailedData {
  orgName: string;
  updateBillingUrl: string;
  daysRemaining?: number;
  amountFormatted?: string;
}

export interface SubscriptionCanceledData {
  orgName: string;
  effectiveDate: string | Date;
  reactivateUrl: string;
  isImmediate?: boolean;
}

export interface PlanChangedData {
  orgName: string;
  oldPlanName?: string;
  newPlanName: string;
  interval: 'month' | 'year';
  billingUrl: string;
}

export interface RegressionAlertData {
  siteName: string;
  regressedCount: number;
  newCriticalCount: number;
  items: Array<{ title: string; impact: string; url?: string }>;
  viewUrl: string;
  unsubscribeUrl?: string;
}

export interface WeeklyDigestSite {
  siteName: string;
  currentScore: number | null;
  scoreDelta: number | null;
  newIssuesCount: number;
  fixedIssuesCount: number;
  regressedCount: number;
}

export interface WeeklyDigestData {
  orgName: string;
  sites: WeeklyDigestSite[];
  overdueAssignedCount: number;
  viewUrl: string;
  unsubscribeUrl?: string;
}

export interface MonthlyClientReportData {
  clientName?: string | null;
  siteName: string;
  reportPeriod: string;
  downloadUrl: string;
  score: number | null;
}

export interface WebhookDisabledData {
  orgName: string;
  webhookUrl: string;
  failureCount: number;
  settingsUrl: string;
}

export type TemplateDataMap = {
  'E-01': VerifyEmailData;
  'E-02': MagicLinkData;
  'E-03': ResetPasswordData;
  'E-04': InvitationEmailData;
  'E-05': WelcomeEmailData;
  'E-06': FirstScanReadyData;
  'E-07': ScanSummaryData;
  'E-08': RegressionAlertData;
  'E-10': WeeklyDigestData;
  'E-11': ReportSharedData;
  'E-12': MonthlyClientReportData;
  'E-13': FreeCheckReportData;
  'E-14': TrialEndingData;
  'E-15': TrialEndedData;
  'E-17': PaymentFailedData;
  'E-18': SubscriptionCanceledData;
  'E-19': PlanChangedData;
  'E-20': DataDeletionWarningData;
  'E-21': WebhookDisabledData;
};
