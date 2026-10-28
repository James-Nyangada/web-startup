"use client";

import React, { useCallback, useEffect, useState } from "react";
import { StaffShell, btn, card, formatDate, td, th } from "@/components/staff/staff-shell";
import {
  staffApi,
  type ActivationReport,
  type ActivationRow,
  type InactiveCustomer,
} from "@/lib/admin-api";

function Step({ at }: { at: string | null }) {
  return at ? (
    <span className="font-semibold text-ok">{formatDate(at)}</span>
  ) : (
    <span className="text-muted">Not yet</span>
  );
}

/** Customer success: who is activated, and which paying customers have gone quiet. */
export default function StaffCustomersPage() {
  const [inactive, setInactive] = useState<InactiveCustomer[]>([]);
  const [activation, setActivation] = useState<ActivationReport | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");
  const [sending, setSending] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [i, a] = await Promise.all([staffApi.inactiveCustomers(), staffApi.activation()]);
      setInactive(i);
      setActivation(a);
      setState("ready");
    } catch {
      setState("error");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const checkIn = async (row: InactiveCustomer) => {
    setSending(row.orgId);
    setNotice(null);
    try {
      const res = await staffApi.sendCheckIn(row.orgId);
      setNotice(`Check-in sent to ${res.to}.`);
      await load();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not send the check-in.");
    } finally {
      setSending(null);
    }
  };

  const s = activation?.summary;
  const pending = (activation?.items ?? []).filter((r: ActivationRow) => !r.activatedAt);

  return (
    <StaffShell title="Customer success">
      {state === "error" && (
        <p role="alert" className="text-sm text-crit">
          Could not load customer data.
        </p>
      )}
      {notice && (
        <p role="status" className="mb-4 rounded-lg bg-subtle px-4 py-2 text-sm text-ink">
          {notice}
        </p>
      )}

      <section aria-labelledby="activation-h" className="mb-10">
        <h2 id="activation-h" className="m-0 mb-1 text-lg font-bold">
          Activation
        </h2>
        <p className="mb-4 text-sm text-muted">
          A customer is activated when they have verified a site, completed a full scan and fixed at least one issue.
          Customers who get there in their first week are far less likely to leave. Sign-ups from the last 90 days.
        </p>
        {s && (
          <dl className="mb-4 grid gap-3 sm:grid-cols-3">
            <div className={card}>
              <dt className="text-xs font-semibold text-muted">Activated</dt>
              <dd className="m-0 text-2xl font-bold tnum">
                {s.activated} <span className="text-sm font-normal text-muted">of {s.orgs}</span>
              </dd>
            </div>
            <div className={card}>
              <dt className="text-xs font-semibold text-muted">Activation rate</dt>
              <dd className="m-0 text-2xl font-bold tnum">{Math.round(s.activationRate * 100)}%</dd>
            </div>
            <div className={card}>
              <dt className="text-xs font-semibold text-muted">Activated in first week</dt>
              <dd className="m-0 text-2xl font-bold tnum">{s.activatedWithinWeek}</dd>
            </div>
          </dl>
        )}
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full border-collapse">
            <caption className="sr-only">Customers not yet activated</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={th}>Organisation</th>
                <th scope="col" className={th}>Plan</th>
                <th scope="col" className={th}>Days since sign-up</th>
                <th scope="col" className={th}>Site verified</th>
                <th scope="col" className={th}>Full scan</th>
                <th scope="col" className={th}>Issue fixed</th>
              </tr>
            </thead>
            <tbody>
              {pending.length === 0 && (
                <tr>
                  <td className={td} colSpan={6}>
                    {state === "loading" ? "Loading…" : "Everyone has activated."}
                  </td>
                </tr>
              )}
              {pending.map((r) => (
                <tr key={r.orgId} className="border-b border-line last:border-0">
                  <th scope="row" className={`${td} text-left font-semibold`}>
                    <a href={`/staff/orgs/${r.orgId}`} className="text-ink hover:underline">
                      {r.orgName}
                    </a>
                  </th>
                  <td className={td}>{r.plan}</td>
                  <td className={`${td} tnum`}>{r.daysSinceSignup}</td>
                  <td className={td}><Step at={r.steps.siteVerified} /></td>
                  <td className={td}><Step at={r.steps.fullScanCompleted} /></td>
                  <td className={td}><Step at={r.steps.issueFixed} /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section aria-labelledby="inactive-h">
        <h2 id="inactive-h" className="m-0 mb-1 text-lg font-bold">
          Paying customers gone quiet
        </h2>
        <p className="mb-4 text-sm text-muted">
          Paying customers whose owner has not been active for 14 days. The system emails each one automatically (at most
          once every 30 days). If you would rather reach out yourself, or the automatic email did not go, send it from here.
        </p>
        <div className="overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full border-collapse">
            <caption className="sr-only">Paying customers who have not been active for 14 days</caption>
            <thead>
              <tr className="border-b border-line">
                <th scope="col" className={th}>Organisation</th>
                <th scope="col" className={th}>Owner</th>
                <th scope="col" className={th}>Plan</th>
                <th scope="col" className={th}>Days inactive</th>
                <th scope="col" className={th}>Last check-in</th>
                <th scope="col" className={th}><span className="sr-only">Action</span></th>
              </tr>
            </thead>
            <tbody>
              {inactive.length === 0 && (
                <tr>
                  <td className={td} colSpan={6}>
                    {state === "loading" ? "Loading…" : "No quiet paying customers."}
                  </td>
                </tr>
              )}
              {inactive.map((r) => (
                <tr key={r.orgId} className="border-b border-line last:border-0">
                  <th scope="row" className={`${td} text-left font-semibold`}>
                    <a href={`/staff/orgs/${r.orgId}`} className="text-ink hover:underline">
                      {r.orgName}
                    </a>
                  </th>
                  <td className={td}>{r.ownerName ? `${r.ownerName} · ` : ""}{r.ownerEmail}</td>
                  <td className={td}>{r.plan}</td>
                  <td className={`${td} tnum`}>{r.daysInactive}</td>
                  <td className={td}>{formatDate(r.lastCheckInAt)}</td>
                  <td className={td}>
                    <button
                      type="button"
                      className={btn.secondary}
                      disabled={sending === r.orgId}
                      onClick={() => void checkIn(r)}
                    >
                      {sending === r.orgId ? "Sending…" : "Send check-in email"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </StaffShell>
  );
}
