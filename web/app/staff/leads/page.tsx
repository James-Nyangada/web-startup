"use client";

import React, { useCallback, useEffect, useState } from "react";
import { StaffShell, btn, card, formatDate, input, td, th } from "@/components/staff/staff-shell";
import { apiBaseUrl } from "@/lib/api";
import { staffApi, type FreeCheckLead, type WaitlistLead } from "@/lib/admin-api";

type Tab = "free-checks" | "waitlist";

function Yes({ on, yes = "Yes", no = "No" }: { on: boolean; yes?: string; no?: string }) {
  return <span className={on ? "font-semibold text-ok" : "text-muted"}>{on ? yes : no}</span>;
}

/** S-73: free-check and waitlist leads with consent status (P6-04). */
export default function StaffLeadsPage() {
  const [tab, setTab] = useState<Tab>("free-checks");
  const [q, setQ] = useState("");
  const [consentOnly, setConsentOnly] = useState(false);
  const [checks, setChecks] = useState<FreeCheckLead[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistLead[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(
    async (append: string | null = null) => {
      setState("loading");
      try {
        const params = { q, consent: consentOnly || undefined, cursor: append };
        if (tab === "free-checks") {
          const page = await staffApi.freeCheckLeads(params);
          setChecks((prev) => (append ? [...prev, ...page.data] : page.data));
          setCursor(page.nextCursor);
        } else {
          const page = await staffApi.waitlist(params);
          setWaitlist((prev) => (append ? [...prev, ...page.data] : page.data));
          setCursor(page.nextCursor);
        }
        setState("ready");
      } catch {
        setState("error");
      }
    },
    [tab, q, consentOnly],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  const count = tab === "free-checks" ? checks.length : waitlist.length;

  return (
    <StaffShell
      title="Leads"
     
      actions={
        <a href={`${apiBaseUrl()}${staffApi.leadsCsvPath}`} className={`${btn.primary} no-underline`}>
          Export consented leads (CSV)
        </a>
      }
    >
      <p className="mb-4 text-sm text-muted">
        The export only ever includes people who agreed to marketing email. Everyone else is shown here for support
        and conversion tracking only.
      </p>

      <div role="group" aria-label="Lead source" className="mb-4 flex gap-1 border-b border-line">
        {(
          [
            ["free-checks", "Free checks"],
            ["waitlist", "Waitlist"],
          ] as const
        ).map(([key, text]) => (
          <button
            key={key}
            type="button"
            aria-pressed={tab === key}
            onClick={() => {
              setTab(key);
              setCursor(null);
            }}
            className={`ease-ui border-b-2 px-3.5 py-2 text-sm ${
              tab === key ? "border-primary font-semibold text-ptext" : "border-transparent text-muted hover:text-ink"
            }`}
          >
            {text}
          </button>
        ))}
      </div>

      <div className={`${card} mb-4 flex flex-wrap items-end gap-4`}>
        <div className="min-w-[16rem] flex-1">
          <label htmlFor="lead-q" className="mb-1 block text-xs font-semibold text-muted">
            Search
          </label>
          <input
            id="lead-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={tab === "free-checks" ? "Email or domain" : "Email"}
            className={input}
          />
        </div>
        <label className="flex items-center gap-2 pb-2 text-sm">
          <input type="checkbox" checked={consentOnly} onChange={(e) => setConsentOnly(e.target.checked)} className="size-4" />
          Consented only
        </label>
      </div>

      <div
        aria-label={tab === "free-checks" ? "Free-check leads" : "Waitlist"}
        role="region"
        className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card"
      >
        <div className="overflow-x-auto">
          {tab === "free-checks" ? (
            <table className="w-full border-collapse">
              <thead className="bg-subtle">
                <tr>
                  <th scope="col" className={th}>Email</th>
                  <th scope="col" className={th}>Site checked</th>
                  <th scope="col" className={`${th} text-right`}>Score</th>
                  <th scope="col" className={th}>Marketing consent</th>
                  <th scope="col" className={th}>Converted</th>
                  <th scope="col" className={th}>Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {checks.map((c) => (
                  <tr key={c.id}>
                    <td className={td}>{c.email}</td>
                    <td className={`${td} max-w-xs truncate`}>{c.domain}</td>
                    <td className={`${td} tnum text-right`}>{c.score ?? "-"}</td>
                    <td className={td}>
                      <Yes on={c.marketingConsent} />
                    </td>
                    <td className={td}>
                      <Yes on={Boolean(c.convertedOrgId)} yes="Signed up" no="-" />
                    </td>
                    <td className={td}>{formatDate(c.createdAt, true)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table className="w-full border-collapse">
              <thead className="bg-subtle">
                <tr>
                  <th scope="col" className={th}>Email</th>
                  <th scope="col" className={th}>Source</th>
                  <th scope="col" className={th}>Marketing consent</th>
                  <th scope="col" className={th}>Converted</th>
                  <th scope="col" className={th}>Joined</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {waitlist.map((w) => (
                  <tr key={w.id}>
                    <td className={td}>{w.email}</td>
                    <td className={td}>{w.source ?? "-"}</td>
                    <td className={td}>
                      <Yes on={w.consent} />
                    </td>
                    <td className={td}>
                      <Yes on={w.converted} yes="Has an account" no="-" />
                    </td>
                    <td className={td}>{formatDate(w.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        {state === "ready" && count === 0 && <p className="m-0 p-6 text-center text-sm text-muted">No leads match.</p>}
        {state === "error" && (
          <p role="alert" className="m-0 p-6 text-center text-sm text-crit">
            Leads could not load.
          </p>
        )}
        <div role="status" className="sr-only">
          {state === "loading" ? "Loading leads" : `${count} leads shown`}
        </div>
      </div>
      {cursor && (
        <div className="mt-4 flex justify-center">
          <button type="button" className={btn.secondary} onClick={() => void load(cursor)} disabled={state === "loading"}>
            Load more
          </button>
        </div>
      )}
    </StaffShell>
  );
}
