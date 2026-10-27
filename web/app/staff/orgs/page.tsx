"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { StaffShell, card, formatDate, input, th, td, btn } from "@/components/staff/staff-shell";
import { formatMoney, staffApi, type StaffOrgRow } from "@/lib/admin-api";

const PLANS = ["trial", "store", "growth", "agency", "agency_pro"];
const STATUSES = ["trialing", "active", "past_due", "paused", "canceled", "read_only"];

const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

/** S-70: find an organisation by name, slug or member email. */
export default function StaffOrgsPage() {
  const [q, setQ] = useState("");
  const [plan, setPlan] = useState("");
  const [status, setStatus] = useState("");
  const [includeDeleted, setIncludeDeleted] = useState(false);
  const [rows, setRows] = useState<StaffOrgRow[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  const load = useCallback(
    async (append: string | null = null) => {
      setState("loading");
      try {
        const page = await staffApi.listOrgs({ q, plan, status, includeDeleted, cursor: append });
        setRows((prev) => (append ? [...prev, ...page.data] : page.data));
        setCursor(page.nextCursor);
        setState("ready");
      } catch {
        setState("error");
      }
    },
    [q, plan, status, includeDeleted],
  );

  useEffect(() => {
    const t = setTimeout(() => void load(), 250);
    return () => clearTimeout(t);
  }, [load]);

  return (
    <StaffShell title="Organisations">
      <form role="search" onSubmit={(e) => e.preventDefault()} className={`${card} mb-4 grid gap-3 sm:grid-cols-[2fr_1fr_1fr_auto]`}>
        <div>
          <label htmlFor="org-q" className="mb-1 block text-xs font-semibold text-muted">
            Search
          </label>
          <input
            id="org-q"
            type="search"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Name, slug or member email"
            className={input}
          />
        </div>
        <div>
          <label htmlFor="org-plan" className="mb-1 block text-xs font-semibold text-muted">
            Plan
          </label>
          <select id="org-plan" value={plan} onChange={(e) => setPlan(e.target.value)} className={input}>
            <option value="">All plans</option>
            {PLANS.map((p) => (
              <option key={p} value={p}>
                {label(p)}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="org-status" className="mb-1 block text-xs font-semibold text-muted">
            Billing status
          </label>
          <select id="org-status" value={status} onChange={(e) => setStatus(e.target.value)} className={input}>
            <option value="">Any status</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {label(s)}
              </option>
            ))}
          </select>
        </div>
        <label className="flex items-end gap-2 pb-2 text-sm text-ink">
          <input type="checkbox" checked={includeDeleted} onChange={(e) => setIncludeDeleted(e.target.checked)} className="size-4" />
          Include deleted
        </label>
      </form>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <caption className="sr-only">Organisations</caption>
            <thead className="border-b border-line bg-subtle">
              <tr>
                <th scope="col" className={th}>Organisation</th>
                <th scope="col" className={th}>Plan</th>
                <th scope="col" className={th}>Status</th>
                <th scope="col" className={`${th} text-right`}>Sites</th>
                <th scope="col" className={`${th} text-right`}>MRR</th>
                <th scope="col" className={th}>Last activity</th>
                <th scope="col" className={th}>Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rows.map((o) => (
                <tr key={o.id} className="hover:bg-subtle/50">
                  <td className={td}>
                    <Link href={`/staff/orgs/${o.id}`} className="font-semibold">
                      {o.name}
                    </Link>
                    <div className="text-xs text-muted">
                      {o.slug} · {o.type}
                      {o.deletedAt && <span className="ml-1 font-semibold text-crit">deleted</span>}
                    </div>
                  </td>
                  <td className={td}>
                    {label(o.plan)}
                    {o.planOverride && (
                      <div className="text-xs text-ser">
                        Override: {label(o.planOverride)} until {formatDate(o.planOverrideExpiresAt)}
                      </div>
                    )}
                  </td>
                  <td className={td}>{label(o.billingStatus)}</td>
                  <td className={`${td} tnum text-right`}>{o.siteCount}</td>
                  <td className={`${td} tnum text-right`}>{o.mrrCents ? formatMoney(o.mrrCents) : "-"}</td>
                  <td className={td}>{formatDate(o.lastActivityAt, true)}</td>
                  <td className={td}>{formatDate(o.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {state === "ready" && rows.length === 0 && (
          <p className="m-0 p-6 text-center text-sm text-muted">No organisations match these filters.</p>
        )}
        {state === "error" && (
          <p role="alert" className="m-0 p-6 text-center text-sm text-crit">
            Organisations could not load.{" "}
            <button type="button" className="font-semibold text-ptext underline" onClick={() => void load()}>
              Try again
            </button>
          </p>
        )}
        <div role="status" className="sr-only">
          {state === "loading" ? "Loading organisations" : `${rows.length} organisations shown`}
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
