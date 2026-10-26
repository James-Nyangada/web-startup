import type { Metadata } from "next";
import Link from "next/link";
import { DPA_SECTIONS, DPA_UPDATED } from "@/lib/legal/dpa";

export const metadata: Metadata = {
  title: "Data Processing Agreement (DPA)",
  description: "EveryVisitor Data Processing Agreement under Article 28 of the GDPR and UK GDPR.",
};

export default function DpaPage() {
  return (
    <div className="prose prose-slate max-w-none text-ink">
      <div className="border-b border-line pb-6 mb-8">
        <span className="text-xs font-bold tracking-wider uppercase text-primary">EveryVisitor Legal</span>
        <h1 className="mt-2 font-serif text-3xl sm:text-4xl font-normal text-ink">Data Processing Agreement (DPA)</h1>
        <p className="mt-2 text-sm text-muted">Standard Article 28 Contractual Terms · Last updated: {DPA_UPDATED}</p>
        <div className="mt-4 flex flex-wrap gap-3 not-prose">
          <a
            href="/legal/dpa/download"
            className="ease-ui inline-flex items-center rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary no-underline hover:bg-primary-hover hover:text-on-primary"
          >
            Download the DPA to sign
          </a>
          <Link href="/legal/subprocessors" className="inline-flex items-center px-1 text-sm font-semibold">
            See subprocessors
          </Link>
        </div>
        <p className="mt-2 text-xs text-muted">
          The download opens in any browser and prints to PDF, with signature blocks for both parties. Agencies can also
          email legal@plainsight.io for a countersigned copy.
        </p>
      </div>

      <div className="flex flex-col gap-8 text-sm leading-relaxed text-ink/90">
        {DPA_SECTIONS.map((section) => (
          <section key={section.title}>
            <h2 className="text-xl font-bold text-ink mb-3">{section.title}</h2>
            {section.paragraphs?.map((p) => (
              <p key={p.slice(0, 40)} className="mt-2 first:mt-0">
                {p}
              </p>
            ))}
            {section.terms && (
              <div className="flex flex-col gap-2">
                {section.terms.map((t) => (
                  <p key={t.term}>
                    <strong>{t.term}:</strong> {t.text}
                  </p>
                ))}
              </div>
            )}
            {section.bullets && (
              <ul className="mt-3 list-disc pl-5 flex flex-col gap-2">
                {section.bullets.map((b) => (
                  <li key={b.term}>
                    <strong>{b.term}:</strong> {b.text}
                  </li>
                ))}
              </ul>
            )}
          </section>
        ))}
      </div>
    </div>
  );
}
