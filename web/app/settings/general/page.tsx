"use client";

import React, { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SettingsLayout } from "@/components/settings/settings-layout";
import { useToast } from "@/components/shell/toast-context";
import { apiClient } from "@/lib/api";
import { useActiveOrg } from "@/lib/use-active-org";
import { resetCurrentUser } from "@/lib/use-current-user";
import { OrgLogoField } from "@/components/settings/org-logo-field";
import { appApi, type ApiMember } from "@/lib/app-api";

const field =
  "h-10 rounded-xl border border-line bg-surface px-3 text-sm text-ink outline-none focus:border-primary focus:ring-1 focus:ring-primary";

const TIME_ZONES = [
  "UTC",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "Africa/Nairobi",
  "Asia/Dubai",
  "Asia/Singapore",
  "Australia/Sydney",
];

interface OrgDetails {
  id: string;
  name: string;
  slug: string | null;
  type: "agency" | "store";
  timeZone: string;
}

function ConfirmDialog({
  open,
  title,
  onClose,
  children,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    else if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      aria-labelledby={`${title}-title`}
      className="w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-ink shadow-dialog backdrop:bg-scrim/60"
    >
      <div className="flex flex-col gap-4 p-6">
        <h2 id={`${title}-title`} className="m-0 text-lg font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}

/** S-40: organisation name, slug, time zone; ownership transfer; deletion (P6-09). */
export default function GeneralSettingsPage() {
  const { showToast } = useToast();
  const router = useRouter();
  const { slug: activeSlug, role } = useActiveOrg();
  const [org, setOrg] = useState<OrgDetails | null>(null);
  const [name, setName] = useState("");
  const [slug, setSlug] = useState("");
  const [timeZone, setTimeZone] = useState("UTC");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [admins, setAdmins] = useState<ApiMember[]>([]);
  const [dialog, setDialog] = useState<"transfer" | "delete" | null>(null);
  const [newOwner, setNewOwner] = useState("");
  const [confirmName, setConfirmName] = useState("");
  const [dialogError, setDialogError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const canEdit = role === "owner" || role === "admin";
  const isOwner = role === "owner";

  useEffect(() => {
    if (!activeSlug) return;
    apiClient<{ org: OrgDetails }>(`/v1/orgs/${activeSlug}`)
      .then(({ org: o }) => {
        setOrg(o);
        setName(o.name);
        setSlug(o.slug ?? "");
        setTimeZone(o.timeZone);
      })
      .catch(() => setOrg(null));
    appApi
      .listMembers(activeSlug)
      .then((m) => setAdmins(m.filter((x) => x.role === "admin")))
      .catch(() => setAdmins([]));
  }, [activeSlug]);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!org) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await apiClient<{ org: OrgDetails }>(`/v1/orgs/${org.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), slug: slug.trim(), timeZone }),
      });
      setOrg(res.org);
      resetCurrentUser();
      showToast("Organisation settings saved.");
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Settings could not be saved.");
    } finally {
      setSaving(false);
    }
  };

  const transfer = async () => {
    if (!org || !newOwner) return;
    setBusy(true);
    setDialogError(null);
    try {
      await apiClient(`/v1/orgs/${org.id}/transfer-ownership`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ newOwnerId: newOwner }),
      });
      resetCurrentUser();
      showToast("Ownership transferred. You are now an admin.");
      setDialog(null);
      router.refresh();
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "Ownership could not be transferred.");
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!org) return;
    setBusy(true);
    setDialogError(null);
    try {
      await apiClient(`/v1/orgs/${org.id}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmName }),
      });
      resetCurrentUser();
      setDialog(null);
      router.push("/onboarding");
    } catch (err) {
      setDialogError(err instanceof Error ? err.message : "The organisation could not be deleted.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SettingsLayout title="General Settings" description="Your organisation’s name, address and time zone.">
      <div className="flex max-w-2xl flex-col gap-6">
        <form onSubmit={save} className="flex flex-col gap-5 rounded-2xl border border-line bg-surface p-6 shadow-card" noValidate>
          <h2 className="m-0 text-base font-semibold text-ink">Organisation profile</h2>
          {!canEdit && role && <p className="m-0 text-sm text-muted">Only owners and admins can change these settings.</p>}

          {org && activeSlug && <OrgLogoField slug={activeSlug} name={org.name} canEdit={canEdit} />}

          <div className="flex flex-col gap-1.5">
            <label htmlFor="orgName" className="text-sm font-medium text-ink">
              Organisation name
            </label>
            <input id="orgName" value={name} onChange={(e) => setName(e.target.value)} disabled={!canEdit} maxLength={100} className={field} />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="slug" className="text-sm font-medium text-ink">
              URL slug
            </label>
            <input
              id="slug"
              value={slug}
              onChange={(e) => setSlug(e.target.value.toLowerCase())}
              disabled={!canEdit}
              aria-describedby="slug-hint"
              className={`${field} font-mono`}
            />
            <p id="slug-hint" className="m-0 text-xs text-muted">
              Appears in your app and client portal links. Changing it breaks old bookmarks.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="timeZone" className="text-sm font-medium text-ink">
              Time zone
            </label>
            <select id="timeZone" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} disabled={!canEdit} className={field} aria-describedby="tz-hint">
              {[...new Set([timeZone, ...TIME_ZONES])].map((tz) => (
                <option key={tz} value={tz}>
                  {tz.replace(/_/g, " ")}
                </option>
              ))}
            </select>
            <p id="tz-hint" className="m-0 text-xs text-muted">
              Scheduled scans and the weekly digest follow this time zone.
            </p>
          </div>

          {org && (
            <p className="m-0 text-sm text-muted">
              Type: <strong className="text-ink">{org.type === "agency" ? "Agency" : "Store"}</strong>
            </p>
          )}

          {saveError && (
            <p role="alert" className="m-0 text-sm text-crit">
              {saveError}
            </p>
          )}
          {canEdit && (
            <div className="flex justify-end">
              <button
                type="submit"
                disabled={saving || !org}
                className="ease-ui rounded-full bg-primary px-5 py-2.5 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
              >
                {saving ? "Saving…" : "Save changes"}
              </button>
            </div>
          )}
        </form>

        {isOwner && org && (
          <section aria-labelledby="transfer-title" className="flex flex-col gap-3 rounded-2xl border border-line bg-surface p-6 shadow-card">
            <h2 id="transfer-title" className="m-0 text-base font-semibold text-ink">
              Transfer ownership
            </h2>
            <p className="m-0 text-sm text-muted">
              Hand the organisation, its billing and its API keys to an admin. You stay on as an admin.
            </p>
            <div>
              <button
                type="button"
                disabled={admins.length === 0}
                onClick={() => {
                  setNewOwner(admins[0]?.userId ?? "");
                  setDialogError(null);
                  setDialog("transfer");
                }}
                className="ease-ui rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-subtle disabled:opacity-50"
              >
                Transfer ownership
              </button>
              {admins.length === 0 && (
                <p className="m-0 mt-2 text-xs text-muted">Make someone an admin in Team &amp; Members first.</p>
              )}
            </div>
          </section>
        )}

        {isOwner && org && (
          <section aria-labelledby="danger-title" className="flex flex-col gap-3 rounded-2xl border border-crit/40 bg-surface p-6 shadow-card">
            <h2 id="danger-title" className="m-0 text-base font-semibold text-crit">
              Delete organisation
            </h2>
            <p className="m-0 text-sm text-muted">
              Members lose access straight away and any subscription is cancelled at the end of the period. All sites,
              scans, reports and files are permanently erased after 30 days. Export anything you need first.
            </p>
            <div>
              <button
                type="button"
                onClick={() => {
                  setConfirmName("");
                  setDialogError(null);
                  setDialog("delete");
                }}
                className="ease-ui rounded-full border border-crit px-4 py-2 text-sm font-semibold text-crit hover:bg-crit-soft"
              >
                Delete {org.name}
              </button>
            </div>
          </section>
        )}
      </div>

      <ConfirmDialog open={dialog === "transfer"} title="Transfer ownership" onClose={() => setDialog(null)}>
        <label htmlFor="new-owner" className="text-sm font-semibold">
          New owner
        </label>
        <select id="new-owner" value={newOwner} onChange={(e) => setNewOwner(e.target.value)} className={field}>
          {admins.map((a) => (
            <option key={a.userId} value={a.userId}>
              {a.name ? `${a.name} (${a.email})` : a.email}
            </option>
          ))}
        </select>
        {dialogError && (
          <p role="alert" className="m-0 text-sm text-crit">
            {dialogError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setDialog(null)} className="ease-ui rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-subtle">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void transfer()}
            disabled={busy || !newOwner}
            className="ease-ui rounded-full bg-primary px-4 py-2 text-sm font-semibold text-on-primary hover:bg-primary-hover disabled:opacity-50"
          >
            {busy ? "Transferring…" : "Transfer ownership"}
          </button>
        </div>
      </ConfirmDialog>

      <ConfirmDialog open={dialog === "delete"} title="Delete organisation" onClose={() => setDialog(null)}>
        <p className="m-0 text-sm text-muted">
          This cannot be undone after 30 days. To confirm, type <strong className="text-ink">{org?.name}</strong>.
        </p>
        <label htmlFor="confirm-org-name" className="text-sm font-semibold">
          Organisation name
        </label>
        <input
          id="confirm-org-name"
          value={confirmName}
          onChange={(e) => setConfirmName(e.target.value)}
          autoComplete="off"
          className={field}
          aria-invalid={dialogError ? true : undefined}
        />
        {dialogError && (
          <p role="alert" className="m-0 text-sm text-crit">
            {dialogError}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <button type="button" onClick={() => setDialog(null)} className="ease-ui rounded-full border border-line px-4 py-2 text-sm font-semibold text-ink hover:bg-subtle">
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void remove()}
            disabled={busy || confirmName !== org?.name}
            className="ease-ui rounded-full bg-crit px-4 py-2 text-sm font-semibold text-on-primary hover:opacity-90 disabled:opacity-50"
          >
            {busy ? "Deleting…" : "Delete organisation"}
          </button>
        </div>
      </ConfirmDialog>
    </SettingsLayout>
  );
}
