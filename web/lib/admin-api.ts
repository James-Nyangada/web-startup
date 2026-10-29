import { apiClient, apiFetch } from "./api";

/* ---------- Shapes (backend/src/routes/staff.ts, api-keys.ts, orgs.ts, branding.ts, me.ts) ---------- */

export type StaffRole = "owner" | "admin" | "editor" | "support" | "analyst";

export interface StaffSession {
  email: string;
  totpEnrolled: boolean;
  verified: boolean;
  verifiedAt: string | null;
  impersonatingOrgId: string | null;
  role?: StaffRole;
  displayName?: string | null;
  staffMemberId?: string | null;
}

export interface StaffOrgRow {
  id: string;
  name: string;
  slug: string | null;
  type: "agency" | "store";
  plan: string;
  planOverride: string | null;
  planOverrideExpiresAt: string | null;
  billingStatus: string;
  trialEndsAt: string | null;
  deletedAt: string | null;
  createdAt: string;
  siteCount: number;
  lastActivityAt: string | null;
  mrrCents: number;
  health?: { score: number; band: "good" | "at_risk" | "poor"; reasons?: any } | null;
}

export interface StaffOrgDetail {
  org: StaffOrgRow & { planOverrideReason: string | null; timeZone: string; paddleCustomerId: string | null };
  members: { userId: string; email: string; name: string | null; role: string; joinedAt: string }[];
  sites: {
    id: string;
    name: string;
    rootUrl: string;
    platform: string;
    status: string;
    score: number | null;
    scanFrequency: string;
    nextScanAt: string | null;
    deletedAt: string | null;
  }[];
  recentScans: {
    id: string;
    siteId: string;
    siteName: string;
    trigger: string;
    status: string;
    queuedAt: string;
    finishedAt: string | null;
    pagesScanned: number;
    score: number | null;
    errorCode: string | null;
    errorMessage: string | null;
  }[];
  errors: StaffOrgDetail["recentScans"];
  billingEvents: AuditEntry[];
  invoices: { id: string; amountCents: number; currency: string; status: string; billedAt: string; invoiceUrl: string | null }[];
  subscription: { plan: string; interval: string; status: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
  health?: { score: number; band: "good" | "at_risk" | "poor"; reasons: string[]; computedAt: string } | null;
  mrrCents: number;
}

export interface QueueSummary {
  name: string;
  queuedCount: number;
  readyCount: number;
  deferredCount: number;
  activeCount: number;
  failedCount: number;
  totalCount: number;
}

export interface QueueJob {
  id: string;
  name: string;
  state: string;
  data: unknown;
  output: unknown;
  retryCount: number;
  createdOn: string;
  startedOn: string | null;
  completedOn: string | null;
}

export interface SystemReport {
  days: number;
  metrics: {
    scans: { total: number; failed: number; completed: number; failureRate: number; avgDurationMs: number | null };
    scansPerDay: { day: string; count: number }[];
    freeChecksPerDay: { day: string; count: number }[];
    trialConversion: { trialsStarted: number; converted: number };
    mrrCents: number;
  };
  system: {
    hostname: string;
    uptimeSeconds: number;
    loadAverage: number[];
    cpuCount: number;
    memory: { totalBytes: number; freeBytes: number; usedRatio: number };
    process: { rssBytes: number; heapUsedBytes: number; uptimeSeconds: number };
    disk: { path: string; totalBytes: number; freeBytes: number; usedRatio: number } | null;
  };
}

export interface FreeCheckLead {
  id: string;
  email: string;
  url: string;
  domain: string;
  status: string;
  score: number | null;
  marketingConsent: boolean;
  convertedOrgId: string | null;
  createdAt: string;
}

export interface WaitlistLead {
  id: string;
  email: string;
  source: string | null;
  consent: boolean;
  converted: boolean;
  createdAt: string;
}

export interface FlaggedSuggestion {
  id: string;
  ruleId: string;
  platform: string;
  suggestionMd: string;
  model: string;
  updatedAt: string;
}

export interface FeatureFlag {
  key: string;
  enabled: boolean;
  orgIds: string[];
  updatedAt: string;
}

export interface Page<T> {
  data: T[];
  nextCursor: string | null;
}

export interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: ("read" | "scan:write")[];
  lastUsedAt: string | null;
  revokedAt: string | null;
  createdAt: string;
}

export interface AuditEntry {
  id: string;
  action: string;
  actorType: "user" | "staff" | "system" | "api_key";
  actorId: string | null;
  actorName?: string | null;
  actorEmail?: string | null;
  targetType: string | null;
  targetId: string | null;
  ip: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface AuditFilters {
  action?: string;
  actorType?: string;
  q?: string;
  from?: string;
  to?: string;
}

export interface CustomDomainStatus {
  domain: string | null;
  verifiedAt: string | null;
  status: "none" | "pending" | "verified";
  records: {
    cname: { type: "CNAME"; host: string; value: string };
    txt: { type: "TXT"; host: string; value: string };
  } | null;
}

export interface DataExport {
  id: string;
  status: "queued" | "ready" | "failed";
  fileSize: number | null;
  createdAt: string;
  expiresAt: string | null;
  downloadable: boolean;
}

const json = (body: unknown, method = "POST"): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

const qs = (params: Record<string, string | number | boolean | undefined | null>) => {
  const entries = Object.entries(params).filter(
    ([, v]) => v !== undefined && v !== null && v !== "",
  ) as [string, string | number | boolean][];
  return entries.length ? `?${new URLSearchParams(entries.map(([k, v]) => [k, String(v)]))}` : "";
};

export interface InactiveCustomer {
  orgId: string;
  orgName: string;
  plan: string;
  ownerEmail: string;
  ownerName: string | null;
  lastActiveAt: string;
  daysInactive: number;
  lastCheckInAt: string | null;
}

export interface ActivationRow {
  orgId: string;
  orgName: string;
  plan: string;
  billingStatus: string;
  createdAt: string;
  daysSinceSignup: number;
  steps: { siteVerified: string | null; fullScanCompleted: string | null; issueFixed: string | null };
  stepsDone: number;
  activatedAt: string | null;
  withinWeek: boolean;
}

export interface ActivationReport {
  summary: { orgs: number; activated: number; activatedWithinWeek: number; activationRate: number };
  items: ActivationRow[];
}

/* ---------- Phase 8 Models (CMS, Analytics, Customer additions) ---------- */

export interface StaffMember {
  id: string;
  userId: string;
  role: StaffRole;
  displayName: string | null;
  jobTitle: string | null;
  bio: string | null;
  avatarKey: string | null;
  active: boolean;
  createdAt: string;
  email?: string;
}

export interface ContentPost {
  id: string;
  type: "blog" | "guide";
  slug: string;
  title: string;
  excerpt?: string | null;
  bodyMd: string;
  bodyHtml?: string;
  coverMediaId?: string | null;
  coverAlt?: string | null;
  authorStaffId: string;
  author?: { id: string; displayName: string | null; jobTitle: string | null; bio: string | null };
  tags: string[];
  seoTitle?: string | null;
  seoDescription?: string | null;
  ogMediaId?: string | null;
  canonicalUrl?: string | null;
  noindex: boolean;
  status: "draft" | "scheduled" | "published" | "archived";
  publishAt?: string | null;
  publishedAt?: string | null;
  ruleId?: string | null;
  platform?: string | null;
  sections?: Record<string, any> | null;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  updatedBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ContentRevision {
  id: string;
  postId?: string | null;
  pageKey?: string | null;
  version: number;
  data: any;
  note?: string | null;
  createdBy: string;
  createdAt: string;
}

export interface ContentPage {
  id: string;
  pageKey: string;
  data: any;
  status: "draft" | "published";
  publishedVersion?: number | null;
  effectiveDate?: string | null;
  publishedAt?: string | null;
  publishedBy?: string | null;
  updatedAt: string;
}

export interface ChangelogEntry {
  id: string;
  date: string;
  title: string;
  type: "new" | "improved" | "fixed";
  bodyMd: string;
  bodyHtml?: string;
  showInApp: boolean;
  status: "draft" | "published";
  publishedAt?: string | null;
  createdAt: string;
}

export interface MediaAsset {
  id: string;
  key: string;
  filename: string;
  mime: string;
  size: number;
  width?: number | null;
  height?: number | null;
  variants?: any;
  altText?: string | null;
  isDecorative: boolean;
  caption?: string | null;
  credit?: string | null;
  uploadedBy: string;
  url: string | null;
  createdAt: string;
}

export interface Banner {
  id: string;
  surface: "site" | "app" | "both";
  message: string;
  linkUrl?: string | null;
  style: "info" | "success" | "warning";
  audience?: any;
  startsAt?: string | null;
  endsAt?: string | null;
  dismissible: boolean;
  active: boolean;
  createdAt: string;
}

export interface SiteSettings {
  id: string;
  supportEmail: string;
  bannedWords: string[];
  maintenanceMode: boolean;
  deployHookConfigured: boolean;
}

export interface SiteDeploy {
  id: string;
  trigger: "publish" | "manual" | "schedule";
  requestedBy?: string | null;
  cfDeploymentId?: string | null;
  status: "queued" | "building" | "live" | "failed";
  startedAt: string;
  finishedAt?: string | null;
  error?: string | null;
}

export interface OrgNote {
  id: string;
  orgId: string;
  staffMemberId: string;
  bodyMd: string;
  authorName?: string;
  createdAt: string;
}

export interface OrgTag {
  id: string;
  orgId: string;
  tag: string;
  createdAt: string;
}

export interface OrgHealth {
  id: string;
  orgId: string;
  score: number;
  band: "good" | "at_risk" | "poor";
  reasons: { factor: string; description: string; impact: number }[];
  computedAt: string;
}

export interface StaffEmail {
  id: string;
  orgId: string;
  toEmail: string;
  template: string;
  subject: string;
  bodyMd: string;
  sentBy: string;
  status: string;
  createdAt: string;
}

export interface SavedSegment {
  id: string;
  name: string;
  filterConfig: any;
  createdBy: string;
  createdAt: string;
}

export interface DashboardCard {
  label: string;
  format: "currency" | "number" | "percent";
  /** null until the first snapshot has data for this figure. */
  value: number | null;
  changePct: number | null;
}

export interface DashboardData {
  statCards: Record<string, DashboardCard>;
  mrrMonthly: { month: string; mrrCents: number }[];
  signupsWeekly: { week: string; signups: number; converted: number }[];
  visitorsDaily: { date: string; visitors: number }[];
  needsAttention: { id: string; type: string; title: string; description: string; href: string; severity: "crit" | "warn" | "info" }[];
  recentActivity: { id: string; type: string; text: string; date: string; orgId?: string }[];
  /** False until UMAMI_API_URL, UMAMI_API_TOKEN and UMAMI_WEBSITE_ID are set. */
  trafficConnected: boolean;
}

export interface TrafficReport {
  configured: true;
  fetchedAt: string;
  totals: { visitors: number; pageViews: number; bounces: number; visits: number; totalTimeSeconds: number };
  daily: { date: string; visitors: number; pageViews: number }[];
  pages: { path: string; visitors: number }[];
  referrers: { name: string; visitors: number }[];
  countries: { name: string; visitors: number }[];
  devices: { name: string; visitors: number }[];
  campaigns: { name: string; visitors: number }[];
  checker: { checks: number; withEmail: number; startedTrial: number };
}

export interface FunnelData {
  steps: { name: string; count: number; conversionPct: number; dropOffPct: number }[];
  bySource: { source: string; signups: number; activated: number; paid: number }[];
}

/* ---------- Staff (S-70 – S-75) ---------- */

export const staffApi = {
  session: () => apiClient<StaffSession>("/v1/staff/session"),
  enroll: () => apiClient<{ secret: string; otpauthUrl: string }>("/v1/staff/totp/enroll", { method: "POST" }),
  confirm: (code: string) => apiClient<{ verified: boolean }>("/v1/staff/totp/confirm", json({ code })),
  verify: (code: string) => apiClient<{ verified: boolean }>("/v1/staff/totp/verify", json({ code })),

  listOrgs: (params: { q?: string; plan?: string; status?: string; healthBand?: string; includeDeleted?: boolean; cursor?: string | null }) =>
    apiFetch<Page<StaffOrgRow>>(`/v1/staff/orgs${qs({ ...params, limit: 50 })}`),
  inactiveCustomers: () => apiClient<InactiveCustomer[]>("/v1/staff/inactive-customers"),
  sendCheckIn: (orgId: string) =>
    apiClient<{ sent: boolean; to: string }>(`/v1/staff/orgs/${orgId}/check-in`, { method: "POST" }),
  activation: () => apiClient<ActivationReport>("/v1/staff/activation"),
  getOrg: (id: string) => apiClient<StaffOrgDetail>(`/v1/staff/orgs/${id}`),
  extendTrial: (id: string, days: number, reason: string) =>
    apiClient(`/v1/staff/orgs/${id}/extend-trial`, json({ days, reason })),
  setPlanOverride: (id: string, plan: string, expiresAt: string, reason: string) =>
    apiClient(`/v1/staff/orgs/${id}/plan-override`, json({ plan, expiresAt, reason }, "PUT")),
  clearPlanOverride: (id: string) => apiClient(`/v1/staff/orgs/${id}/plan-override`, { method: "DELETE" }),
  impersonate: (id: string, reason: string) =>
    apiClient<{ org: { id: string; slug: string | null; name: string } }>(
      `/v1/staff/orgs/${id}/impersonate`,
      json({ reason }),
    ),
  stopImpersonation: () => apiClient<{ stopped: boolean }>("/v1/staff/impersonation/stop", { method: "POST" }),

  queues: () => apiClient<{ queues: QueueSummary[] }>("/v1/staff/queues").then((r) => r.queues),
  jobs: (queue: string, state: "failed" | "active") =>
    apiClient<{ jobs: QueueJob[] }>(`/v1/staff/queues/${encodeURIComponent(queue)}/jobs?state=${state}`).then((r) => r.jobs),
  retryJob: (queue: string, id: string) =>
    apiClient(`/v1/staff/queues/${encodeURIComponent(queue)}/jobs/${id}/retry`, { method: "POST" }),
  deleteJob: (queue: string, id: string) =>
    apiClient(`/v1/staff/queues/${encodeURIComponent(queue)}/jobs/${id}`, { method: "DELETE" }),
  system: (days = 7) => apiClient<SystemReport>(`/v1/staff/system?days=${days}`),

  freeCheckLeads: (params: { q?: string; consent?: boolean; cursor?: string | null }) =>
    apiFetch<Page<FreeCheckLead>>(`/v1/staff/leads/free-checks${qs({ ...params, limit: 50 })}`),
  waitlist: (params: { q?: string; consent?: boolean; cursor?: string | null }) =>
    apiFetch<Page<WaitlistLead>>(`/v1/staff/leads/waitlist${qs({ ...params, limit: 50 })}`),
  leadsCsvPath: "/v1/staff/leads/export.csv",

  flaggedSuggestions: () =>
    apiClient<{ items: FlaggedSuggestion[] }>("/v1/staff/ai-suggestions/flagged").then((r) => r.items),
  approveSuggestion: (id: string) => apiClient(`/v1/staff/ai-suggestions/${id}/approve`, { method: "POST" }),
  deleteSuggestion: (id: string) => apiClient(`/v1/staff/ai-suggestions/${id}`, { method: "DELETE" }),
  promoteSuggestion: (id: string) =>
    apiClient<{ guide: { slug: string } }>(`/v1/staff/ai-suggestions/${id}/promote`, { method: "POST" }),

  flags: () => apiClient<{ flags: FeatureFlag[] }>("/v1/staff/feature-flags").then((r) => r.flags),
  saveFlag: (key: string, enabled: boolean, orgIds: string[]) =>
    apiClient<{ flag: FeatureFlag }>(`/v1/staff/feature-flags/${encodeURIComponent(key)}`, json({ enabled, orgIds }, "PUT")),
  deleteFlag: (key: string) => apiClient(`/v1/staff/feature-flags/${encodeURIComponent(key)}`, { method: "DELETE" }),

  /* ---------- Phase 8: Dashboards and Analytics ---------- */
  dashboard: () => apiClient<DashboardData>("/v1/staff/dashboard"),
  metrics: (params: { metric: string; from: string; to: string; granularity?: string; dimension?: string; compare?: boolean }) =>
    apiClient<{ metric: string; from: string; to: string; points: { date: string; value: number }[]; comparison?: { date: string; value: number }[] }>(
      `/v1/staff/metrics${qs(params)}`,
    ),
  traffic: (params: { from?: string; to?: string }) =>
    apiClient<TrafficReport | { configured: false }>(`/v1/staff/analytics/traffic${qs(params)}`),
  funnel: (params: { from?: string; to?: string }) =>
    apiClient<FunnelData>(`/v1/staff/analytics/funnel${qs(params)}`),
  cohorts: () =>
    apiClient<{ cohorts: { cohort: string; size: number; retention: number[] }[] }>("/v1/staff/analytics/cohorts"),
  businessInsights: (params: { from?: string; to?: string }) =>
    apiClient<{
      cancellations: { label: string; value: number }[];
      plans: { plan: string; count: number; mrrCents: number }[];
      topCustomers: { id: string; name: string; slug: string | null; plan: string; billingStatus: string; mrrCents: number }[];
    }>(`/v1/staff/analytics/business${qs(params)}`),
  productInsights: (params: { from?: string; to?: string }) =>
    apiClient<{
      adoption: { totalPaying: number; items: { label: string; value: number }[] };
      issueTrend: { week: string; found: number; fixed: number }[];
      aiTrend: { week: string; generated: number; flagged: number }[];
    }>(`/v1/staff/analytics/product${qs(params)}`),
  activationDistribution: (params: { from?: string; to?: string }) =>
    apiClient<{ label: string; value: number }[]>(`/v1/staff/analytics/activation${qs(params)}`),
  metricsCsvPath: (params: Record<string, any>) => `/v1/staff/metrics/export.csv${qs(params)}`,

  /* ---------- Phase 8: Content Posts & Guides ---------- */
  listPosts: (params?: { type?: string; status?: string; tag?: string; q?: string; cursor?: string | null }) =>
    apiFetch<Page<ContentPost>>(`/v1/staff/content/posts${qs({ ...params, limit: 50 })}`),
  getPost: (id: string) => apiClient<ContentPost>(`/v1/staff/content/posts/${id}`),
  createPost: (data: Partial<ContentPost>) => apiClient<ContentPost>("/v1/staff/content/posts", json(data)),
  updatePost: (id: string, data: Partial<ContentPost>) =>
    apiClient<ContentPost>(`/v1/staff/content/posts/${id}`, json(data, "PATCH")),
  deletePost: (id: string) => apiClient(`/v1/staff/content/posts/${id}`, { method: "DELETE" }),
  publishPost: (id: string) => apiClient<ContentPost>(`/v1/staff/content/posts/${id}/publish`, { method: "POST" }),
  unpublishPost: (id: string) => apiClient<ContentPost>(`/v1/staff/content/posts/${id}/unpublish`, { method: "POST" }),
  schedulePost: (id: string, publishAt: string) =>
    apiClient<ContentPost>(`/v1/staff/content/posts/${id}/schedule`, json({ publishAt })),
  getPostRevisions: (id: string) => apiClient<ContentRevision[]>(`/v1/staff/content/posts/${id}/revisions`),
  restoreRevision: (id: string, version: number) =>
    apiClient<ContentPost>(`/v1/staff/content/posts/${id}/restore/${version}`, { method: "POST" }),
  previewLink: (id: string) =>
    apiClient<{ token: string; previewUrl: string; expiresAt: string }>(
      `/v1/staff/content/posts/${id}/preview-link`,
      { method: "POST" },
    ),
  checkContent: (data: { title?: string; bodyMd?: string; excerpt?: string }) =>
    apiClient<{ warnings: { type: string; message: string; detail?: string }[] }>("/v1/staff/content/check", json(data)),
  coverage: () =>
    apiClient<{ rules: { ruleId: string; title: string; occurrences: number; guides: Record<string, string | null> }[]; totalPublished: number }>(
      "/v1/staff/content/coverage",
    ),

  /* ---------- Phase 8: Content Pages ---------- */
  listPages: () => apiClient<ContentPage[]>("/v1/staff/content/pages"),
  getPage: (key: string) => apiClient<ContentPage>(`/v1/staff/content/pages/${key}`),
  savePage: (key: string, data: any, effectiveDate?: string) =>
    apiClient<ContentPage>(`/v1/staff/content/pages/${key}`, json({ data, effectiveDate }, "PUT")),
  publishPage: (key: string, customerNotice?: { notifyAllCustomers: boolean; summary?: string }) =>
    apiClient<ContentPage>(`/v1/staff/content/pages/${key}/publish`, json({ customerNotice })),

  /* ---------- Phase 8: Changelog ---------- */
  listChangelog: (params?: { status?: string }) =>
    apiClient<ChangelogEntry[]>(`/v1/staff/content/changelog${qs(params ?? {})}`),
  createChangelog: (data: Partial<ChangelogEntry>) =>
    apiClient<ChangelogEntry>("/v1/staff/content/changelog", json(data)),
  updateChangelog: (id: string, data: Partial<ChangelogEntry>) =>
    apiClient<ChangelogEntry>(`/v1/staff/content/changelog/${id}`, json(data, "PATCH")),
  deleteChangelog: (id: string) => apiClient(`/v1/staff/content/changelog/${id}`, { method: "DELETE" }),

  /* ---------- Phase 8: Media Library ---------- */
  listMedia: (params?: { q?: string; mime?: string; cursor?: string | null }) =>
    apiFetch<Page<MediaAsset>>(`/v1/staff/media${qs({ ...params, limit: 50 })}`),
  /** Multipart upload: the server checks the real file type, makes WebP/AVIF copies and stores them. */
  uploadMedia: (file: File, meta: { altText?: string; isDecorative: boolean; caption?: string; credit?: string }) => {
    const form = new FormData();
    form.append("file", file);
    if (meta.altText) form.append("altText", meta.altText);
    form.append("isDecorative", String(meta.isDecorative));
    if (meta.caption) form.append("caption", meta.caption);
    if (meta.credit) form.append("credit", meta.credit);
    return apiClient<MediaAsset>("/v1/staff/media", { method: "POST", body: form });
  },
  mediaUsage: (id: string) =>
    apiClient<{ type: string; id: string; title: string }[]>(`/v1/staff/media/${id}/usage`),
  updateMedia: (id: string, data: Partial<MediaAsset>) =>
    apiClient<{ data: MediaAsset }>(`/v1/staff/media/${id}`, json(data, "PATCH")).then((r) => (r as any).data ?? r),
  deleteMedia: (id: string) => apiClient(`/v1/staff/media/${id}`, { method: "DELETE" }),

  /* ---------- Phase 8: Banners ---------- */
  listBanners: (surface?: string) => apiClient<Banner[]>(`/v1/staff/banners${qs({ surface })}`),
  createBanner: (data: Partial<Banner>) => apiClient<Banner>("/v1/staff/banners", json(data)),
  updateBanner: (id: string, data: Partial<Banner>) =>
    apiClient<Banner>(`/v1/staff/banners/${id}`, json(data, "PATCH")),
  deleteBanner: (id: string) => apiClient(`/v1/staff/banners/${id}`, { method: "DELETE" }),

  /* ---------- Phase 8: Site Settings & Deploys ---------- */
  getSettings: () => apiClient<SiteSettings>("/v1/staff/site/settings"),
  updateSettings: (data: Partial<SiteSettings>) =>
    apiClient<SiteSettings>("/v1/staff/site/settings", json(data, "PATCH")),
  listDeploys: (limit = 20) => apiClient<SiteDeploy[]>(`/v1/staff/site/deploys${qs({ limit })}`),
  triggerDeploy: () => apiClient<{ queued: boolean }>("/v1/staff/site/deploys", { method: "POST" }),

  /* ---------- Phase 8: Staff Members ---------- */
  listAuthors: () =>
    apiClient<{ id: string; displayName: string; jobTitle: string | null }[]>("/v1/staff/content/authors"),
  markGuideReviewed: (id: string) => apiClient<ContentPost>(`/v1/staff/content/posts/${id}/review`, { method: "POST" }),
  slugAvailable: (params: { type: string; slug: string; excludeId?: string }) =>
    apiClient<{ available: boolean }>(`/v1/staff/content/posts/slug-available${qs(params)}`),
  listMembers: () => apiClient<StaffMember[]>("/v1/staff/members"),
  createMember: (data: { userId: string; role: StaffRole; displayName?: string; jobTitle?: string; bio?: string }) =>
    apiClient<StaffMember>("/v1/staff/members", json(data)),
  updateMember: (id: string, data: Partial<StaffMember>) =>
    apiClient<StaffMember>(`/v1/staff/members/${id}`, json(data, "PATCH")),
  deleteMember: (id: string) => apiClient(`/v1/staff/members/${id}`, { method: "DELETE" }),

  /* ---------- Phase 8: Customer Additions (Notes, Tags, Timeline, Email, Segments) ---------- */
  notes: (orgId: string) => apiClient<OrgNote[]>(`/v1/staff/orgs/${orgId}/notes`),
  addNote: (orgId: string, bodyMd: string) =>
    apiClient<OrgNote>(`/v1/staff/orgs/${orgId}/notes`, json({ bodyMd })),
  deleteNote: (orgId: string, noteId: string) =>
    apiClient(`/v1/staff/orgs/${orgId}/notes/${noteId}`, { method: "DELETE" }),
  tags: (orgId: string) => apiClient<OrgTag[]>(`/v1/staff/orgs/${orgId}/tags`),
  addTag: (orgId: string, tag: string) =>
    apiClient<{ added: boolean; tag: string }>(`/v1/staff/orgs/${orgId}/tags`, json({ tag })),
  removeTag: (orgId: string, tag: string) =>
    apiClient<{ removed: boolean; tag: string }>(`/v1/staff/orgs/${orgId}/tags/${encodeURIComponent(tag)}`, { method: "DELETE" }),
  timeline: (orgId: string) =>
    apiClient<{ type: string; title: string; description: string; date: string }[]>(`/v1/staff/orgs/${orgId}/timeline`),
  sendEmail: (orgId: string, data: { toEmail: string; template: string; subject: string; bodyMd: string }) =>
    apiClient<StaffEmail>(`/v1/staff/orgs/${orgId}/email`, json(data)),
  segments: () => apiClient<SavedSegment[]>("/v1/staff/segments"),
  saveSegment: (name: string, filterConfig: any) =>
    apiClient<SavedSegment>("/v1/staff/segments", json({ name, filterConfig })),
  deleteSegment: (id: string) => apiClient(`/v1/staff/segments/${id}`, { method: "DELETE" }),
  segmentCsvPath: (id: string) => `/v1/staff/segments/${id}/export.csv`,
  utmLink: (params: { url: string; source: string; medium: string; campaign: string; term?: string; content?: string }) =>
    apiClient<{ taggedUrl: string }>(`/v1/staff/tools/utm${qs(params)}`),
  auditLog: (params: { action?: string; actorType?: string; staffOnly?: boolean; q?: string; cursor?: string | null }) =>
    apiFetch<Page<AuditEntry>>(`/v1/staff/audit${qs({ ...params, limit: 50 })}`),
  auditCsvPath: (params: { action?: string; actorType?: string; staffOnly?: boolean; q?: string }) =>
    `/v1/staff/audit/export.csv${qs(params)}`,
};

/* ---------- Org settings: S-47 API keys, S-51 audit log, S-43 custom domain ---------- */

export const orgSettingsApi = {
  listApiKeys: (org: string) => apiClient<{ keys: ApiKey[] }>(`/v1/orgs/${org}/api-keys`).then((r) => r.keys),
  createApiKey: (org: string, name: string, scopes: string[]) =>
    apiClient<{ key: ApiKey; secret: string }>(`/v1/orgs/${org}/api-keys`, json({ name, scopes })),
  revokeApiKey: (org: string, id: string) => apiClient(`/v1/orgs/${org}/api-keys/${id}`, { method: "DELETE" }),

  auditLog: (org: string, filters: AuditFilters, cursor?: string | null) =>
    apiFetch<{ data: { entries: AuditEntry[] }; nextCursor: string | null }>(
      `/v1/orgs/${org}/audit-log${qs({ ...filters, cursor, limit: 50 })}`,
    ),
  auditActions: (org: string) =>
    apiClient<{ actions: string[] }>(`/v1/orgs/${org}/audit-log/actions`).then((r) => r.actions),
  auditCsvPath: (org: string, filters: AuditFilters) => `/v1/orgs/${org}/audit-log/export.csv${qs({ ...filters })}`,

  customDomain: (org: string) => apiClient<CustomDomainStatus>(`/v1/orgs/${org}/branding/custom-domain`),
  setCustomDomain: (org: string, domain: string) =>
    apiClient<CustomDomainStatus>(`/v1/orgs/${org}/branding/custom-domain`, json({ domain })),
  verifyCustomDomain: (org: string) =>
    apiClient<{ status: "verified"; verifiedAt: string }>(`/v1/orgs/${org}/branding/custom-domain/verify`, {
      method: "POST",
    }),
  removeCustomDomain: (org: string) => apiClient(`/v1/orgs/${org}/branding/custom-domain`, { method: "DELETE" }),
};

/* ---------- S-48 privacy ---------- */

export const privacyApi = {
  requestExport: () =>
    apiClient<{ export: DataExport; message: string }>("/v1/me/export", { method: "POST" }),
  listExports: () => apiClient<{ exports: DataExport[] }>("/v1/me/exports").then((r) => r.exports),
  downloadPath: (id: string) => `/v1/me/exports/${id}/download`,
};

/** Formats integer cents as a currency amount (spec 0.1: money is integer cents). */
export function formatMoney(cents: number, currency = "USD"): string {
  return new Intl.NumberFormat("en-GB", { style: "currency", currency, maximumFractionDigits: 0 }).format(cents / 100);
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${Math.round(n / 1024)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(1)} GB`;
}
