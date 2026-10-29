import type { Metadata } from "next";
import { CmsLegal, loadLegalPage } from "@/components/legal/cms-legal";

export const metadata: Metadata = {
  title: "Terms of Service",
  description: "Terms of Service and Customer Agreement for EveryVisitor Accessibility Monitoring.",
};

function BuiltTermsPage() {
  return (
    <div className="prose prose-slate max-w-none text-ink">
      <div className="border-b border-line pb-6 mb-8">
        <span className="text-xs font-bold tracking-wider uppercase text-primary">EveryVisitor Legal</span>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-normal text-ink">Terms of Service</h1>
        <p className="mt-2 text-sm text-muted">Last updated: October 18, 2026 · Effective date: October 18, 2026</p>
      </div>

      <div className="flex flex-col gap-8 text-sm leading-relaxed text-ink/90">
        <section>
          <h2 className="text-xl font-bold text-ink mb-3">1. Agreement to Terms</h2>
          <p>
            By registering for an account, accessing, or using EveryVisitor (&quot;the Service&quot;), operated by EveryVisitor Ltd.
            (&quot;EveryVisitor&quot;, &quot;we&quot;, &quot;us&quot;, or &quot;our&quot;), you (&quot;Customer&quot; or &quot;User&quot;) agree to be bound by these Terms of Service.
            If you are entering into this agreement on behalf of a company or other legal entity, you represent that you have the authority to bind such entity.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">2. Description of Service &amp; Scope</h2>
          <p>
            EveryVisitor provides automated web accessibility scanning, regression detection, fix guidance, and reporting tools primarily
            tailored for e-commerce platforms (including Shopify and WordPress/WooCommerce). Scans evaluate pages against the Web Content
            Accessibility Guidelines (WCAG) 2.2 Level A and Level AA standards using industry-standard rulesets (including axe-core).
          </p>
        </section>

        <section className="rounded-xl border border-line bg-subtle p-5">
          <h3 className="text-base font-bold text-ink mb-2">3. Important Accessibility Disclaimer &amp; No Legal Advice</h3>
          <p className="mb-2">
            <strong>Automated testing limitations:</strong> Automated testing tools typically detect approximately 30% to 50% of all WCAG criteria.
            Many accessibility requirements (such as logical heading structures, meaningful alternative text, and complex keyboard navigation flows)
            require human judgment and assistive technology verification.
          </p>
          <p className="mb-0">
            EveryVisitor is an engineering and quality assurance tool, not a law firm. Nothing in the Service, our reports, or our documentation
            constitutes legal advice. Use of the Service does not guarantee immunity from accessibility-related lawsuits, demand letters, or regulatory enforcement actions under the Americans with Disabilities Act (ADA), the European Accessibility Act (EAA), or any other jurisdiction.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">4. Authorized Use &amp; Site Ownership Verification</h2>
          <p className="mb-2">
            You agree to use EveryVisitor solely to scan and monitor websites and web applications that you own, operate, or for which you have obtained explicit written authorization from the owner.
          </p>
          <p>
            EveryVisitor requires site verification (via DNS TXT record, root HTML file upload, or platform OAuth) prior to initiating recurrent deep scans. We reserve the right to immediately suspend or terminate scans for any domain where ownership or authorization is disputed.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">5. Scanner Politeness &amp; Fair Use</h2>
          <p>
            Our crawler (&quot;EveryVisitorBot&quot;) is engineered to respect target servers, maintaining a polite request rate (maximum 1 request per second per domain), respecting standard <code>robots.txt</code> directives, and adhering to customer-configured page caps. You agree not to attempt to circumvent page caps, bypass rate limits, or use the scanner as an instrument for denial-of-service or security scanning.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">6. Subscriptions, Payments &amp; Taxes</h2>
          <p className="mb-2">
            EveryVisitor offers subscription plans billed on a monthly or annual basis. Payments are processed securely via our Merchant of Record, Paddle.com Market Ltd. (&quot;Paddle&quot;), which acts as the merchant of record for billing, sales tax, VAT, and invoice generation.
          </p>
          <p>
            Subscriptions renew automatically unless canceled prior to the renewal date via your account billing dashboard. You may cancel your subscription at any time. Canceled subscriptions remain active through the end of the current paid billing cycle.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">7. Data Protection &amp; Confidentiality</h2>
          <p>
            Each party agrees to safeguard the confidential information of the other party. We process personal data in accordance with our Privacy Policy and our Data Processing Agreement (DPA), which is incorporated into these Terms by reference.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">8. Limitation of Liability</h2>
          <p>
            To the maximum extent permitted by applicable law, in no event shall EveryVisitor or its directors, employees, or partners be liable for any indirect, incidental, special, consequential, or punitive damages (including loss of profits, revenue, data, or business opportunities), arising out of or related to your use of the Service, whether based on contract, tort, or any other legal theory, even if advised of the possibility of such damages. In no event shall our total aggregate liability exceed the total amounts paid by you to EveryVisitor in the twelve (12) months preceding the incident.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">9. Governing Law &amp; Jurisdiction</h2>
          <p>
            These Terms shall be governed by and construed in accordance with the laws of England and Wales, without regard to its conflict of law provisions. Any dispute arising out of or relating to these Terms shall be subject to the exclusive jurisdiction of the courts located in London, United Kingdom.
          </p>
        </section>
      </div>
    </div>
  );
}

export const revalidate = 300;

/** Shows the version published from the staff area; until one is published, the built-in text. */
export default async function TermsPage() {
  const cms = await loadLegalPage("terms");
  if (cms) return <CmsLegal slug="terms" page={cms} />;
  return <BuiltTermsPage />;
}
