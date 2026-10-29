import type { Metadata } from "next";
import { CmsLegal, loadLegalPage } from "@/components/legal/cms-legal";

export const metadata: Metadata = {
  title: "Refund Policy",
  description: "EveryVisitor Refund Policy: 14-day free trial, how refunds work for monthly and annual plans, and when we always refund.",
};

function BuiltRefundPolicyPage() {
  return (
    <div className="prose prose-slate max-w-none text-ink">
      <div className="border-b border-line pb-6 mb-8">
        <span className="text-xs font-bold tracking-wider uppercase text-primary">EveryVisitor Legal</span>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-normal text-ink">Refund Policy</h1>
        <p className="mt-2 text-sm text-muted">Last updated: October 28, 2026</p>
      </div>

      <div className="flex flex-col gap-8 text-sm leading-relaxed text-ink/90">
        <p className="m-0">
          This policy applies to subscriptions to EveryVisitor, operated by EveryVisitor Ltd. (&quot;we&quot;, &quot;us&quot;). Payments are processed by our reseller and
          merchant of record, Paddle.com, which also handles refunds. Paddle&apos;s buyer terms apply to your purchase.
        </p>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">1. Free trial first</h2>
          <p className="m-0">
            Every new account starts with a 14-day free trial, with no payment card required. We encourage you to use the trial to check that EveryVisitor fits your
            needs before you pay.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">2. Monthly plans</h2>
          <p className="m-0">
            You can try EveryVisitor free for 14 days before paying. Because of this, monthly payments are not refundable, except in the cases listed in section 4. You
            can cancel at any time; your plan stays active until the end of the paid month and you will not be charged again.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">3. Annual plans</h2>
          <p className="mb-3">
            If you are not satisfied, you can request a full refund within 14 days of your first annual payment. After that, refunds are reviewed case by case.
          </p>
          <p className="m-0">One refund per customer. A refund under this section is available once per customer and once per website.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">4. When we always refund</h2>
          <p className="mb-3">We will refund you, whatever the timing, if:</p>
          <ul className="m-0 list-disc pl-6 flex flex-col gap-1">
            <li>you were charged twice for the same subscription;</li>
            <li>you were charged after cancelling, because of an error on our side;</li>
            <li>the service was unavailable for a significant part of your billing period because of a fault on our side.</li>
          </ul>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">5. How to request a refund</h2>
          <p className="m-0">
            Email{" "}
            <a href="mailto:support@everyvisitor.app?subject=Refund%20request" className="text-primary hover:underline">
              support@everyvisitor.app
            </a>{" "}
            from the email address on your account, with the words &quot;Refund request&quot;. We reply within 1 business day. Approved refunds are sent back to your
            original payment method, and normally appear within 3–5 working days for cards, depending on your bank.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">6. What happens after a refund</h2>
          <p className="m-0">
            A full refund cancels your subscription immediately and your account switches to read-only. You can still export your data for 30 days, after which it is
            deleted.
          </p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">7. Your legal rights</h2>
          <p className="m-0">Nothing in this policy limits any rights you have under the consumer laws of your country.</p>
        </section>

        <section>
          <h2 className="text-xl font-bold text-ink mb-3">8. Contact</h2>
          <p className="m-0">
            Questions about this policy:{" "}
            <a href="mailto:support@everyvisitor.app" className="text-primary hover:underline">
              support@everyvisitor.app
            </a>
            .
          </p>
        </section>
      </div>
    </div>
  );
}

export const revalidate = 300;

/** Shows the version published from the staff area; until one is published, the built-in text. */
export default async function RefundPolicyPage() {
  const cms = await loadLegalPage("refunds");
  if (cms) return <CmsLegal slug="refunds" page={cms} />;
  return <BuiltRefundPolicyPage />;
}
