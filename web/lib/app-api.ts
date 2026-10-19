import { apiClient } from "./api";
import type { HistoryKind, Issue, IssueStatus, SiteRow } from "./site-data";
import type { Severity } from "./severity";
import type { TrendPoint } from "./trend";
import type { ScanHistoryItem } from "@/components/site/scans-tab";

/* ---------- API shapes (backend/src/routes) ---------- */

export interface ApiSite {
  id: string;
  orgId: string;
  name: string;
  rootUrl: string;
  platform: string;
  clientName: string | null;
  status: "pending_verification" | "active" | "paused" | "error";
  verifiedAt: string | null;
  scanFrequency: string;
  scanDay: number;
  scanHour: number;
  pageLimit: number;
  standard: string;
  pinnedUrls: string[];
  excludedPaths: string[];
  lastScanId: string | null;
  nextScanAt: string | null;
  score: number | null;
  createdAt: string;
  updatedAt: string;
  // Summary fields from GET /orgs/:orgId/sites
  openCritical?: number;
  openSerious?: number;
  regressions?: number;
  lastScanAt?: string | null;
  lastScanStatus?: string | null;
  lastScanError?: string | null;
  previousScore?: number | null;
}

export interface ApiIssue {
  id: string;
  siteId: string;
  ruleId: string;
  title: string;
  description: string | null;
  whoIsAffected?: string | null;
  helpUrl?: string | null;
  impact: Severity;
  wcagCriteria: string[];
  wcagLevel: string;
  templateKey: string;
  selector: string;
  htmlSnippet: string | null;
  failureSummary: string | null;
  status: "open" | "fixed" | "ignored";
  ignoredReason: string | null;
  ignoredNote: string | null;
  isRegression: boolean;
  occurrenceCount: number;
  assigneeId: string | null;
  assigneeName: string | null;
  dueDate: string | null;
  needsReview: boolean;
  fixedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ApiIssueList {
  items: ApiIssue[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  facets: { severityCounts: Record<Severity, number>; templates: { templateKey: string; count: number }[] };
}

export interface ApiOccurrence {
  id: string;
  url: string;
  templateKey: string;
  target: string;
}

export interface ApiIssueEvent {
  id: string;
  type: string;
  actorName: string | null;
  data: Record<string, unknown>;
  createdAt: string;
}

export interface ApiNote {
  id: string;
  authorId: string | null;
  authorName: string | null;
  body: string;
  visibleToClient: boolean;
  createdAt: string;
}

export interface ApiMember {
  userId: string;
  email: string;
  name: string;
  role: string;
}

export interface ApiSiteDetail {
  site: ApiSite;
  score: number | null;
  scoreBand: string | null;
  scoreExplanation: string | null;
  trend: TrendPoint[];
  trendSummary: string;
  topIssues: ApiIssue[];
  severityCounts: Record<Severity, number>;
  diffSummary: { newCount: number; fixedCount: number; regressedCount: number; sinceLabel: string | null };
  recentlyFixed: Array<{ id: string; title: string; templateKey?: string; fixedAt: string | null }>;
  coverage: {
    pagesScanned: number;
    pagesPlanned: number;
    templatesFound: number;
    standard: string;
    nextScanAt: string | null;
    nextScanFormatted: string | null;
  };
  latestScanSummary: { scanId: string; score: number | null; status: string; finishedAt?: string | null } | null;
}

export interface ApiUsage {
  plan: string;
  planName: string;
  limits: {
    maxSites: number;
    maxPagesPerScan: number;
    manualScansPerDayPerSite: number;
    scheduledFrequency: string;
    maxDailySites: number;
    teamMembers: number;
    clientViewers: number;
    retentionMonths: number;
    aiSuggestionsMonthly: number;
  };
  usage: {
    sites: number;
    dailySites: number;
    teamMembers: number;
    clientViewers: number;
    aiSuggestionsThisMonth: number;
  };
  features: {
    regressionAlerts: boolean;
    slackWebhook: boolean;
    whiteLabel: boolean;
    customDomain: boolean;
    scheduledClientReports: boolean;
    evidencePack: boolean;
    publicApi: boolean;
  };
}

export interface ApiSubscription {
  id: string;
  priceId: string;
  plan: string;
  interval: string;
  status: string;
  currentPeriodStart?: string | null;
  currentPeriodEnd?: string | null;
  cancelAtPeriodEnd: boolean;
  scheduledChange?: Record<string, unknown> | null;
}

export interface ApiInvoice {
  id: string;
  paddleTransactionId: string;
  amountCents: number;
  currency: string;
  status: string;
  billedAt: string;
  invoiceUrl: string | null;
}

export interface ApiBillingInfo {
  plan: string;
  planName: string;
  billingStatus: string;
  trialEndsAt?: string | null;
  paddleCustomerId?: string | null;
  subscription: ApiSubscription | null;
  period: {
    currentPeriodStart: string | null;
    currentPeriodEnd: string | null;
  };
  cancelAtPeriodEnd: boolean;
  usage: {
    sites: { current: number; limit: number };
    teamMembers: { current: number; limit: number };
    aiSuggestions: { current: number; limit: number };
  };
  customerPortalUrl: string | null;
  invoices: ApiInvoice[];
}

export interface ApiCheckoutSettings {
  priceId: string;
  plan?: string;
  interval: string;
  customerEmail: string;
  customData: {
    orgId: string;
  };
  paddleEnvironment: string;
  clientToken: string;
}

export interface ApiPlanChangePreview {
  preview: boolean;
  isUpgrade: boolean;
  isDowngrade: boolean;
  currentPlan: string;
  targetPlan: string;
  targetInterval: 'month' | 'year';
  priceId: string;
  price: number;
  proration: 'immediate_prorated' | 'next_period';
  estimatedProratedCents: number;
  effectiveDate: string | null;
  requiresPause: boolean;
  excessSites: number;
  excessMembers: number;
  activeSites: Array<{ id: string; name: string; rootUrl: string; score?: number | null }>;
  members: Array<{ userId: string; email?: string; role: string }>;
}

/* ---------- Formatting ---------- */

const DAY = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short" });
const DAY_TIME = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "short",
  hour: "2-digit",
  minute: "2-digit",
});

export function formatDay(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : DAY.format(d);
}

export function formatDayTime(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? "—" : DAY_TIME.format(d);
}

export function initials(name: string | null | undefined): string | undefined {
  if (!name) return undefined;
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

const IGNORE_REASON_LABEL: Record<string, string> = {
  false_positive: "False positive",
  not_applicable: "Not applicable",
  wont_fix: "Won’t fix",
  accepted_risk: "Accepted risk",
};

export const IGNORE_REASON_VALUE: Record<string, string> = Object.fromEntries(
  Object.entries(IGNORE_REASON_LABEL).map(([value, label]) => [label, value]),
);

const PLATFORM_LABEL: Record<string, string> = {
  shopify: "Shopify",
  wordpress: "WordPress",
  woocommerce: "WooCommerce",
  webflow: "Webflow",
  wix: "Wix",
  squarespace: "Squarespace",
  custom: "Custom",
  unknown: "Other",
};

export function platformLabel(platform: string | null | undefined): string {
  return PLATFORM_LABEL[platform ?? "unknown"] ?? platform ?? "Other";
}

/* ---------- Mappers to the shapes the UI renders ---------- */

function issueStatus(api: Pick<ApiIssue, "status" | "isRegression" | "needsReview">): IssueStatus {
  if (api.status !== "open") return api.status;
  if (api.isRegression) return "regressed";
  if (api.needsReview) return "needsReview";
  return "open";
}

export function toIssue(api: ApiIssue, extra: Partial<Issue> = {}): Issue {
  const wcag = api.wcagCriteria.length
    ? `${api.wcagCriteria.join(", ")} (Level ${api.wcagLevel})`
    : "";
  return {
    id: api.id,
    siteId: api.siteId,
    rule: api.ruleId,
    sev: api.impact,
    title: api.title,
    template: api.templateKey,
    occ: api.occurrenceCount,
    pages: api.occurrenceCount,
    status: issueStatus(api),
    assignee: initials(api.assigneeName),
    assigneeName: api.assigneeName ?? undefined,
    assigneeId: api.assigneeId,
    due: api.dueDate ? `Due ${formatDay(api.dueDate)}` : undefined,
    dueDate: api.dueDate,
    wcag,
    wcagCriteria: api.wcagCriteria,
    first: formatDay(api.createdAt),
    last: formatDay(api.updatedAt),
    who: api.whoIsAffected ?? "",
    why: api.description ?? "",
    occs: [],
    snippet: api.htmlSnippet ?? "",
    axe: api.failureSummary ?? "",
    steps: [],
    code: "",
    gen: "",
    check: "",
    ignoreReason: api.ignoredReason ? IGNORE_REASON_LABEL[api.ignoredReason] : undefined,
    ...extra,
  };
}

const EVENT_KIND: Record<string, HistoryKind> = {
  created: "found",
  fixed: "ok",
  regressed: "reg",
  ignored: "eye",
  unignored: "user",
  assigned: "user",
  due_date_set: "user",
  note_added: "user",
  rechecked: "found",
};

function eventLabel(event: ApiIssueEvent): string {
  const d = event.data;
  switch (event.type) {
    case "created":
      return "First found";
    case "fixed":
      return "Fixed";
    case "regressed":
      return "Came back (regressed)";
    case "ignored":
      return `Ignored: ${IGNORE_REASON_LABEL[String(d.reason)] ?? "no reason given"}`;
    case "unignored":
      return "Reopened";
    case "assigned":
      return d.assigneeName ? `Assigned to ${String(d.assigneeName)}` : "Assignment changed";
    case "due_date_set":
      return d.dueDate ? `Due date set to ${formatDay(String(d.dueDate))}` : "Due date cleared";
    case "note_added":
      return "Note added";
    case "rechecked":
      return d.outcome === "fixed"
        ? "Recheck: fixed"
        : d.outcome === "still_open"
          ? "Recheck: still there"
          : "Recheck: pages could not be loaded";
    default:
      return event.type;
  }
}

export function toHistory(events: ApiIssueEvent[]): [HistoryKind, string, string][] {
  return events.map((event) => [
    EVENT_KIND[event.type] ?? "user",
    eventLabel(event),
    [event.actorName, formatDayTime(event.createdAt)].filter(Boolean).join(" · "),
  ]);
}

export function toSiteRow(site: ApiSite): SiteRow {
  const delta =
    site.score !== null && site.previousScore != null ? site.score - site.previousScore : null;
  const failed = site.lastScanStatus === "failed";
  return {
    id: site.id,
    name: site.name,
    url: site.rootUrl.replace(/^https?:\/\//, "").replace(/\/$/, ""),
    client: site.clientName ?? "",
    platform: platformLabel(site.platform),
    score: site.score,
    crit: site.openCritical ?? 0,
    ser: site.openSerious ?? 0,
    regressions: site.regressions ?? 0,
    delta: delta === null ? "—" : delta > 0 ? `Up ${delta}` : delta < 0 ? `Down ${-delta}` : "No change",
    dir: delta === null || delta === 0 ? 0 : delta > 0 ? 1 : -1,
    last: site.lastScanAt
      ? `${failed ? "Failed " : ""}${formatDay(site.lastScanAt)}`
      : "Not scanned yet",
    lastScanAt: site.lastScanAt ? new Date(site.lastScanAt).getTime() : undefined,
    nextScan:
      site.status === "paused"
        ? "Paused"
        : site.nextScanAt
          ? formatDayTime(site.nextScanAt)
          : site.scanFrequency === "manual"
            ? "Manual only"
            : "—",
    status: site.status === "paused" ? "Paused" : site.status === "error" || failed ? "Error" : "Active",
    verified: site.status !== "pending_verification",
    reason: failed
      ? `Scan failed${site.lastScanError ? `: ${site.lastScanError}` : ""}`
      : (site.regressions ?? 0) > 0
        ? `${site.regressions} ${site.regressions === 1 ? "regression" : "regressions"}`
        : site.status === "pending_verification"
          ? "Waiting for ownership verification"
          : "",
  };
}

/* ---------- Requests ---------- */

const json = (body: unknown): RequestInit => ({ method: "POST", body: JSON.stringify(body) });

export const appApi = {
  listSites: (org: string, params: Record<string, string> = {}) =>
    apiClient<{ sites: ApiSite[] }>(
      `/v1/orgs/${org}/sites${Object.keys(params).length ? `?${new URLSearchParams(params)}` : ""}`,
    ).then((r) => r.sites),

  getSite: (org: string, siteId: string) => apiClient<ApiSiteDetail>(`/v1/orgs/${org}/sites/${siteId}`),

  listIssues: (org: string, siteId: string, query: URLSearchParams) =>
    apiClient<ApiIssueList>(`/v1/orgs/${org}/sites/${siteId}/issues?${query}`),

  getIssue: (org: string, issueId: string) =>
    apiClient<{ issue: ApiIssue }>(`/v1/orgs/${org}/issues/${issueId}`).then((r) => r.issue),

  listOccurrences: (org: string, issueId: string) =>
    apiClient<{ items: ApiOccurrence[]; total: number }>(
      `/v1/orgs/${org}/issues/${issueId}/occurrences?limit=100`,
    ),

  listEvents: (org: string, issueId: string) =>
    apiClient<{ items: ApiIssueEvent[] }>(`/v1/orgs/${org}/issues/${issueId}/events`).then(
      (r) => r.items,
    ),

  listNotes: (org: string, issueId: string) =>
    apiClient<{ items: ApiNote[] }>(`/v1/orgs/${org}/issues/${issueId}/notes`).then((r) => r.items),

  addNote: (org: string, issueId: string, body: string, visibleToClient: boolean) =>
    apiClient<{ note: ApiNote }>(
      `/v1/orgs/${org}/issues/${issueId}/notes`,
      json({ body, visibleToClient }),
    ).then((r) => r.note),

  ignore: (org: string, issueId: string, reason: string, note?: string) =>
    apiClient(`/v1/orgs/${org}/issues/${issueId}/ignore`, json({ reason, note })),

  unignore: (org: string, issueId: string) =>
    apiClient(`/v1/orgs/${org}/issues/${issueId}/unignore`, json({})),

  assign: (org: string, issueId: string, assigneeId: string | null) =>
    apiClient(`/v1/orgs/${org}/issues/${issueId}/assign`, {
      method: "PATCH",
      body: JSON.stringify({ assigneeId }),
    }),

  setDueDate: (org: string, issueId: string, dueDate: string | null) =>
    apiClient(`/v1/orgs/${org}/issues/${issueId}/due-date`, {
      method: "PATCH",
      body: JSON.stringify({ dueDate }),
    }),

  bulk: (
    org: string,
    body: {
      issueIds: string[];
      action: "ignore" | "unignore" | "assign" | "set_due_date";
      data?: { reason?: string; note?: string; assigneeId?: string | null; dueDate?: string | null };
    },
  ) =>
    apiClient<{ updated: number }>(`/v1/orgs/${org}/issues/bulk`, json(body)),

  recheck: (org: string, issueId: string) =>
    apiClient<{ jobId: string | null }>(`/v1/orgs/${org}/issues/${issueId}/recheck`, json({})),

  listMembers: (org: string) =>
    apiClient<{ members: ApiMember[] }>(`/v1/orgs/${org}/members`).then((r) => r.members),

  listScans: (org: string, siteId: string) =>
    apiClient<{ scans: ScanHistoryItem[] }>(`/v1/orgs/${org}/sites/${siteId}/scans?limit=50`).then(
      (r) => r.scans,
    ),

  startScan: (org: string, siteId: string, trigger: "manual" | "onboarding" = "manual") =>
    apiClient<{ scan: { id: string } }>(`/v1/orgs/${org}/sites/${siteId}/scans`, json({ trigger })).then(
      (r) => r.scan,
    ),

  getUsage: (org: string) => apiClient<ApiUsage>(`/v1/orgs/${org}/usage`),

  getBilling: (org: string) => apiClient<ApiBillingInfo>(`/v1/orgs/${org}/billing`),

  createCheckoutSession: (
    org: string,
    params: { plan?: string; interval?: 'month' | 'year'; priceId?: string },
  ) =>
    apiClient<ApiCheckoutSettings>(`/v1/orgs/${org}/billing/checkout`, json(params)),

  previewPlanChange: (
    org: string,
    params: { plan: string; interval?: 'month' | 'year' },
  ) =>
    apiClient<{ data: ApiPlanChangePreview }>(
      `/v1/orgs/${org}/billing/change-plan`,
      json({ ...params, preview: true }),
    ).then((r) => r.data),

  changePlan: (
    org: string,
    params: {
      plan: string;
      interval?: 'month' | 'year';
      pauseSiteIds?: string[];
      removeMemberIds?: string[];
      effectiveNow?: boolean;
    },
  ) =>
    apiClient<{
      data: {
        success: boolean;
        plan: string;
        interval: string;
        isUpgrade: boolean;
        isDowngrade: boolean;
        scheduled: boolean;
        effectiveDate?: string | null;
      };
    }>(`/v1/orgs/${org}/billing/change-plan`, json(params)).then((r) => r.data),

  cancelSubscription: (org: string, params?: { reason?: string; feedback?: string } | string) => {
    const payload = typeof params === 'string' ? { reason: params } : (params ?? {});
    return apiClient<{
      data?: { success: boolean; cancelAtPeriodEnd: boolean; message: string; effectiveAt?: string | null };
      success?: boolean;
      cancelAtPeriodEnd?: boolean;
      message?: string;
    }>(`/v1/orgs/${org}/billing/cancel`, json(payload));
  },

  resumeSubscription: (org: string) =>
    apiClient<{
      data?: { success: boolean; cancelAtPeriodEnd: boolean; message: string };
      success?: boolean;
      cancelAtPeriodEnd?: boolean;
      message?: string;
    }>(`/v1/orgs/${org}/billing/resume`, json({})),

  pauseSite: (org: string, siteId: string) =>
    apiClient<{ data: { site: ApiSite } }>(`/v1/orgs/${org}/sites/${siteId}/pause`, json({})).then(
      (r) => r.data.site,
    ),

  resumeSite: (org: string, siteId: string) =>
    apiClient<{ data: { site: ApiSite } }>(`/v1/orgs/${org}/sites/${siteId}/resume`, json({})).then(
      (r) => r.data.site,
    ),

  getInvoices: (org: string) =>
    apiClient<{ invoices: ApiInvoice[] }>(`/v1/orgs/${org}/invoices`).then((r) => r.invoices),

  getCustomerPortalUrl: (org: string) =>
    apiClient<{ url: string }>(`/v1/orgs/${org}/billing/portal`).then((r) => r.url),

  getBranding: (org: string) =>
    apiClient<{ data: ApiBranding }>(`/v1/orgs/${org}/branding`).then((r) => r.data),

  updateBranding: (org: string, payload: Partial<ApiBranding>) =>
    apiClient<{ data: ApiBranding }>(`/v1/orgs/${org}/branding`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }).then((r) => r.data),

  checkContrast: (org: string, color: string) =>
    apiClient<{ data: ApiContrastCheck }>(`/v1/orgs/${org}/branding/check-contrast`, json({ color })).then(
      (r) => r.data,
    ),

  uploadLogo: (org: string, type: "light" | "dark", dataUrl: string) =>
    apiClient<{ data: { success: boolean; key: string; logoType: string } }>(
      `/v1/orgs/${org}/branding/logo`,
      json({ type, dataUrl }),
    ).then((r) => r.data),

  deleteLogo: (org: string, type: "light" | "dark") =>
    apiClient<{ data: { success: boolean } }>(`/v1/orgs/${org}/branding/logo/${type}`, {
      method: "DELETE",
    }).then((r) => r.data),
};

export interface ApiBranding {
  id?: string;
  orgId: string;
  displayName: string | null;
  primaryColor: string;
  logoLightKey: string | null;
  logoDarkKey: string | null;
  emailSenderName: string | null;
  reportFooter: string | null;
  hidePlainsightBranding: boolean;
  customDomain: string | null;
  customDomainVerified: boolean;
  contrastRatio?: number;
}

export interface ApiContrastCheck {
  color: string;
  contrastRatio: number;
  meetsWcagAa: boolean;
  suggestedAlternative: string;
}

export type RecheckOutcome = "fixed" | "still_open" | "unchecked";

/**
 * Queues issue.recheck for each issue, then polls the timeline until the worker records an
 * outcome for each one or the timeout passes. Missing ids in the result are still running.
 */
export async function recheckAndWait(
  org: string,
  ids: string[],
  { pollMs = 3_000, timeoutMs = 150_000 } = {},
): Promise<Map<string, RecheckOutcome>> {
  const startedAt = Date.now();
  await Promise.all(ids.map((id) => appApi.recheck(org, id)));
  const outcomes = new Map<string, RecheckOutcome>();
  while (outcomes.size < ids.length && Date.now() - startedAt < timeoutMs) {
    await new Promise((resolve) => setTimeout(resolve, pollMs));
    for (const id of ids) {
      if (outcomes.has(id)) continue;
      const events = await appApi.listEvents(org, id).catch(() => []);
      const done = events.find(
        (e) => e.type === "rechecked" && new Date(e.createdAt).getTime() >= startedAt - 5_000,
      );
      if (done) outcomes.set(id, done.data.outcome as RecheckOutcome);
    }
  }
  return outcomes;
}

export function recheckMessage(outcomes: Map<string, RecheckOutcome>, total: number): string {
  if (outcomes.size < total) {
    return "The recheck is taking longer than expected. Results will appear when it finishes.";
  }
  if (total === 1) {
    const [outcome] = outcomes.values();
    return outcome === "fixed"
      ? "Fixed — the problem no longer appears on the checked pages."
      : outcome === "still_open"
        ? "Still there — the problem was found again on the checked pages."
        : "We couldn’t load the pages to check. Try again later.";
  }
  const fixed = [...outcomes.values()].filter((o) => o === "fixed").length;
  return `Recheck finished: ${fixed} of ${total} fixed.`;
}

/** Loads an issue with its occurrences and timeline (S-26 drawer and full page). */
export async function loadIssue(org: string, issueId: string): Promise<Issue> {
  const [issue, occurrences, events] = await Promise.all([
    appApi.getIssue(org, issueId),
    appApi.listOccurrences(org, issueId),
    appApi.listEvents(org, issueId),
  ]);
  return toIssue(issue, {
    occs: occurrences.items.map((o) => [o.url, o.target] as [string, string]),
    pages: new Set(occurrences.items.map((o) => o.url)).size || issue.occurrenceCount,
    history: toHistory(events),
  });
}
