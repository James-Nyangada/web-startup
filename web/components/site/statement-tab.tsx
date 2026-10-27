"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { Icon, I } from "@/components/icons";
import { apiClient } from "@/lib/api";

export interface StatementLimitation {
  issueId?: string;
  title: string;
  description: string;
  workaround?: string;
}

export interface StatementFeedbackContact {
  email: string;
  phone?: string;
  address?: string;
  responseTime?: string;
}

export interface StatementEnforcement {
  bodyName?: string;
  contactUrl?: string;
  description?: string;
}

export type ConformanceStatus =
  "fully_conformant" | "partially_conformant" | "non_conformant";

export interface StatementData {
  orgName: string;
  siteName: string;
  siteUrl: string;
  scope: string;
  targetStandard: string;
  conformanceStatus: ConformanceStatus;
  measuresTaken: string[];
  knownLimitations: StatementLimitation[];
  feedbackContact: StatementFeedbackContact;
  enforcementProcedure?: StatementEnforcement;
  statementDate: string;
}

export interface StatementRecord {
  id: string;
  orgId: string;
  siteId: string;
  version: number;
  status: "draft" | "published";
  data: StatementData;
  renderedHtml: string | null;
  publishedAt: string | null;
  publishedBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface StatementTabProps {
  orgSlug: string;
  siteId: string;
  siteName?: string;
  siteUrl?: string;
  onToast?: (msg: string) => void;
}

const DEFAULT_MEASURES = [
  "Include accessibility as a core requirement across our digital development workflows",
  "Conduct regular automated scans and periodic manual assistive technology testing",
  "Provide accessibility guidelines and training for content creators and engineers",
  "Maintain a clear feedback mechanism for visitors to report barriers",
  "Design with accessible contrast ratios, semantic markup, and keyboard focus indicators",
];

const STANDARD_OPTIONS = [
  "WCAG 2.2 Level AA",
  "WCAG 2.1 Level AA",
  "EN 301 549 (v3.2.1)",
  "Section 508",
];

const STEPS = [
  { step: 1, label: "Scope & Details", icon: "check" },
  { step: 2, label: "Standard & Measures", icon: "audit" },
  { step: 3, label: "Known Limitations", icon: "alert" },
  { step: 4, label: "Feedback & Contact", icon: "settings" },
  { step: 5, label: "Enforcement (EU / Public)", icon: "plus" },
  { step: 6, label: "Review & Publish", icon: "check" },
] as const;

export function StatementTab({
  orgSlug,
  siteId,
  siteName = "Website",
  siteUrl = "",
  onToast,
}: StatementTabProps) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [statement, setStatement] = useState<StatementRecord | null>(null);
  const [versions, setVersions] = useState<StatementRecord[]>([]);
  const [showVersionsModal, setShowVersionsModal] = useState(false);

  const [currentStep, setCurrentStep] = useState<number>(1);
  const [activeTab, setActiveTab] = useState<"editor" | "preview">("editor");

  // Form State
  const [orgName, setOrgName] = useState("");
  const [name, setName] = useState(siteName);
  const [url, setUrl] = useState(siteUrl || "https://example.com");
  const [scope, setScope] = useState("");
  const [targetStandard, setTargetStandard] = useState("WCAG 2.2 Level AA");
  const [conformanceStatus, setConformanceStatus] = useState<ConformanceStatus>(
    "partially_conformant",
  );
  const [measuresTaken, setMeasuresTaken] = useState<string[]>([
    DEFAULT_MEASURES[0],
    DEFAULT_MEASURES[1],
    DEFAULT_MEASURES[4],
  ]);
  const [newMeasureText, setNewMeasureText] = useState("");

  const [knownLimitations, setKnownLimitations] = useState<
    StatementLimitation[]
  >([]);
  const [openIssues, setOpenIssues] = useState<
    Array<{ id: string; title: string; impact: string }>
  >([]);
  const [loadingIssues, setLoadingIssues] = useState(false);

  const [contactEmail, setContactEmail] = useState("");
  const [contactPhone, setContactPhone] = useState("");
  const [contactAddress, setContactAddress] = useState("");
  const [responseTime, setResponseTime] = useState(
    "Within 2 to 3 business days",
  );

  const [bodyName, setBodyName] = useState("");
  const [contactUrl, setContactUrl] = useState("");
  const [enforcementDesc, setEnforcementDesc] = useState("");

  const [statementDate, setStatementDate] = useState(
    new Date().toISOString().split("T")[0]!,
  );

  const [embedCode, setEmbedCode] = useState<string>("");
  const [publicUrl, setPublicUrl] = useState<string>("");
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // New limitation inputs
  const [newLimTitle, setNewLimTitle] = useState("");
  const [newLimDesc, setNewLimDesc] = useState("");
  const [newLimWorkaround, setNewLimWorkaround] = useState("");

  const previewFrameRef = useRef<HTMLIFrameElement | null>(null);

  // Fetch statement data
  const loadStatement = async () => {
    setLoading(true);
    setError(null);
    try {
      const [latestRes, listRes] = await Promise.all([
        apiClient<{ statement: StatementRecord | null }>(
          `/v1/orgs/${orgSlug}/sites/${siteId}/statements/latest`,
        ),
        apiClient<{ items: StatementRecord[] }>(
          `/v1/orgs/${orgSlug}/sites/${siteId}/statements`,
        ),
      ]);

      setVersions(listRes.items || []);

      if (latestRes.statement) {
        const s = latestRes.statement;
        setStatement(s);
        const d = s.data;
        setOrgName(d.orgName || "");
        setName(d.siteName || siteName);
        setUrl(d.siteUrl || siteUrl);
        setScope(d.scope || "");
        setTargetStandard(d.targetStandard || "WCAG 2.2 Level AA");
        setConformanceStatus(d.conformanceStatus || "partially_conformant");
        setMeasuresTaken(d.measuresTaken || []);
        setKnownLimitations(d.knownLimitations || []);
        setContactEmail(d.feedbackContact?.email || "");
        setContactPhone(d.feedbackContact?.phone || "");
        setContactAddress(d.feedbackContact?.address || "");
        setResponseTime(
          d.feedbackContact?.responseTime || "Within 2 to 3 business days",
        );
        if (d.enforcementProcedure) {
          setBodyName(d.enforcementProcedure.bodyName || "");
          setContactUrl(d.enforcementProcedure.contactUrl || "");
          setEnforcementDesc(d.enforcementProcedure.description || "");
        }
        setStatementDate(
          d.statementDate || new Date().toISOString().split("T")[0]!,
        );

        const pubUrl = `${window.location.origin}/s/${siteId}/accessibility-statement`;
        setPublicUrl(pubUrl);
        setEmbedCode(
          `<!-- Accessibility Statement Link -->\n<a href="${pubUrl}" target="_blank" rel="noopener noreferrer" aria-label="Accessibility Statement for ${d.siteName} (opens in a new tab)">Accessibility Statement</a>`,
        );
      } else {
        // Defaults
        setName(siteName);
        setUrl(
          siteUrl ||
            (typeof window !== "undefined" ? window.location.origin : ""),
        );
      }
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to load statement";
      setError(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStatement();
  }, [orgSlug, siteId]);

  // Load open issues for limitation pre-fill
  useEffect(() => {
    let cancelled = false;
    setLoadingIssues(true);
    apiClient<{ issues: Array<{ id: string; title: string; impact: string }> }>(
      `/v1/orgs/${orgSlug}/sites/${siteId}/issues?status=open&limit=30`,
    )
      .then((res) => {
        if (!cancelled && res?.issues) {
          setOpenIssues(res.issues);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setLoadingIssues(false);
      });
    return () => {
      cancelled = true;
    };
  }, [orgSlug, siteId]);

  const formData: StatementData = useMemo(() => {
    return {
      orgName: orgName.trim() || "Organisation",
      siteName: name.trim() || siteName,
      siteUrl: url.trim() || "https://example.com",
      scope: scope.trim(),
      targetStandard,
      conformanceStatus,
      measuresTaken,
      knownLimitations,
      feedbackContact: {
        email: contactEmail.trim(),
        phone: contactPhone.trim() || undefined,
        address: contactAddress.trim() || undefined,
        responseTime: responseTime.trim() || undefined,
      },
      enforcementProcedure: bodyName.trim()
        ? {
            bodyName: bodyName.trim(),
            contactUrl: contactUrl.trim() || undefined,
            description: enforcementDesc.trim() || undefined,
          }
        : undefined,
      statementDate,
    };
  }, [
    orgName,
    name,
    siteName,
    url,
    scope,
    targetStandard,
    conformanceStatus,
    measuresTaken,
    knownLimitations,
    contactEmail,
    contactPhone,
    contactAddress,
    responseTime,
    bodyName,
    contactUrl,
    enforcementDesc,
    statementDate,
  ]);

  const conformanceDescription = useMemo(() => {
    switch (conformanceStatus) {
      case "fully_conformant":
        return `The website fully conforms to ${targetStandard} without exceptions.`;
      case "partially_conformant":
        return `The website partially conforms to ${targetStandard}. Some parts of the content do not fully conform to the standard, as detailed in the known limitations below.`;
      case "non_conformant":
        return `The website does not yet conform to ${targetStandard}. Significant barriers are currently being remediated.`;
    }
  }, [conformanceStatus, targetStandard]);

  const conformanceBadgeClass = useMemo(() => {
    switch (conformanceStatus) {
      case "fully_conformant":
        return "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700";
      case "partially_conformant":
        return "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700";
      case "non_conformant":
        return "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-700";
    }
  }, [conformanceStatus]);

  const handleSaveDraft = async () => {
    if (!orgName.trim() || !contactEmail.trim()) {
      onToast?.("Please provide an organisation name and contact email.");
      return;
    }
    setSaving(true);
    try {
      if (statement && statement.status === "draft") {
        const res = await apiClient<{ statement: StatementRecord }>(
          `/v1/orgs/${orgSlug}/sites/${siteId}/statements/${statement.id}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: formData }),
          },
        );
        setStatement(res.statement);
        onToast?.("Draft saved successfully.");
      } else {
        const res = await apiClient<{ statement: StatementRecord }>(
          `/v1/orgs/${orgSlug}/sites/${siteId}/statements`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: formData }),
          },
        );
        setStatement(res.statement);
        onToast?.("New statement draft created.");
      }
      loadStatement();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to save draft";
      onToast?.(msg);
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!orgName.trim() || !contactEmail.trim()) {
      onToast?.("Organisation name and contact email are required to publish.");
      return;
    }
    setPublishing(true);
    try {
      // 1. Ensure draft is up to date or created
      let targetId = statement?.id;
      if (!targetId || statement?.status !== "draft") {
        const createRes = await apiClient<{ statement: StatementRecord }>(
          `/v1/orgs/${orgSlug}/sites/${siteId}/statements`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: formData }),
          },
        );
        targetId = createRes.statement.id;
      } else {
        await apiClient(
          `/v1/orgs/${orgSlug}/sites/${siteId}/statements/${targetId}`,
          {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ data: formData }),
          },
        );
      }

      // 2. Publish
      const pubRes = await apiClient<{
        statement: StatementRecord;
        embedSnippet: string;
        publicUrl: string;
      }>(`/v1/orgs/${orgSlug}/sites/${siteId}/statements/${targetId}/publish`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });

      setStatement(pubRes.statement);
      setEmbedCode(pubRes.embedSnippet);
      setPublicUrl(pubRes.publicUrl);
      onToast?.("Accessibility statement published successfully!");
      loadStatement();
    } catch (err: unknown) {
      const msg =
        err instanceof Error ? err.message : "Failed to publish statement";
      onToast?.(msg);
    } finally {
      setPublishing(false);
    }
  };

  const handleAddMeasure = () => {
    if (!newMeasureText.trim()) return;
    if (!measuresTaken.includes(newMeasureText.trim())) {
      setMeasuresTaken([...measuresTaken, newMeasureText.trim()]);
    }
    setNewMeasureText("");
  };

  const handleRemoveMeasure = (idx: number) => {
    setMeasuresTaken(measuresTaken.filter((_, i) => i !== idx));
  };

  const handleAddLimitation = () => {
    if (!newLimTitle.trim() || !newLimDesc.trim()) return;
    setKnownLimitations([
      ...knownLimitations,
      {
        title: newLimTitle.trim(),
        description: newLimDesc.trim(),
        workaround: newLimWorkaround.trim() || undefined,
      },
    ]);
    setNewLimTitle("");
    setNewLimDesc("");
    setNewLimWorkaround("");
  };

  const handleImportIssue = (issue: { id: string; title: string }) => {
    if (knownLimitations.some((k) => k.issueId === issue.id)) {
      onToast?.("This issue is already listed in limitations.");
      return;
    }
    setKnownLimitations([
      ...knownLimitations,
      {
        issueId: issue.id,
        title: issue.title,
        description: `Identified issue: ${issue.title}. Remediation is scheduled in the ongoing development sprint.`,
        workaround:
          "If you experience difficulty accessing this content, please contact us for an alternative format.",
      },
    ]);
    onToast?.(`Imported "${issue.title}" into limitations.`);
  };

  const handleRemoveLimitation = (idx: number) => {
    setKnownLimitations(knownLimitations.filter((_, i) => i !== idx));
  };

  const handleCopySnippet = async () => {
    try {
      await navigator.clipboard.writeText(embedCode);
      setCopiedSnippet(true);
      setTimeout(() => setCopiedSnippet(false), 2000);
      onToast?.("Embed snippet copied to clipboard.");
    } catch {
      onToast?.("Failed to copy embed snippet.");
    }
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center text-sm text-muted">
        <span className="mr-2 inline-block h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
        Loading accessibility statement...
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Notice Banner */}
      <div
        className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50/60 p-4 text-xs text-amber-900 dark:border-amber-900/40 dark:bg-amber-950/20 dark:text-amber-200"
        role="region"
        aria-label="Legal Notice"
      >
        <span className="mt-0.5 text-amber-600 dark:text-amber-400">
          <Icon d={I.alert} size={16} />
        </span>
        <div className="space-y-1">
          <p className="font-semibold">
            Accessibility Statement Template (Not Legal Advice)
          </p>
          <p className="text-amber-800/90 dark:text-amber-300/80">
            This generator helps you build a standard-aligned accessibility
            statement detailing your conformance status, organizational
            measures, known limitations, and feedback mechanisms. It does not
            constitute formal legal counsel. In conformance status terminology,
            we avoid guarantees of absolute compliance.
          </p>
        </div>
      </div>

      {/* Header with Status and Action Buttons */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-line pb-4">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold tracking-tight text-foreground">
              Accessibility Statement
            </h2>
            {statement?.status === "published" ? (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-medium text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" />
                Published v{statement.version}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-raised px-2.5 py-0.5 text-xs font-medium text-muted">
                <span className="h-1.5 w-1.5 rounded-full bg-muted" />
                Draft
              </span>
            )}
          </div>
          <p className="mt-1 text-xs text-muted">
            Provide a transparent declaration of your website&apos;s
            accessibility commitment, standard target, known limitations, and
            contact procedures.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {versions.length > 1 && (
            <button
              type="button"
              onClick={() => setShowVersionsModal(true)}
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <Icon d={I.audit} size={14} />
              Version History ({versions.length})
            </button>
          )}

          {statement?.status === "published" && (
            <a
              href={`/s/${siteId}/accessibility-statement`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <Icon d={I.check} size={14} />
              View Public Page
            </a>
          )}

          <button
            type="button"
            onClick={handleSaveDraft}
            disabled={saving || publishing}
            className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save Draft"}
          </button>

          <button
            type="button"
            onClick={handlePublish}
            disabled={saving || publishing}
            className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3.5 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 focus:outline-none focus:ring-2 focus:ring-primary disabled:opacity-50"
          >
            {publishing ? "Publishing..." : "Publish Statement"}
          </button>
        </div>
      </div>

      {/* Tabs / Toggle for Mobile View */}
      <div className="flex items-center justify-between border-b border-line pb-2 lg:hidden">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("editor")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              activeTab === "editor"
                ? "bg-primary text-primary-foreground"
                : "bg-surface text-muted hover:text-foreground"
            }`}
          >
            Edit Statement
          </button>
          <button
            type="button"
            onClick={() => setActiveTab("preview")}
            className={`rounded-md px-3 py-1.5 text-xs font-medium ${
              activeTab === "preview"
                ? "bg-primary text-primary-foreground"
                : "bg-surface text-muted hover:text-foreground"
            }`}
          >
            Live Preview
          </button>
        </div>
      </div>

      {/* Main Grid: Form on left, Live Preview on right */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left column: Step Form */}
        <div
          className={`space-y-6 lg:col-span-7 ${
            activeTab === "editor" ? "block" : "hidden lg:block"
          }`}
        >
          {/* Stepper Navigation */}
          <nav
            aria-label="Statement Wizard Steps"
            className="overflow-x-auto pb-2"
          >
            <ol className="flex items-center gap-1 min-w-[500px]">
              {STEPS.map((s) => {
                const isActive = currentStep === s.step;
                const isComplete = currentStep > s.step;
                return (
                  <li key={s.step} className="flex-1">
                    <button
                      type="button"
                      onClick={() => setCurrentStep(s.step)}
                      className={`flex w-full items-center gap-2 border-b-2 py-2 text-left text-xs transition-colors ${
                        isActive
                          ? "border-primary font-semibold text-primary"
                          : isComplete
                            ? "border-emerald-500 font-medium text-muted hover:text-foreground"
                            : "border-line text-muted hover:text-foreground"
                      }`}
                    >
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] ${
                          isActive
                            ? "bg-primary text-primary-foreground"
                            : isComplete
                              ? "bg-emerald-500 text-white"
                              : "bg-surface-raised text-muted"
                        }`}
                      >
                        {isComplete ? "✓" : s.step}
                      </span>
                      <span className="truncate">{s.label}</span>
                    </button>
                  </li>
                );
              })}
            </ol>
          </nav>

          {/* Step 1: Scope & Details */}
          {currentStep === 1 && (
            <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold text-foreground">
                Step 1: Organisation &amp; Website Scope
              </h3>
              <p className="text-xs text-muted">
                Specify who owns this website and which domains or subdomains
                are covered by this declaration.
              </p>

              <div>
                <label
                  htmlFor="org-name-input"
                  className="block text-xs font-medium text-foreground"
                >
                  Organisation Name <span className="text-rose-500">*</span>
                </label>
                <input
                  id="org-name-input"
                  type="text"
                  value={orgName}
                  onChange={(e) => setOrgName(e.target.value)}
                  placeholder="e.g. Acme Corporation"
                  className="mt-1 w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="site-name-input"
                    className="block text-xs font-medium text-foreground"
                  >
                    Website Name <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="site-name-input"
                    type="text"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Acme Online Store"
                    className="mt-1 w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
                <div>
                  <label
                    htmlFor="site-url-input"
                    className="block text-xs font-medium text-foreground"
                  >
                    Website Root URL <span className="text-rose-500">*</span>
                  </label>
                  <input
                    id="site-url-input"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://example.com"
                    className="mt-1 w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                    required
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="scope-input"
                  className="block text-xs font-medium text-foreground"
                >
                  Scope Description (Optional)
                </label>
                <textarea
                  id="scope-input"
                  rows={3}
                  value={scope}
                  onChange={(e) => setScope(e.target.value)}
                  placeholder="e.g. This statement applies to all pages hosted under https://example.com, including the blog and support portal, excluding third-party embedded payment widgets."
                  className="mt-1 w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <span className="text-[11px] text-muted">
                  Clarify exclusions if certain legacy systems or third-party
                  widgets are handled separately.
                </span>
              </div>

              <div className="flex justify-end pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Next: Standard &amp; Measures
                </button>
              </div>
            </div>
          )}

          {/* Step 2: Standard & Measures */}
          {currentStep === 2 && (
            <div className="space-y-5 rounded-lg border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold text-foreground">
                Step 2: Accessibility Standard &amp; Measures Taken
              </h3>
              <p className="text-xs text-muted">
                Define the benchmark your website targets and declare the
                ongoing practices applied to maintain accessibility.
              </p>

              <div>
                <label
                  htmlFor="target-standard-select"
                  className="block text-xs font-medium text-foreground"
                >
                  Target Standard
                </label>
                <select
                  id="target-standard-select"
                  value={targetStandard}
                  onChange={(e) => setTargetStandard(e.target.value)}
                  className="mt-1 w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                >
                  {STANDARD_OPTIONS.map((opt) => (
                    <option key={opt} value={opt}>
                      {opt}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <span className="block text-xs font-medium text-foreground mb-1.5">
                  Conformance Status
                </span>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  {(
                    [
                      {
                        val: "partially_conformant",
                        label: "Partially conformant",
                        sub: "Most common: working towards standard, known issues documented",
                      },
                      {
                        val: "fully_conformant",
                        label: "Fully conformant",
                        sub: "All requirements met without exceptions",
                      },
                      {
                        val: "non_conformant",
                        label: "Non-conformant",
                        sub: "Substantial barriers present, undergoing major fixes",
                      },
                    ] as const
                  ).map((c) => (
                    <label
                      key={c.val}
                      className={`flex cursor-pointer flex-col rounded-md border p-3 text-xs transition-colors ${
                        conformanceStatus === c.val
                          ? "border-primary bg-primary/5 text-foreground"
                          : "border-line bg-surface text-muted hover:border-line-strong hover:text-foreground"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="conformanceStatus"
                          value={c.val}
                          checked={conformanceStatus === c.val}
                          onChange={() => setConformanceStatus(c.val)}
                          className="text-primary focus:ring-primary"
                        />
                        <span className="font-semibold text-foreground">
                          {c.label}
                        </span>
                      </div>
                      <span className="mt-1.5 text-[11px] text-muted">
                        {c.sub}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <span className="block text-xs font-medium text-foreground mb-1.5">
                  Measures Taken to Ensure Accessibility
                </span>
                <div className="space-y-2">
                  {measuresTaken.map((m, idx) => (
                    <div
                      key={idx}
                      className="flex items-center justify-between gap-2 rounded-md border border-line bg-surface-raised px-3 py-2 text-xs"
                    >
                      <span className="flex-1 text-foreground">{m}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveMeasure(idx)}
                        aria-label={`Remove measure: ${m}`}
                        className="text-muted hover:text-rose-500"
                      >
                        <Icon d={I.close} size={14} />
                      </button>
                    </div>
                  ))}
                </div>

                <div className="mt-3 flex gap-2">
                  <input
                    type="text"
                    value={newMeasureText}
                    onChange={(e) => setNewMeasureText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddMeasure();
                      }
                    }}
                    placeholder="Add an organisational measure..."
                    className="flex-1 rounded-md border border-line bg-surface-raised px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                  <button
                    type="button"
                    onClick={handleAddMeasure}
                    className="inline-flex items-center gap-1 rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised"
                  >
                    <Icon d={I.plus} size={14} />
                    Add
                  </button>
                </div>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(1)}
                  className="rounded-md border border-line bg-surface px-4 py-2 text-xs font-medium text-foreground hover:bg-surface-raised"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Next: Known Limitations
                </button>
              </div>
            </div>
          )}

          {/* Step 3: Known Limitations */}
          {currentStep === 3 && (
            <div className="space-y-5 rounded-lg border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold text-foreground">
                Step 3: Known Limitations &amp; Workarounds
              </h3>
              <p className="text-xs text-muted">
                Transparent disclosure of existing barriers builds trust and
                allows users with disabilities to find alternative options.
              </p>

              {/* Import open issues */}
              {openIssues.length > 0 && (
                <div className="rounded-md border border-line-strong bg-surface-raised/50 p-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-medium text-foreground">
                      Open Audit Findings ({openIssues.length})
                    </span>
                    <span className="text-[11px] text-muted">
                      Click to import as a limitation
                    </span>
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {openIssues.slice(0, 8).map((issue) => (
                      <button
                        key={issue.id}
                        type="button"
                        onClick={() => handleImportIssue(issue)}
                        className="inline-flex items-center gap-1 rounded border border-line bg-surface px-2 py-1 text-[11px] text-foreground hover:border-primary hover:text-primary"
                      >
                        <Icon d={I.plus} size={12} />
                        <span className="max-w-[200px] truncate">
                          {issue.title}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* List of current limitations */}
              <div className="space-y-2.5">
                {knownLimitations.length === 0 ? (
                  <div className="rounded-md border border-dashed border-line p-4 text-center text-xs text-muted">
                    No limitations declared yet. If your site has areas that
                    don&apos;t meet WCAG, list them below with an available
                    workaround.
                  </div>
                ) : (
                  knownLimitations.map((lim, idx) => (
                    <div
                      key={idx}
                      className="rounded-md border border-line bg-surface-raised p-3 text-xs"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <span className="font-semibold text-foreground">
                          {lim.title}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveLimitation(idx)}
                          aria-label={`Remove limitation: ${lim.title}`}
                          className="text-muted hover:text-rose-500"
                        >
                          <Icon d={I.close} size={14} />
                        </button>
                      </div>
                      <p className="mt-1 text-muted">{lim.description}</p>
                      {lim.workaround && (
                        <p className="mt-1.5 rounded bg-surface p-1.5 text-[11px] text-foreground">
                          <span className="font-medium text-muted">
                            Workaround:{" "}
                          </span>
                          {lim.workaround}
                        </p>
                      )}
                    </div>
                  ))
                )}
              </div>

              {/* Add custom limitation */}
              <div className="space-y-3 rounded-md border border-line bg-surface p-3.5">
                <span className="block text-xs font-medium text-foreground">
                  Add Custom Limitation
                </span>
                <input
                  type="text"
                  value={newLimTitle}
                  onChange={(e) => setNewLimTitle(e.target.value)}
                  placeholder="Limitation title (e.g. Video transcripts)"
                  className="w-full rounded-md border border-line bg-surface-raised px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <textarea
                  rows={2}
                  value={newLimDesc}
                  onChange={(e) => setNewLimDesc(e.target.value)}
                  placeholder="Description of the limitation..."
                  className="w-full rounded-md border border-line bg-surface-raised px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <input
                  type="text"
                  value={newLimWorkaround}
                  onChange={(e) => setNewLimWorkaround(e.target.value)}
                  placeholder="Alternative workaround (optional)..."
                  className="w-full rounded-md border border-line bg-surface-raised px-3 py-1.5 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
                <button
                  type="button"
                  onClick={handleAddLimitation}
                  disabled={!newLimTitle.trim() || !newLimDesc.trim()}
                  className="inline-flex items-center gap-1.5 rounded-md border border-line bg-surface-raised px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface disabled:opacity-50"
                >
                  <Icon d={I.plus} size={14} />
                  Add Limitation
                </button>
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(2)}
                  className="rounded-md border border-line bg-surface px-4 py-2 text-xs font-medium text-foreground hover:bg-surface-raised"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Next: Feedback &amp; Contact
                </button>
              </div>
            </div>
          )}

          {/* Step 4: Feedback & Contact */}
          {currentStep === 4 && (
            <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold text-foreground">
                Step 4: Feedback &amp; Contact Information
              </h3>
              <p className="text-xs text-muted">
                Provide clear direct channels for visitors to notify you if they
                encounter barriers or require alternative formats.
              </p>

              <div>
                <label
                  htmlFor="contact-email-input"
                  className="block text-xs font-medium text-foreground"
                >
                  Contact Email <span className="text-rose-500">*</span>
                </label>
                <input
                  id="contact-email-input"
                  type="email"
                  value={contactEmail}
                  onChange={(e) => setContactEmail(e.target.value)}
                  placeholder="accessibility@example.com"
                  className="mt-1 w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  required
                />
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label
                    htmlFor="contact-phone-input"
                    className="block text-xs font-medium text-foreground"
                  >
                    Phone Number (Optional)
                  </label>
                  <input
                    id="contact-phone-input"
                    type="tel"
                    value={contactPhone}
                    onChange={(e) => setContactPhone(e.target.value)}
                    placeholder="+1 (555) 000-0000"
                    className="mt-1 w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
                <div>
                  <label
                    htmlFor="response-time-input"
                    className="block text-xs font-medium text-foreground"
                  >
                    Expected Response Time
                  </label>
                  <input
                    id="response-time-input"
                    type="text"
                    value={responseTime}
                    onChange={(e) => setResponseTime(e.target.value)}
                    placeholder="e.g. Within 2 business days"
                    className="mt-1 w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                  />
                </div>
              </div>

              <div>
                <label
                  htmlFor="contact-address-input"
                  className="block text-xs font-medium text-foreground"
                >
                  Postal / Physical Address (Optional)
                </label>
                <textarea
                  id="contact-address-input"
                  rows={2}
                  value={contactAddress}
                  onChange={(e) => setContactAddress(e.target.value)}
                  placeholder="Street address, city, postcode..."
                  className="mt-1 w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(3)}
                  className="rounded-md border border-line bg-surface px-4 py-2 text-xs font-medium text-foreground hover:bg-surface-raised"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(5)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Next: Enforcement Procedure
                </button>
              </div>
            </div>
          )}

          {/* Step 5: Enforcement Procedure */}
          {currentStep === 5 && (
            <div className="space-y-4 rounded-lg border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold text-foreground">
                Step 5: Enforcement Procedure (EU / UK / Public Sector)
              </h3>
              <p className="text-xs text-muted">
                Under EU Web Accessibility Directive and UK Public Sector Bodies
                regulations, statements must include escalation procedures to
                national supervisory bodies if feedback is unaddressed.
              </p>

              <div>
                <label
                  htmlFor="enforcement-body-input"
                  className="block text-xs font-medium text-foreground"
                >
                  Enforcement Body Name (Optional)
                </label>
                <input
                  id="enforcement-body-input"
                  type="text"
                  value={bodyName}
                  onChange={(e) => setBodyName(e.target.value)}
                  placeholder="e.g. Equality Advisory and Support Service (EASS)"
                  className="mt-1 w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="enforcement-url-input"
                  className="block text-xs font-medium text-foreground"
                >
                  Enforcement Body Website / Contact URL
                </label>
                <input
                  id="enforcement-url-input"
                  type="url"
                  value={contactUrl}
                  onChange={(e) => setContactUrl(e.target.value)}
                  placeholder="https://www.equalityadvisoryservice.com"
                  className="mt-1 w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div>
                <label
                  htmlFor="enforcement-desc-input"
                  className="block text-xs font-medium text-foreground"
                >
                  Escalation Instructions
                </label>
                <textarea
                  id="enforcement-desc-input"
                  rows={2}
                  value={enforcementDesc}
                  onChange={(e) => setEnforcementDesc(e.target.value)}
                  placeholder="If you are dissatisfied with our response to your accessibility feedback, you can contact the enforcement body above."
                  className="mt-1 w-full rounded-md border border-line bg-surface-raised px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(4)}
                  className="rounded-md border border-line bg-surface px-4 py-2 text-xs font-medium text-foreground hover:bg-surface-raised"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={() => setCurrentStep(6)}
                  className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90"
                >
                  Next: Review &amp; Publish
                </button>
              </div>
            </div>
          )}

          {/* Step 6: Review & Publish */}
          {currentStep === 6 && (
            <div className="space-y-5 rounded-lg border border-line bg-surface p-5">
              <h3 className="text-sm font-semibold text-foreground">
                Step 6: Statement Date &amp; Publish
              </h3>
              <p className="text-xs text-muted">
                Confirm your statement details. When published, an immutable
                evidence event is recorded, an embed code is generated, and your
                public statement URL goes live.
              </p>

              <div>
                <label
                  htmlFor="statement-date-input"
                  className="block text-xs font-medium text-foreground"
                >
                  Statement Effective Date (YYYY-MM-DD)
                </label>
                <input
                  id="statement-date-input"
                  type="date"
                  value={statementDate}
                  onChange={(e) => setStatementDate(e.target.value)}
                  className="mt-1 rounded-md border border-line bg-surface-raised px-3 py-2 text-xs text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
                />
              </div>

              <div className="rounded-md border border-line bg-surface-raised p-4 text-xs space-y-2">
                <div className="flex justify-between">
                  <span className="text-muted">Target Standard:</span>
                  <span className="font-semibold text-foreground">
                    {targetStandard}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Conformance Status:</span>
                  <span className="font-semibold text-foreground">
                    {conformanceStatus === "fully_conformant"
                      ? "Fully conformant"
                      : conformanceStatus === "partially_conformant"
                        ? "Partially conformant"
                        : "Non-conformant"}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Active Measures:</span>
                  <span className="font-semibold text-foreground">
                    {measuresTaken.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Known Limitations:</span>
                  <span className="font-semibold text-foreground">
                    {knownLimitations.length}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted">Feedback Email:</span>
                  <span className="font-semibold text-foreground">
                    {contactEmail || "Not set"}
                  </span>
                </div>
              </div>

              {statement?.status === "published" && (
                <div className="space-y-3 rounded-md border border-emerald-200 bg-emerald-50/50 p-4 dark:border-emerald-900/50 dark:bg-emerald-950/20">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
                      Website Footer Embed Code
                    </span>
                    <button
                      type="button"
                      onClick={handleCopySnippet}
                      className="inline-flex items-center gap-1 rounded bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-raised"
                    >
                      <Icon d={copiedSnippet ? I.check : I.audit} size={12} />
                      {copiedSnippet ? "Copied!" : "Copy Code"}
                    </button>
                  </div>
                  <pre className="overflow-x-auto rounded bg-surface-raised p-2 text-[11px] text-foreground">
                    <code>{embedCode}</code>
                  </pre>
                  <p className="text-[11px] text-muted">
                    Paste this snippet into your website footer or navigation
                    menu to link directly to your hosted statement.
                  </p>
                </div>
              )}

              <div className="flex justify-between pt-2">
                <button
                  type="button"
                  onClick={() => setCurrentStep(5)}
                  className="rounded-md border border-line bg-surface px-4 py-2 text-xs font-medium text-foreground hover:bg-surface-raised"
                >
                  Back
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={handleSaveDraft}
                    disabled={saving || publishing}
                    className="rounded-md border border-line bg-surface px-4 py-2 text-xs font-medium text-foreground hover:bg-surface-raised disabled:opacity-50"
                  >
                    {saving ? "Saving..." : "Save Draft"}
                  </button>
                  <button
                    type="button"
                    onClick={handlePublish}
                    disabled={saving || publishing}
                    className="inline-flex items-center gap-1.5 rounded-md bg-primary px-4 py-2 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
                  >
                    {publishing ? "Publishing..." : "Publish Statement"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Right column: Live Statement Preview */}
        <div
          className={`space-y-4 lg:col-span-5 ${
            activeTab === "preview" ? "block" : "hidden lg:block"
          }`}
        >
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-foreground uppercase tracking-wider">
              Live Statement Preview
            </span>
            <span className="text-[11px] text-muted">Updates in real time</span>
          </div>

          <div className="rounded-xl border border-line bg-surface p-6 shadow-sm space-y-6 text-foreground text-xs leading-relaxed max-h-[750px] overflow-y-auto">
            {/* Header */}
            <div className="border-b border-line pb-4">
              <h1 className="text-lg font-bold text-foreground">
                Accessibility Statement for {formData.siteName}
              </h1>
              <p className="mt-1 text-[11px] text-muted">
                Last updated: {formData.statementDate}
              </p>
            </div>

            {/* Commitment */}
            <section className="space-y-2">
              <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Our Commitment
              </h2>
              <p className="text-muted">
                {formData.orgName} is committed to ensuring digital
                accessibility for people of all abilities. We are continually
                improving the user experience for everyone and applying the
                relevant accessibility standards.
              </p>
              {formData.scope && (
                <p className="text-muted italic text-[11px]">
                  Scope: {formData.scope}
                </p>
              )}
            </section>

            {/* Conformance Status */}
            <section className="space-y-2">
              <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Conformance Status
              </h2>
              <div
                className={`inline-block rounded border px-2.5 py-1 text-xs font-semibold ${conformanceBadgeClass}`}
              >
                {conformanceStatus === "fully_conformant"
                  ? "Fully conformant"
                  : conformanceStatus === "partially_conformant"
                    ? "Partially conformant"
                    : "Non-conformant"}
              </div>
              <p className="text-muted">{conformanceDescription}</p>
            </section>

            {/* Measures */}
            {formData.measuresTaken.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Measures Taken
                </h2>
                <ul className="list-disc pl-4 space-y-1 text-muted">
                  {formData.measuresTaken.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </section>
            )}

            {/* Known Limitations */}
            {formData.knownLimitations.length > 0 && (
              <section className="space-y-2">
                <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Known Limitations &amp; Workarounds
                </h2>
                <div className="space-y-2">
                  {formData.knownLimitations.map((lim, i) => (
                    <div
                      key={i}
                      className="rounded border border-line bg-surface-raised p-2.5 space-y-1"
                    >
                      <p className="font-semibold text-foreground">
                        {lim.title}
                      </p>
                      <p className="text-[11px] text-muted">
                        {lim.description}
                      </p>
                      {lim.workaround && (
                        <p className="text-[11px] text-foreground">
                          <span className="font-medium text-muted">
                            Workaround:{" "}
                          </span>
                          {lim.workaround}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Feedback & Contact */}
            <section className="space-y-2">
              <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">
                Feedback &amp; Contact
              </h2>
              <p className="text-muted">
                We welcome your feedback on the accessibility of this website.
                Please let us know if you encounter accessibility barriers:
              </p>
              <dl className="grid grid-cols-1 gap-1 text-[11px] sm:grid-cols-2">
                <div>
                  <dt className="text-muted">Email:</dt>
                  <dd className="font-semibold text-foreground">
                    {formData.feedbackContact.email || "-"}
                  </dd>
                </div>
                {formData.feedbackContact.phone && (
                  <div>
                    <dt className="text-muted">Phone:</dt>
                    <dd className="font-semibold text-foreground">
                      {formData.feedbackContact.phone}
                    </dd>
                  </div>
                )}
                {formData.feedbackContact.responseTime && (
                  <div className="col-span-2">
                    <dt className="text-muted">Response Time:</dt>
                    <dd className="font-semibold text-foreground">
                      {formData.feedbackContact.responseTime}
                    </dd>
                  </div>
                )}
              </dl>
            </section>

            {/* Enforcement Procedure */}
            {formData.enforcementProcedure && (
              <section className="space-y-2">
                <h2 className="text-xs font-bold text-foreground uppercase tracking-wider">
                  Enforcement Procedure
                </h2>
                <p className="text-muted">
                  If you are not satisfied with our response to your complaint,
                  you may escalate to:
                </p>
                <p className="font-semibold text-foreground">
                  {formData.enforcementProcedure.bodyName}
                </p>
                {formData.enforcementProcedure.contactUrl && (
                  <p className="text-[11px]">
                    <a
                      href={formData.enforcementProcedure.contactUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-primary underline"
                    >
                      {formData.enforcementProcedure.contactUrl}
                    </a>
                  </p>
                )}
              </section>
            )}

            {/* Footer Legal Disclaimer */}
            <footer className="border-t border-line pt-4 text-[10px] text-muted italic">
              Disclaimer: This accessibility statement was created using an
              accessibility evaluation template and does not constitute formal
              legal advice.
            </footer>
          </div>
        </div>
      </div>

      {/* Version History Modal */}
      {showVersionsModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="versions-dialog-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
        >
          <div className="w-full max-w-lg rounded-lg border border-line bg-surface p-5 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-line pb-3">
              <h3
                id="versions-dialog-title"
                className="text-sm font-semibold text-foreground"
              >
                Statement Version History
              </h3>
              <button
                type="button"
                onClick={() => setShowVersionsModal(false)}
                className="text-muted hover:text-foreground"
                aria-label="Close dialog"
              >
                <Icon d={I.close} size={16} />
              </button>
            </div>

            <div className="max-h-72 overflow-y-auto space-y-2">
              {versions.map((ver) => (
                <div
                  key={ver.id}
                  className="flex items-center justify-between rounded-md border border-line bg-surface-raised p-3 text-xs"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-semibold text-foreground">
                        Version {ver.version}
                      </span>
                      <span
                        className={`rounded px-1.5 py-0.5 text-[10px] uppercase font-bold ${
                          ver.status === "published"
                            ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                            : "bg-surface text-muted"
                        }`}
                      >
                        {ver.status}
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted">
                      {ver.publishedAt
                        ? `Published ${new Date(ver.publishedAt).toLocaleDateString()}`
                        : `Created ${new Date(ver.createdAt).toLocaleDateString()}`}
                    </p>
                  </div>

                  <button
                    type="button"
                    onClick={() => {
                      setStatement(ver);
                      const d = ver.data;
                      setOrgName(d.orgName || "");
                      setName(d.siteName || siteName);
                      setUrl(d.siteUrl || siteUrl);
                      setScope(d.scope || "");
                      setTargetStandard(
                        d.targetStandard || "WCAG 2.2 Level AA",
                      );
                      setConformanceStatus(
                        d.conformanceStatus || "partially_conformant",
                      );
                      setMeasuresTaken(d.measuresTaken || []);
                      setKnownLimitations(d.knownLimitations || []);
                      setContactEmail(d.feedbackContact?.email || "");
                      setContactPhone(d.feedbackContact?.phone || "");
                      setContactAddress(d.feedbackContact?.address || "");
                      setResponseTime(
                        d.feedbackContact?.responseTime ||
                          "Within 2 to 3 business days",
                      );
                      if (d.enforcementProcedure) {
                        setBodyName(d.enforcementProcedure.bodyName || "");
                        setContactUrl(d.enforcementProcedure.contactUrl || "");
                        setEnforcementDesc(
                          d.enforcementProcedure.description || "",
                        );
                      }
                      setStatementDate(
                        d.statementDate ||
                          new Date().toISOString().split("T")[0]!,
                      );
                      setShowVersionsModal(false);
                      onToast?.(`Loaded Version ${ver.version}`);
                    }}
                    className="rounded border border-line bg-surface px-2.5 py-1 text-xs font-medium text-foreground hover:bg-surface-raised"
                  >
                    Load into Editor
                  </button>
                </div>
              ))}
            </div>

            <div className="flex justify-end pt-2 border-t border-line">
              <button
                type="button"
                onClick={() => setShowVersionsModal(false)}
                className="rounded-md border border-line bg-surface px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-raised"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
