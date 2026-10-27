import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Privacy Policy",
  description: "EveryVisitor Privacy Policy: Zero third-party cookies, privacy-by-design, and GDPR compliance.",
};

export default function PrivacyPage() {
  return (
    <div className="prose prose-slate max-w-none text-ink">
      <div className="border-b border-line pb-6 mb-8">
        <span className="text-xs font-bold tracking-wider uppercase text-primary">EveryVisitor Legal</span>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-normal text-ink">Privacy Policy</h1>
        <p className="mt-2 text-sm text-muted">Last updated: October 18, 2026 · Effective date: October 18, 2026</p>
      </div>

      <div className="flex flex-col gap-8 text-sm leading-relaxed text-ink/90">
        <section className="rounded-xl border border-line bg-subtle p-5">
          <h2 className="text-base font-bold text-ink mb-2">Our Core Privacy Commitment: No Tracking Cookies</h2>
          <p className="mb-0">
            EveryVisitor is built with a strict privacy-first philosophy. We do <strong>not</strong> use third-party tracking cookies,
            cross-site advertising beacons, or behavioral remarketing pixels anywhere on our marketing site or application.
            Our website analytics are powered by our self-hosted Umami instance, which does not track individuals, does not collect personal identifiers, and complies with EU ePrivacy regulations without annoying cookie consent banners.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">1. Information We Collect</h2>
          <div className="flex flex-col gap-3">
            <div>
              <strong className="text-ink">Account &amp; Profile Data:</strong> When you register for EveryVisitor, we collect your email address, name, hashed password, and organization name. For team invitations, we collect the email address and assigned role.
            </div>
            <div>
              <strong className="text-ink">Site &amp; Scan Configuration:</strong> We store the domains you register, verification records (DNS/file tokens), scan schedules, page path exclusions, and scan results (rule violations, CSS selectors, affected HTML snippets, and scores).
            </div>
            <div>
              <strong className="text-ink">Payment &amp; Billing Data:</strong> Payment card details, billing addresses, and invoices are processed and stored directly by Paddle.com Market Ltd. (our Merchant of Record). EveryVisitor stores only customer references, subscription IDs, and billing status.
            </div>
            <div>
              <strong className="text-ink">Technical &amp; Log Data:</strong> We collect essential server access logs, IP addresses for security and session revocation, and audit log entries of sensitive account actions (e.g., role changes, member removals, session revocations).
            </div>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">2. How We Use Your Information</h2>
          <ul className="list-disc pl-5 flex flex-col gap-2">
            <li>To provision and maintain your accessibility monitoring and scan engine.</li>
            <li>To generate on-demand and scheduled compliance reports (PDF and CSV exports).</li>
            <li>To detect regressions and transmit urgent alerts when critical accessibility barriers emerge.</li>
            <li>To enforce multi-tenant isolation, account security, and active session control.</li>
            <li>To communicate product updates, billing receipts, and service notices.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">3. Subprocessors &amp; Service Providers</h2>
          <p className="mb-3">
            We partner with a minimal, vetted list of infrastructure and technology providers to deliver EveryVisitor:
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-2">
            <li><strong>PostgreSQL Hosting:</strong> Dedicated managed database infrastructure for persistent application data.</li>
            <li><strong>Cloudflare:</strong> Turnstile privacy-preserving bot defense (no interactive captchas, no tracking) and R2 object storage for scan artifacts and signed reports.</li>
            <li><strong>Resend:</strong> Transactional email delivery for regression alerts, verification emails, and report distribution.</li>
            <li><strong>Paddle:</strong> Payment gateway and Merchant of Record.</li>
            <li><strong>Google Gemini (Optional):</strong> Optional AI fix suggestions if explicitly triggered; all code snippets are scrubbed of emails and phone numbers before transmission.</li>
          </ul>
          <p className="mt-3">
            Review our complete list of subprocessors and data transfer mechanisms in our <a href="/legal/subprocessors" className="text-primary hover:underline">Subprocessors Registry</a>.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">4. Data Retention &amp; Erasure</h2>
          <p className="mb-2">
            We retain scan results, issue histories, and audit records for as long as your account remains active.
          </p>
          <p>
            You may request an export of your personal data archive or request complete account deletion at any time in Account Settings. Upon organization deletion, all associated scan data, HTML snippets, and database records are scheduled for permanent purge across our database and object storage.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">5. Your Rights Under GDPR, UK GDPR, and CCPA</h2>
          <p className="mb-2">
            Depending on your location, you hold statutory rights regarding your personal data, including the right to access, rectify, export, restrict processing, or request erasure of your data.
          </p>
          <p>
            To exercise any statutory privacy right, you can use the self-service export and deletion controls in your settings dashboard or contact our Data Protection Officer at <a href="mailto:info@everyvisitor.app" className="text-primary hover:underline">info@everyvisitor.app</a>.
          </p>
        </section>
      </div>
    </div>
  );
}
