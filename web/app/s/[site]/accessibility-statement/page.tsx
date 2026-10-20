"use client";

import React, { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { apiClient } from "@/lib/api";

interface StatementLimitation {
  title: string;
  description: string;
  workaround?: string;
}

interface StatementData {
  orgName: string;
  siteName: string;
  siteUrl: string;
  scope: string;
  targetStandard: string;
  conformanceStatus:
    "fully_conformant" | "partially_conformant" | "non_conformant";
  measuresTaken: string[];
  knownLimitations: StatementLimitation[];
  feedbackContact: {
    email: string;
    phone?: string;
    address?: string;
    responseTime?: string;
  };
  enforcementProcedure?: {
    bodyName?: string;
    contactUrl?: string;
    description?: string;
  };
  statementDate: string;
}

interface PublicStatementResponse {
  statement: {
    id: string;
    siteId: string;
    version: number;
    publishedAt: string;
    data: StatementData;
    renderedHtml: string;
  };
  site: {
    id: string;
    name: string;
    domain: string;
  };
  branding: {
    displayName: string | null;
    primaryColor: string | null;
    logoLightUrl: string | null;
  } | null;
}

export default function PublicAccessibilityStatementPage() {
  const params = useParams();
  const siteId = params?.site as string;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<PublicStatementResponse | null>(null);

  useEffect(() => {
    if (!siteId) return;
    let cancelled = false;
    setLoading(true);
    apiClient<PublicStatementResponse>(`/v1/public/statements/${siteId}`)
      .then((res) => {
        if (!cancelled) {
          setData(res);
          setError(null);
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          const msg =
            err instanceof Error
              ? err.message
              : "Accessibility statement not found or not yet published.";
          setError(msg);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background text-foreground">
        <div className="flex items-center gap-2 text-sm text-muted">
          <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary border-t-transparent" />
          Loading accessibility statement...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center bg-background px-4 text-center">
        <div className="max-w-md space-y-4">
          <h1 className="text-xl font-bold text-foreground">
            Statement Unavailable
          </h1>
          <p className="text-sm text-muted">
            {error ||
              "An accessibility statement has not been published for this website."}
          </p>
        </div>
      </main>
    );
  }

  const { statement, site, branding } = data;
  const d = statement.data;

  const conformanceBadgeText =
    d.conformanceStatus === "fully_conformant"
      ? "Fully conformant"
      : d.conformanceStatus === "partially_conformant"
        ? "Partially conformant"
        : "Non-conformant";

  const conformanceBadgeClass =
    d.conformanceStatus === "fully_conformant"
      ? "bg-emerald-50 text-emerald-800 border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-700"
      : d.conformanceStatus === "partially_conformant"
        ? "bg-amber-50 text-amber-800 border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-700"
        : "bg-rose-50 text-rose-800 border-rose-300 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-700";

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <header className="border-b border-line bg-surface/80 backdrop-blur">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            {branding?.logoLightUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={branding.logoLightUrl}
                alt={`${branding.displayName || d.orgName} Logo`}
                className="h-8 max-w-[160px] object-contain"
              />
            ) : (
              <span className="font-bold text-sm tracking-tight text-foreground">
                {branding?.displayName || d.orgName}
              </span>
            )}
          </div>
          <a
            href={d.siteUrl}
            className="text-xs font-medium text-primary hover:underline"
            target="_blank"
            rel="noopener noreferrer"
          >
            Visit Website &rarr;
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-6 py-10">
        <article className="space-y-8">
          {/* Header */}
          <div className="border-b border-line pb-6">
            <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
              Accessibility Statement for {d.siteName}
            </h1>
            <p className="mt-2 text-xs text-muted">
              Published on{" "}
              {new Date(statement.publishedAt).toLocaleDateString()} &middot;
              Version {statement.version} &middot; Effective date:{" "}
              {d.statementDate}
            </p>
          </div>

          {/* Commitment */}
          <section className="space-y-3" aria-labelledby="commitment-heading">
            <h2
              id="commitment-heading"
              className="text-base font-bold text-foreground"
            >
              Our Commitment
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              {d.orgName} is committed to ensuring digital accessibility for
              people of all abilities. We are continually improving the user
              experience for everyone and applying the relevant accessibility
              standards.
            </p>
            {d.scope && (
              <p className="text-xs leading-relaxed text-muted italic">
                Scope: {d.scope}
              </p>
            )}
          </section>

          {/* Conformance Status */}
          <section className="space-y-3" aria-labelledby="conformance-heading">
            <h2
              id="conformance-heading"
              className="text-base font-bold text-foreground"
            >
              Conformance Status
            </h2>
            <div className="flex items-center gap-2">
              <span
                className={`inline-block rounded border px-3 py-1 text-xs font-semibold ${conformanceBadgeClass}`}
              >
                {conformanceBadgeText}
              </span>
              <span className="text-xs text-muted">
                Target: {d.targetStandard}
              </span>
            </div>
            <p className="text-sm leading-relaxed text-muted">
              {d.conformanceStatus === "fully_conformant"
                ? `The website fully conforms to ${d.targetStandard} without exceptions.`
                : d.conformanceStatus === "partially_conformant"
                  ? `The website partially conforms to ${d.targetStandard}. Some parts of the content do not fully conform to the standard, as detailed in the known limitations below.`
                  : `The website does not yet conform to ${d.targetStandard}. Remediation is actively in progress.`}
            </p>
          </section>

          {/* Measures Taken */}
          {d.measuresTaken && d.measuresTaken.length > 0 && (
            <section className="space-y-3" aria-labelledby="measures-heading">
              <h2
                id="measures-heading"
                className="text-base font-bold text-foreground"
              >
                Measures Taken to Ensure Accessibility
              </h2>
              <p className="text-sm leading-relaxed text-muted">
                {d.orgName} takes the following measures to ensure accessibility
                across our digital properties:
              </p>
              <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted">
                {d.measuresTaken.map((m, idx) => (
                  <li key={idx}>{m}</li>
                ))}
              </ul>
            </section>
          )}

          {/* Known Limitations */}
          {d.knownLimitations && d.knownLimitations.length > 0 && (
            <section
              className="space-y-3"
              aria-labelledby="limitations-heading"
            >
              <h2
                id="limitations-heading"
                className="text-base font-bold text-foreground"
              >
                Known Limitations &amp; Alternatives
              </h2>
              <p className="text-sm leading-relaxed text-muted">
                Despite our best efforts to ensure accessibility of {d.siteName}
                , there may be some limitations. Below is a description of known
                limitations, along with potential solutions:
              </p>
              <div className="space-y-3 pt-2">
                {d.knownLimitations.map((lim, idx) => (
                  <div
                    key={idx}
                    className="rounded-lg border border-line bg-surface p-4 space-y-2"
                  >
                    <h3 className="text-sm font-semibold text-foreground">
                      {lim.title}
                    </h3>
                    <p className="text-xs leading-relaxed text-muted">
                      {lim.description}
                    </p>
                    {lim.workaround && (
                      <p className="text-xs leading-relaxed text-foreground">
                        <span className="font-semibold text-muted">
                          Alternative / Workaround:{" "}
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
          <section className="space-y-3" aria-labelledby="feedback-heading">
            <h2
              id="feedback-heading"
              className="text-base font-bold text-foreground"
            >
              Feedback &amp; Contact Information
            </h2>
            <p className="text-sm leading-relaxed text-muted">
              We welcome your feedback on the accessibility of {d.siteName}.
              Please let us know if you encounter accessibility barriers on our
              site:
            </p>
            <dl className="grid grid-cols-1 gap-3 rounded-lg border border-line bg-surface p-4 text-xs sm:grid-cols-2">
              <div>
                <dt className="text-muted">Email:</dt>
                <dd className="font-semibold text-foreground">
                  <a
                    href={`mailto:${d.feedbackContact.email}`}
                    className="text-primary hover:underline"
                  >
                    {d.feedbackContact.email}
                  </a>
                </dd>
              </div>
              {d.feedbackContact.phone && (
                <div>
                  <dt className="text-muted">Phone:</dt>
                  <dd className="font-semibold text-foreground">
                    <a
                      href={`tel:${d.feedbackContact.phone}`}
                      className="text-primary hover:underline"
                    >
                      {d.feedbackContact.phone}
                    </a>
                  </dd>
                </div>
              )}
              {d.feedbackContact.responseTime && (
                <div className="sm:col-span-2">
                  <dt className="text-muted">Expected Response Time:</dt>
                  <dd className="font-semibold text-foreground">
                    {d.feedbackContact.responseTime}
                  </dd>
                </div>
              )}
              {d.feedbackContact.address && (
                <div className="sm:col-span-2">
                  <dt className="text-muted">Postal Address:</dt>
                  <dd className="font-semibold text-foreground">
                    {d.feedbackContact.address}
                  </dd>
                </div>
              )}
            </dl>
          </section>

          {/* Enforcement Procedure */}
          {d.enforcementProcedure && d.enforcementProcedure.bodyName && (
            <section
              className="space-y-3"
              aria-labelledby="enforcement-heading"
            >
              <h2
                id="enforcement-heading"
                className="text-base font-bold text-foreground"
              >
                Enforcement Procedure
              </h2>
              <p className="text-sm leading-relaxed text-muted">
                {d.enforcementProcedure.description ||
                  "If you are not satisfied with our response to your complaint, you may escalate your feedback to the relevant national enforcement body:"}
              </p>
              <p className="text-xs font-semibold text-foreground">
                {d.enforcementProcedure.bodyName}
              </p>
              {d.enforcementProcedure.contactUrl && (
                <p className="text-xs">
                  <a
                    href={d.enforcementProcedure.contactUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {d.enforcementProcedure.contactUrl} &rarr;
                  </a>
                </p>
              )}
            </section>
          )}

          {/* Footer Legal Disclaimer */}
          <footer className="border-t border-line pt-6 text-xs text-muted italic">
            <p>
              Disclaimer: This accessibility statement was created using an
              accessibility evaluation template and does not constitute formal
              legal advice.
            </p>
          </footer>
        </article>
      </main>
    </div>
  );
}
