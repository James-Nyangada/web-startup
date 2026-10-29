"use client";

import React, { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ReasonDialog, StaffShell, btn, card, formatDate, input, td, th } from "@/components/staff/staff-shell";
import { useToast } from "@/components/shell/toast-context";
import { formatMoney, staffApi, type StaffOrgDetail } from "@/lib/admin-api";

const PLANS = ["trial", "store", "growth", "agency", "agency_pro"];
const CANCEL_REASONS: Record<string, string> = {
  too_expensive: "Too expensive / reduced budget",
  missing_features: "Missing features they need",
  fixed_issues: "Fixed accessibility issues / project completed",
  hard_to_use: "Hard to use / steep learning curve",
  switched_tool: "Switched to another tool",
  other: "Other reason",
  unspecified: "No reason given",
};
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

  // Phase 8 additions: Notes, Tags, Timeline, Email
  const [notes, setNotes] = useState<any[]>([]);
  const [tags, setTags] = useState<any[]>([]);
  const [timeline, setTimeline] = useState<any[]>([]);
  const [newNote, setNewNote] = useState("");
  const [newTag, setNewTag] = useState("");
  const [emailModal, setEmailModal] = useState(false);
  const [emailTo, setEmailTo] = useState("");
  const [emailTemplate, setEmailTemplate] = useState("welcome_check_in");
  const [emailSubject, setEmailSubject] = useState("Welcome to EveryVisitor - How is your accessibility scan going?");
  const [emailBody, setEmailBody] = useState("Hi,\n\nI noticed you started setting up EveryVisitor. Let me know if you need any help verifying your site or interpreting the scan issues!\n\nBest,\nEveryVisitor Team");
  const [sendingEmail, setSendingEmail] = useState(false);

  const loadExtra = useCallback(async () => {
    try {
      const [n, t, tl] = await Promise.all([
        staffApi.notes(orgId),
        staffApi.tags(orgId),
        staffApi.timeline(orgId),
      ]);
      setNotes(n || []);
      setTags(t || []);
      setTimeline(tl || []);
    } catch {
      // Non-critical
    }
  }, [orgId]);

  const load = useCallback(async () => {
    try {
      const orgDetail = await staffApi.getOrg(orgId);
      setDetail(orgDetail);
      if (orgDetail?.members?.[0]?.email) {
        setEmailTo(orgDetail.members[0].email);
      }
      setState("ready");
      void loadExtra();
    } catch (err) {
      setState((err as { status?: number }).status === 404 ? "missing" : "error");
    }
  }, [orgId, loadExtra]);

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
            <button type="button" className={btn.secondary} onClick={() => setEmailModal(true)}>
              Email customer
            </button>
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
              ["MRR", detail.mrrCents ? formatMoney(detail.mrrCents) : "-"],
              ["Created", formatDate(o.createdAt)],
            ].map(([k, v]) => (
              <div key={k}>
                <dt className="text-xs font-semibold text-muted">{k}</dt>
                <dd className="m-0 mt-0.5 text-sm font-semibold">{v}</dd>
              </div>
            ))}
          </dl>
          {detail.health ? (
            <section aria-label="Customer health" className={`${card} flex flex-col gap-2`}>
              <div className="flex flex-wrap items-center gap-3">
                <h2 className="m-0 text-base font-semibold">Health</h2>
                <span
                  className={`rounded-full border px-2.5 py-0.5 text-xs font-bold ${
                    detail.health.band === "good"
                      ? "border-ok/20 bg-ok-soft text-ok"
                      : detail.health.band === "at_risk"
                        ? "border-amber-500/20 bg-amber-500/10 text-amber-700"
                        : "border-crit/20 bg-crit-soft text-crit"
                  }`}
                >
                  {detail.health.score}/100 · {label(detail.health.band)}
                </span>
                <span className="text-xs text-muted">Calculated {formatDate(detail.health.computedAt)}</span>
              </div>
              {detail.health.reasons.length > 0 ? (
                <ul className="m-0 list-disc pl-5 text-sm text-ink/90">
                  {detail.health.reasons.map((r) => (
                    <li key={r}>{r}</li>
                  ))}
                </ul>
              ) : (
                <p className="m-0 text-sm text-muted">No concerns: the customer is signing in, scanning and paid up.</p>
              )}
            </section>
          ) : (
            <p className="m-0 text-xs text-muted">No health score yet. Scores are calculated every night.</p>
          )}
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

          <div className="grid gap-5 lg:grid-cols-2">
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
                      <td className={`${td} tnum text-right`}>{s.score ?? "-"}</td>
                      <td className={`${td} text-xs text-muted`}>{s.errorCode ? `${s.errorCode}: ${s.errorMessage ?? ""}` : ""}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Section>

          <Section title="Billing and staff events" count={detail.billingEvents.length}>
              <ul className="m-0 list-none divide-y divide-line p-0">
                {detail.billingEvents.map((e) => (
                  <li key={e.id} className="px-5 py-3 text-sm">
                    <span className="font-mono font-semibold">{e.action}</span>
                    <span className="ml-2 text-xs text-muted">
                      {formatDate(e.createdAt, true)} · {e.actorType}
                    </span>
                    {e.action === "billing.subscription_cancelled" ? (
                      <span className="mt-1 block rounded-lg bg-subtle px-3 py-2 text-xs">
                        <span className="block font-semibold">
                          Reason: {CANCEL_REASONS[String(e.data?.reason)] ?? String(e.data?.reason ?? "No reason given")}
                        </span>
                        {typeof e.data?.feedback === "string" && e.data.feedback && (
                          <span className="mt-1 block text-muted">“{e.data.feedback}”</span>
                        )}
                      </span>
                    ) : (
                      typeof e.data?.reason === "string" && <span className="block text-xs text-muted">“{e.data.reason}”</span>
                    )}
                  </li>
                ))}
                {detail.billingEvents.length === 0 && <li className="px-5 py-3 text-sm text-muted">No events.</li>}
              </ul>
            </Section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
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

            {/* P8-19: Tags & Organization Labels */}
            <Section title="Tags & Segments" count={tags.length}>
              <div className="p-5 flex flex-col gap-4">
                <div className="flex flex-wrap gap-2 items-center">
                  {tags.map((t) => (
                    <span
                      key={t.id || t.tag}
                      className="inline-flex items-center gap-1.5 rounded-full bg-primary-soft border border-primary/20 px-3 py-1 text-xs font-semibold text-primary"
                    >
                      {t.tag}
                      <button
                        type="button"
                        onClick={async () => {
                          try {
                            await staffApi.removeTag(o.id, t.tag);
                            showToast("Tag removed.");
                            void loadExtra();
                          } catch (err) {
                            showToast(err instanceof Error ? err.message : "Failed to remove tag.");
                          }
                        }}
                        className="hover:text-crit"
                        title={`Remove tag ${t.tag}`}
                      >
                        ×
                      </button>
                    </span>
                  ))}
                  {tags.length === 0 && <span className="text-sm text-muted">No tags assigned yet.</span>}
                </div>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newTag.trim()) return;
                    try {
                      await staffApi.addTag(o.id, newTag.trim());
                      setNewTag("");
                      showToast("Tag added.");
                      void loadExtra();
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : "Failed to add tag.");
                    }
                  }}
                  className="flex gap-2 max-w-sm"
                >
                  <input
                    type="text"
                    value={newTag}
                    onChange={(e) => setNewTag(e.target.value)}
                    placeholder="Add tag (e.g. vip, agency)"
                    className={input}
                  />
                  <button type="submit" className={btn.secondary}>
                    Add
                  </button>
                </form>
              </div>
            </Section>
          </div>

          <div className="grid gap-5 lg:grid-cols-2">
            {/* P8-19: Internal Staff Notes */}
            <Section title="Staff Notes" count={notes.length}>
              <div className="p-5 flex flex-col gap-4">
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!newNote.trim()) return;
                    try {
                      await staffApi.addNote(o.id, newNote.trim());
                      setNewNote("");
                      showToast("Note added.");
                      void loadExtra();
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : "Failed to add note.");
                    }
                  }}
                  className="flex flex-col gap-2"
                >
                  <textarea
                    rows={3}
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    placeholder="Write an internal note (Markdown supported)…"
                    className={input}
                  />
                  <div className="flex justify-end">
                    <button type="submit" className={btn.primary}>
                      Add note
                    </button>
                  </div>
                </form>

                <div className="divide-y divide-line">
                  {notes.map((n) => (
                    <div key={n.id} className="py-3 text-sm">
                      <div className="flex justify-between items-center text-xs text-muted mb-1">
                        <span className="font-semibold text-ink">{n.authorName || "Staff member"}</span>
                        <span>{formatDate(n.createdAt, true)}</span>
                      </div>
                      <div className="text-ink whitespace-pre-wrap">{n.bodyMd}</div>
                    </div>
                  ))}
                  {notes.length === 0 && <p className="text-sm text-muted my-2">No notes added yet.</p>}
                </div>
              </div>
            </Section>

            {/* P8-19: Chronological Customer Timeline */}
            <Section title="Chronological Customer Timeline" count={timeline.length}>
              <div className="p-5">
                <ol className="relative border-l border-line ml-3 space-y-4">
                  {timeline.map((item, idx) => (
                    <li key={idx} className="ml-4">
                      <div className="absolute -left-1.5 mt-1.5 size-3 rounded-full border border-surface bg-primary" />
                      <time className="mb-1 text-xs font-mono font-medium leading-none text-muted">
                        {formatDate(item.date, true)}
                      </time>
                      <h4 className="text-sm font-semibold text-ink">{item.title}</h4>
                      <p className="text-xs text-muted mt-0.5">{item.description}</p>
                    </li>
                  ))}
                  {timeline.length === 0 && (
                    <li className="ml-4 text-sm text-muted">No timeline events recorded yet.</li>
                  )}
                </ol>
              </div>
            </Section>
          </div>

          {/* Email Customer Modal */}
          {emailModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
              <div className="w-full max-w-lg rounded-2xl border border-line bg-surface p-6 shadow-2xl">
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="m-0 text-lg font-semibold text-ink">Email customer ({o.name})</h3>
                  <button
                    type="button"
                    onClick={() => setEmailModal(false)}
                    className="text-muted hover:text-ink text-xl font-bold"
                  >
                    ×
                  </button>
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!emailTo || !emailSubject || !emailBody) return;
                    setSendingEmail(true);
                    try {
                      await staffApi.sendEmail(o.id, {
                        toEmail: emailTo,
                        template: emailTemplate,
                        subject: emailSubject,
                        bodyMd: emailBody,
                      });
                      showToast("Email sent and recorded on timeline.");
                      setEmailModal(false);
                      void loadExtra();
                    } catch (err) {
                      showToast(err instanceof Error ? err.message : "Failed to send email.");
                    } finally {
                      setSendingEmail(false);
                    }
                  }}
                  className="flex flex-col gap-3 text-sm"
                >
                  <div>
                    <label className="block text-xs font-semibold text-ink">To</label>
                    <input
                      type="email"
                      required
                      value={emailTo}
                      onChange={(e) => setEmailTo(e.target.value)}
                      className={input}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">Template</label>
                    <select
                      value={emailTemplate}
                      onChange={(e) => {
                        const t = e.target.value;
                        setEmailTemplate(t);
                        if (t === "welcome_check_in") {
                          setEmailSubject("Welcome to EveryVisitor - How is your accessibility scan going?");
                          setEmailBody("Hi,\n\nI noticed you started setting up EveryVisitor. Let me know if you need any help verifying your site or interpreting the scan issues!\n\nBest,\nEveryVisitor Team");
                        } else if (t === "trial_help") {
                          setEmailSubject("Need help fixing accessibility issues before your trial ends?");
                          setEmailBody("Hi,\n\nYour 14-day EveryVisitor trial has a few days left. We noticed you have some unfixed contrast and alt text issues. Can I help your developers with our step-by-step fix guides?\n\nBest,\nEveryVisitor Team");
                        } else if (t === "inactive_check_in") {
                          setEmailSubject("Everything running smoothly with your accessibility monitoring?");
                          setEmailBody("Hi,\n\nWe haven't seen you in the EveryVisitor dashboard recently. Your automated scans are still running in the background. Let us know if you need any report customization or team access!\n\nBest,\nEveryVisitor Team");
                        } else if (t === "payment_issue") {
                          setEmailSubject("Action required: Update payment method for EveryVisitor");
                          setEmailBody("Hi,\n\nWe were unable to process your latest subscription renewal. Please update your billing details in the account settings to ensure uninterrupted automated monitoring.\n\nBest,\nEveryVisitor Team");
                        }
                      }}
                      className={input}
                    >
                      <option value="welcome_check_in">Welcome check-in</option>
                      <option value="trial_help">Trial activation help</option>
                      <option value="inactive_check_in">Inactive check-in</option>
                      <option value="payment_issue">Payment renewal issue</option>
                      <option value="custom">Custom email</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">Subject</label>
                    <input
                      type="text"
                      required
                      value={emailSubject}
                      onChange={(e) => setEmailSubject(e.target.value)}
                      className={input}
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-ink">Message (Markdown)</label>
                    <textarea
                      rows={6}
                      required
                      value={emailBody}
                      onChange={(e) => setEmailBody(e.target.value)}
                      className={input}
                    />
                  </div>

                  <div className="mt-2 flex justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setEmailModal(false)}
                      className={btn.secondary}
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={sendingEmail}
                      className={btn.primary}
                    >
                      {sendingEmail ? "Sending…" : "Send Email"}
                    </button>
                  </div>
                </form>
              </div>
            </div>
          )}

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
