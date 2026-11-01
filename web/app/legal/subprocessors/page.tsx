import type { Metadata } from "next";
import { CmsLegal, loadLegalPage } from "@/components/legal/cms-legal";

export const metadata: Metadata = {
  title: "Subprocessors Registry",
  description: "Official list of third-party subprocessors authorized to process data on behalf of EveryVisitor.",
};

const SUBPROCESSORS = [
  {
    name: "Cloudflare, Inc.",
    entity: "Cloudflare, Inc. (USA / EU)",
    service: "Cloudflare Turnstile, CDN, R2 Object Storage",
    location: "Global / European Union edge",
    transfer: "Standard Contractual Clauses (SCCs), EU-US Data Privacy Framework",
    purpose: "Privacy-preserving bot protection (no captcha cookies) and secure encrypted artifact storage for reports and scan data.",
  },
  {
    name: "Paddle.com Market Ltd.",
    entity: "Paddle.com Market Ltd. (United Kingdom)",
    service: "Merchant of Record, Billing & Invoicing",
    location: "United Kingdom",
    transfer: "UK Adequacy Regulations / EU Adequacy Decision",
    purpose: "Customer billing, credit card processing, VAT/sales tax compliance, and automated invoicing.",
  },
  {
    name: "Hetzner Online GmbH",
    entity: "Hetzner Online GmbH (Germany)",
    service: "Dedicated Cloud Compute & PostgreSQL 16 Hosting",
    location: "Falkenstein / Nuremberg, Germany (EU)",
    transfer: "Intra-EU data processing (GDPR direct)",
    purpose: "Primary database storage, scan runner workers, and core API application execution.",
  },
  {
    name: "Supabase, Inc.",
    entity: "Supabase, Inc. (USA)",
    service: "Managed PostgreSQL database",
    location: "European Union region (eu-central / eu-west)",
    transfer: "Standard Contractual Clauses (SCCs), EU-US Data Privacy Framework",
    purpose: "Hosted PostgreSQL that stores account, organisation, scan and issue data. Encrypted at rest; row-level security blocks Supabase's public data API.",
  },
  {
    name: "Resend, Inc.",
    entity: "Resend, Inc. (USA)",
    service: "Transactional Email Infrastructure",
    location: "United States",
    transfer: "Standard Contractual Clauses (SCCs), EU-US Data Privacy Framework",
    purpose: "Sending regression alert notifications, team invitation links, magic login emails, and PDF report deliveries.",
  },
  {
    name: "Functional Software, Inc. (Sentry)",
    entity: "Functional Software, Inc. (USA)",
    service: "Error Monitoring & Diagnostics",
    location: "United States",
    transfer: "Standard Contractual Clauses (SCCs), EU-US Data Privacy Framework",
    purpose: "Crash reporting and runtime error diagnostics. Configured with PII data scrubbers.",
  },
  {
    name: "Google LLC (Optional)",
    entity: "Google LLC (USA)",
    service: "Gemini API (AI Fix Suggestions)",
    location: "United States",
    transfer: "Standard Contractual Clauses (SCCs), EU-US Data Privacy Framework",
    purpose: "Optional on-demand AI remediation suggestions. Code snippets are scrubbed of phone numbers and email addresses prior to transmission.",
  },
];

function BuiltSubprocessorsPage() {
  return (
    <div className="prose prose-slate max-w-none text-ink">
      <div className="border-b border-line pb-6 mb-8">
        <span className="text-xs font-bold tracking-wider uppercase text-primary">EveryVisitor Legal</span>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-normal text-ink">Subprocessors Registry</h1>
        <p className="mt-2 text-sm text-muted">
          Current list of authorized third-party service providers · Last updated: October 18, 2026
        </p>
      </div>

      <div className="flex flex-col gap-6 text-sm leading-relaxed text-ink/90">
        <p>
          To deliver our continuous accessibility monitoring service, EveryVisitor engages third-party service providers (&quot;subprocessors&quot;) to perform technical, infrastructure, and payment processing functions. Prior to engaging any subprocessor, EveryVisitor conducts due diligence to evaluate their security posture, confidentiality obligations, and data protection compliance.
        </p>

        {/* Phones: one card per subprocessor, since four columns do not fit. */}
        <ul className="m-0 flex list-none flex-col gap-4 p-0 md:hidden">
          {SUBPROCESSORS.map((s) => (
            <li key={s.name} className="m-0 rounded-xl border border-line bg-surface p-4">
              <h2 className="m-0 text-base font-semibold text-ink">{s.name}</h2>
              <p className="m-0 mt-0.5 text-xs text-muted">{s.entity}</p>
              <p className="m-0 mt-3 text-sm font-semibold text-ink">{s.service}</p>
              <p className="m-0 mt-1 text-sm text-muted">{s.purpose}</p>
              <dl className="m-0 mt-3 flex flex-col gap-2 border-t border-line pt-3 text-xs">
                <div>
                  <dt className="font-semibold text-ink">Location</dt>
                  <dd className="m-0 mt-0.5 text-muted">{s.location}</dd>
                </div>
                <div>
                  <dt className="font-semibold text-ink">Transfer mechanism</dt>
                  <dd className="m-0 mt-0.5 text-muted">{s.transfer}</dd>
                </div>
              </dl>
            </li>
          ))}
        </ul>

        <div className="hidden overflow-x-auto rounded-xl border border-line md:block">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-line bg-subtle">
                <th className="p-3 font-semibold text-ink">Subprocessor</th>
                <th className="p-3 font-semibold text-ink">Service &amp; Purpose</th>
                <th className="p-3 font-semibold text-ink">Location</th>
                <th className="p-3 font-semibold text-ink">Transfer Mechanism</th>
              </tr>
            </thead>
            <tbody>
              {SUBPROCESSORS.map((s, idx) => (
                <tr key={s.name} className={idx < SUBPROCESSORS.length - 1 ? "border-b border-line" : ""}>
                  <td className="p-3 font-semibold align-top whitespace-nowrap text-ink">
                    {s.name}
                    <div className="text-[11px] font-normal text-muted">{s.entity}</div>
                  </td>
                  <td className="p-3 align-top">
                    <strong className="text-ink">{s.service}</strong>
                    <div className="text-muted mt-0.5">{s.purpose}</div>
                  </td>
                  <td className="p-3 align-top whitespace-nowrap text-muted">{s.location}</td>
                  <td className="p-3 align-top text-muted">{s.transfer}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <section className="mt-4 rounded-xl border border-line bg-subtle p-5">
          <h2 className="text-base font-bold text-ink mb-2">Notification of New Subprocessors</h2>
          <p className="mb-0 text-muted">
            Customers with an active Data Processing Agreement can subscribe to notifications of new subprocessor additions by emailing <a href="mailto:info@everyvisitor.app" className="text-primary hover:underline">info@everyvisitor.app</a>. We provide at least 30 days notice prior to authorizing any new subprocessor.
          </p>
        </section>
      </div>
    </div>
  );
}

export const revalidate = 300;

/** Shows the version published from the staff area; until one is published, the built-in text. */
export default async function SubprocessorsPage() {
  const cms = await loadLegalPage("subprocessors");
  if (cms) return <CmsLegal slug="subprocessors" page={cms} />;
  return <BuiltSubprocessorsPage />;
}
