import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Data Processing Agreement (DPA)",
  description: "Plainsight Data Processing Agreement under Article 28 of the GDPR and UK GDPR.",
};

export default function DpaPage() {
  return (
    <div className="prose prose-slate max-w-none text-ink">
      <div className="border-b border-line pb-6 mb-8">
        <span className="text-xs font-bold tracking-wider uppercase text-primary">Plainsight Legal</span>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-normal text-ink">Data Processing Agreement (DPA)</h1>
        <p className="mt-2 text-sm text-muted">Standard Article 28 Contractual Terms · Last updated: October 18, 2026</p>
      </div>

      <div className="flex flex-col gap-8 text-sm leading-relaxed text-ink/90">
        <section>
          <h2 className="text-xl font-bold text-ink mb-3">1. Scope and Applicability</h2>
          <p>
            This Data Processing Agreement (&quot;DPA&quot;) supplements the Plainsight Terms of Service and applies to the extent that
            Plainsight Ltd. (&quot;Processor&quot;) processes Personal Data on behalf of the Customer (&quot;Controller&quot;) in the course of providing
            the Plainsight accessibility monitoring and scan engine services.
          </p>
          <p className="mt-2">
            This DPA complies with the requirements of Article 28 of Regulation (EU) 2016/679 (&quot;GDPR&quot;) and the UK General Data Protection Regulation (&quot;UK GDPR&quot;).
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">2. Processing of Customer Personal Data</h2>
          <div className="flex flex-col gap-2">
            <p>
              <strong>Subject Matter &amp; Nature:</strong> Provision of automated website accessibility scanning, regression analysis, reporting, and issue collaboration.
            </p>
            <p>
              <strong>Categories of Data Subjects:</strong> Customer employees, contractors, agency clients, and authorized users who access the Plainsight platform.
            </p>
            <p>
              <strong>Categories of Personal Data:</strong> Name, professional email address, organization affiliation, IP address, user account identifiers, and public HTML snippets extracted during automated page scans.
            </p>
            <p>
              <strong>Instructions:</strong> Processor shall process Customer Personal Data solely in accordance with documented instructions from Controller, including with respect to transfers of personal data outside the UK or European Economic Area.
            </p>
          </div>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">3. Technical and Organizational Security Measures (TOMs)</h2>
          <p className="mb-3">
            Processor implements and maintains appropriate technical and organizational measures to ensure a level of security appropriate to the risk, including:
          </p>
          <ul className="list-disc pl-5 flex flex-col gap-2">
            <li><strong>Encryption in Transit:</strong> All web traffic and API communications are encrypted using modern Transport Layer Security (TLS 1.3/1.2).</li>
            <li><strong>Encryption at Rest:</strong> All database storage, R2 artifact volumes, and automated backups are encrypted using AES-256.</li>
            <li><strong>Multi-Tenant Isolation:</strong> Logical separation of data by organization identifier (orgId) enforced across all database queries and repository layers. Cross-organization access attempts strictly return 404 Not Found to prevent data enumeration.</li>
            <li><strong>Access Controls:</strong> Role-based access control (RBAC), multi-factor authentication (MFA/TOTP) for administrative personnel, and automated session revocation controls.</li>
            <li><strong>Audit Logging:</strong> Immutable append-only audit trail logging administrative and security actions.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">4. Subprocessors</h2>
          <p className="mb-2">
            Controller grants general authorization to Processor to engage the third-party subprocessors listed in our Subprocessors Registry.
          </p>
          <p>
            Processor remains fully liable to Controller for the performance of each subprocessor&apos;s obligations. Processor shall notify Controller of any intended changes concerning the addition or replacement of subprocessors at least thirty (30) days in advance, providing Controller with the opportunity to object.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">5. Data Subject Rights &amp; Breach Notification</h2>
          <p className="mb-2">
            <strong>Assistance with Requests:</strong> Processor shall provide reasonable assistance to Controller to enable Controller to fulfill its obligations to respond to data subject requests under applicable Data Protection Laws.
          </p>
          <p>
            <strong>Security Incident Notification:</strong> Processor shall notify Controller in writing without undue delay, and in any event within forty-eight (48) hours, after becoming aware of a confirmed Personal Data Breach affecting Customer Personal Data.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">6. Deletion or Return of Personal Data</h2>
          <p>
            Upon termination of the Service, Processor shall, at the choice of Controller, delete or return all Customer Personal Data within thirty (30) days, unless applicable statutory law requires retention of such data.
          </p>
        </section>
      </div>
    </div>
  );
}
