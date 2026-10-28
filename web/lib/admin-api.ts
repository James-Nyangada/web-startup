import { apiClient, apiFetch } from "./api";

/* ---------- Shapes (backend/src/routes/staff.ts, api-keys.ts, orgs.ts, branding.ts, me.ts) ---------- */

export interface StaffSession {
  email: string;
  totpEnrolled: boolean;
  verified: boolean;
  verifiedAt: string | null;
  impersonatingOrgId: string | null;
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

/* ---------- Staff (S-70 – S-75) ---------- */

export const staffApi = {
  session: () => apiClient<StaffSession>("/v1/staff/session"),
  enroll: () => apiClient<{ secret: string; otpauthUrl: string }>("/v1/staff/totp/enroll", { method: "POST" }),
  confirm: (code: string) => apiClient<{ verified: boolean }>("/v1/staff/totp/confirm", json({ code })),
  verify: (code: string) => apiClient<{ verified: boolean }>("/v1/staff/totp/verify", json({ code })),

  listOrgs: (params: { q?: string; plan?: string; status?: string; includeDeleted?: boolean; cursor?: string | null }) =>
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
