"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ReasonDialog, StaffShell, btn, card, formatDate, input, td, th } from "@/components/staff/staff-shell";
import { useToast } from "@/components/shell/toast-context";
import { formatMoney, staffApi, type StaffOrgDetail } from "@/lib/admin-api";

const PLANS = ["trial", "store", "growth", "agency", "agency_pro"];
const label = (s: string) => s.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function Section({ title, children, count }: { title: string; count?: number; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`h-${title}`} className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
      <h2 id={`h-${title}`} className="m-0 border-b border-line px-5 py-3 text-base font-semibold">
        {title}
        {count !== undefined && <span className="ml-2 text-sm font-normal text-muted">({count})</span>}
      </h2>
      {children}
    </section>
  );
}

/** S-71: one organisation, with the staff actions of P6-02. */
export default function StaffOrgDetailPage() {
  const { orgId } = useParams<{ orgId: string }>();
  const router = useRouter();
  const { showToast } = useToast();
  const [detail, setDetail] = useState<StaffOrgDetail | null>(null);
  const [state, setState] = useState<"loading" | "ready" | "missing" | "error">("loading");
  const [dialog, setDialog] = useState<"trial" | "override" | "impersonate" | null>(null);
  const [trialDays, setTrialDays] = useState(7);
  const [overridePlan, setOverridePlan] = useState("agency_pro");
  const [overrideUntil, setOverrideUntil] = useState(() =>
    new Date(Date.now() + 30 * 86_400_000).toISOString().slice(0, 10),
  );

  const load = useCallback(async () => {
    try {
      setDetail(await staffApi.getOrg(orgId));
      setState("ready");
    } catch (err) {
      setState((err as { status?: number }).status === 404 ? "missing" : "error");
    }
  }, [orgId]);

  useEffect(() => {
    void load();
  }, [load]);

  const o = detail?.org;

  return (
    <StaffShell
      title={o?.name ?? "Organisation"}
     
      actions={
        o && !o.deletedAt ? (
          <div className="flex flex-wrap gap-2">
            {o.plan === "trial" && (
              <button type="button" className={btn.secondary} onClick={() => setDialog("trial")}>
                Extend trial
              </button>
            )}
            <button type="button" className={btn.secondary} onClick={() => setDialog("override")}>
              {o.planOverride ? "Change plan override" : "Override plan"}
            </button>
            {o.planOverride && (
              <button
                type="button"
                className={btn.secondary}
                onClick={async () => {
                  await staffApi.clearPlanOverride(o.id);
                  showToast("Plan override removed.");
                  await load();
                }}
              >
                Remove override
              </button>
            )}
            <button type="button" className={btn.primary} onClick={() => setDialog("impersonate")}>
              View as customer
            </button>
          </div>
        ) : undefined
      }
    >
      <p className="mb-4 text-sm">
        <Link href="/staff/orgs">← All organisations</Link>
      </p>

      {state === "loading" && <p role="status" className="text-muted">Loading…</p>}
      {state === "missing" && <p className="text-muted">This organisation does not exist.</p>}
      {state === "error" && (
        <p role="alert" className="text-crit">
          The organisation could not load.
        </p>
      )}

      {detail && o && (
        <div className="flex flex-col gap-5">
          <dl className={`${card} m-0 grid grid-cols-2 gap-4 sm:grid-cols-4 lg:grid-cols-6`}>
            {[
              ["Plan", label(o.plan)],
              ["Override", o.planOverride ? `${label(o.planOverride)} until ${formatDate(o.planOverrideExpiresAt)}` : "None"],
              ["Billing status", label(o.billingStatus)],
              ["Trial ends", formatDate(o.trialEndsAt)],
              ["MRR", detail.mrrCents ? formatMoney(detail.mrrCents) : "—"],
              ["Created", formatDate(o.createdAt)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-semibold text-muted">{k}</dt>
                <dd className="m-0 mt-0.5 text-sm font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {o.deletedAt && (
            <p role="note" className="m-0 rounded-xl border border-crit/40 bg-crit-soft px-4 py-3 text-sm">
              Deleted on {formatDate(o.deletedAt)}. All data is purged 30 days after deletion.
            </p>
          )}

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Members" count={detail.members.length}>
              <ul className="m-0 list-none divide-y divide-line p-0">
                {detail.members.map((m) => (
                  <li key={m.userId} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span>
                      <span className="font-semibold">{m.name || m.email}</span>
                      <span className="block text-xs text-muted">{m.email}</span>
                    </span>
                    <span className="text-muted">{label(m.role)}</span>
                  </li>
                ))}
              </ul>
            </Section>

            <Section title="Sites" count={detail.sites.length}>
              <ul className="m-0 list-none divide-y divide-line p-0">
                {detail.sites.map((s) => (
                  <li key={s.id} className="flex items-center justify-between gap-3 px-5 py-3 text-sm">
                    <span className="min-w-0">
                      <span className="font-semibold">{s.name}</span>
                      <span className="block truncate text-xs text-muted">
                        {s.rootUrl} · {s.platform} · {s.scanFrequency}
                      </span>
                    </span>
                    <span className="tnum text-muted">
                      {label(s.status)} {s.score !== null && `· ${s.score}`}
                    </span>
                  </li>
                ))}
                {detail.sites.length === 0 && <li className="px-5 py-3 text-sm text-muted">No sites yet.</li>}
              </ul>
            </Section>
          </div>

          <Section title="Recent scans" count={detail.recentScans.length}>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead className="bg-subtle">
                  <tr>
                    <th scope="col" className={th}>Queued</th>
                    <th scope="col" className={th}>Site</th>
                    <th scope="col" className={th}>Trigger</th>
                    <th scope="col" className={th}>Status</th>
                    <th scope="col" className={`${th} text-right`}>Pages</th>
                    <th scope="col" className={`${th} text-right`}>Score</th>
                    <th scope="col" className={th}>Error</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {detail.recentScans.map((s) => (
                    <tr key={s.id}>
                      <td className={td}>{formatDate(s.queuedAt, true)}</td>
                      <td className={td}>{s.siteName}</td>
                      <td className={td}>{s.trigger}</td>
                      <td className={`${td} ${s.status === "failed" ? "font-semibold text-crit" : ""}`}>{s.status}</td>
                      <td className={`${td} tnum text-right`}>{s.pagesScanned}</td>
                      <td className={`${td} tnum text-right`}>{s.score ?? "—"}</td>
                      <td className={`${td} text-xs text-muted`}>{s.errorCode ? `${s.errorCode}: ${s.errorMessage ?? ""}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <div className="grid gap-5 lg:grid-cols-2">
            <Section title="Billing and staff events" count={detail.billingEvents.length}>
              <ul className="m-0 list-none divide-y divide-line p-0">
                {detail.billingEvents.map((e) => (
                  <li key={e.id} className="px-5 py-3 text-sm">
                    <span className="font-mono font-semibold">{e.action}</span>
                    <span className="ml-2 text-xs text-muted">
                      {formatDate(e.createdAt, true)} · {e.actorType}
                    </span>
                    {typeof e.data?.reason === "string" && <span className="block text-xs text-muted">“{e.data.reason}”</span>}
                  </li>
                ))}
                {detail.billingEvents.length === 0 && <li className="px-5 py-3 text-sm text-muted">No events.</li>}
              </ul>
            </Section>
            <Section title="Subscription and invoices" count={detail.invoices.length}>
              <div className="px-5 py-3 text-sm">
                {detail.subscription ? (
                  <p className="m-0">
                    {label(detail.subscription.plan)} · {detail.subscription.interval}ly · {detail.subscription.status}
                    {detail.subscription.cancelAtPeriodEnd && " · cancels at period end"}
                    {detail.subscription.currentPeriodEnd && ` · renews ${formatDate(detail.subscription.currentPeriodEnd)}`}
                  </p>
                ) : (
                  <p className="m-0 text-muted">No Paddle subscription.</p>
                )}
              </div>
              <ul className="m-0 list-none divide-y divide-line border-t border-line p-0">
                {detail.invoices.map((inv) => (
                  <li key={inv.id} className="flex justify-between px-5 py-2.5 text-sm">
                    <span>{formatDate(inv.billedAt)}</span>
                    <span className="tnum">
                      {formatMoney(inv.amountCents, inv.currency)} · {inv.status}
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          </div>

          <ReasonDialog
            open={dialog === "trial"}
            title="Extend trial"
            description={`Adds days to the trial end (${formatDate(o.trialEndsAt)}). A trial that already ended goes back to trialing.`}
            confirmLabel="Extend trial"
            onClose={() => setDialog(null)}
            onConfirm={async (reason) => {
              await staffApi.extendTrial(o.id, trialDays, reason);
              showToast(`Trial extended by ${trialDays} days.`);
              await load();
            }}
          >
            <div>
              <label htmlFor="trial-days" className="mb-1 block text-sm font-semibold">
                Days to add
              </label>
              <input
                id="trial-days"
                type="number"
                min={1}
                max={60}
                value={trialDays}
                onChange={(e) => setTrialDays(Number(e.target.value))}
                className={input}
              />
            </div>
          </ReasonDialog>

          <ReasonDialog
            open={dialog === "override"}
            title="Override plan"
            description="Changes the limits and features the org gets until the date below. What they are billed for does not change."
            confirmLabel="Save override"
            onClose={() => setDialog(null)}
            onConfirm={async (reason) => {
              await staffApi.setPlanOverride(o.id, overridePlan, new Date(`${overrideUntil}T23:59:59Z`).toISOString(), reason);
              showToast("Plan override saved.");
              await load();
            }}
          >
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="override-plan" className="mb-1 block text-sm font-semibold">
                  Plan
                </label>
                <select id="override-plan" value={overridePlan} onChange={(e) => setOverridePlan(e.target.value)} className={input}>
                  {PLANS.map((p) => (
                    <option key={p} value={p}>
                      {label(p)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="override-until" className="mb-1 block text-sm font-semibold">
                  Expires on
                </label>
                <input
                  id="override-until"
                  type="date"
                  value={overrideUntil}
                  min={new Date().toISOString().slice(0, 10)}
                  onChange={(e) => setOverrideUntil(e.target.value)}
                  className={input}
                />
              </div>
            </div>
          </ReasonDialog>

          <ReasonDialog
            open={dialog === "impersonate"}
            title={`View ${o.name} as the customer`}
            description="You will see their app read-only, with a banner on every page. Starting and stopping are both recorded in their audit log."
            confirmLabel="Start viewing"
            onClose={() => setDialog(null)}
            onConfirm={async (reason) => {
              const res = await staffApi.impersonate(o.id, reason);
              router.push(`/${res.org.slug ?? res.org.id}`);
            }}
          />
        </div>
      )}
    </StaffShell>
  );
}
