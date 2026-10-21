"use client";

import React, { useCallback, useEffect, useState } from "react";
import { StaffShell, btn, card, formatDate, input } from "@/components/staff/staff-shell";
import { useToast } from "@/components/shell/toast-context";
import { staffApi, type FeatureFlag } from "@/lib/admin-api";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseOrgIds(text: string): { ids: string[]; invalid: string[] } {
  const parts = text
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return { ids: parts.filter((p) => UUID.test(p)), invalid: parts.filter((p) => !UUID.test(p)) };
}

function FlagEditor({
  flag,
  onSaved,
}: {
  flag?: FeatureFlag;
  onSaved: () => Promise<void>;
}) {
  const { showToast } = useToast();
  const [key, setKey] = useState(flag?.key ?? "");
  const [enabled, setEnabled] = useState(flag?.enabled ?? false);
  const [orgText, setOrgText] = useState((flag?.orgIds ?? []).join("\n"));
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const idBase = flag ? `flag-${flag.key}` : "flag-new";

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    const { ids, invalid } = parseOrgIds(orgText);
    if (invalid.length) {
      setError(`These are not organisation IDs: ${invalid.join(", ")}`);
      return;
    }
    if (!/^[a-z0-9][a-z0-9_.-]{1,63}$/.test(key)) {
      setError("Use 2–64 lowercase letters, numbers, dots, dashes or underscores.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await staffApi.saveFlag(key, enabled, ids);
      showToast(`Flag ${key} saved.`);
      if (!flag) {
        setKey("");
        setOrgText("");
        setEnabled(false);
      }
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={save} className={card} aria-labelledby={`${idBase}-title`} noValidate>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id={`${idBase}-title`} className="m-0 text-base font-semibold">
          {flag ? <span className="font-mono">{flag.key}</span> : "New flag"}
        </h2>
        {flag && <span className="text-xs text-muted">Updated {formatDate(flag.updatedAt, true)}</span>}
      </div>
      <div className="grid gap-4 md:grid-cols-[1fr_2fr]">
        <div className="flex flex-col gap-3">
          {!flag && (
            <div>
              <label htmlFor={`${idBase}-key`} className="mb-1 block text-sm font-semibold">
                Key
              </label>
              <input id={`${idBase}-key`} value={key} onChange={(e) => setKey(e.target.value)} className={`${input} font-mono`} />
            </div>
          )}
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} className="size-4" />
            Enabled
          </label>
          <p className="m-0 text-xs text-muted">
            {enabled
              ? orgText.trim()
                ? "On only for the organisations listed."
                : "On for every organisation."
              : "Off for everyone."}
          </p>
        </div>
        <div>
          <label htmlFor={`${idBase}-orgs`} className="mb-1 block text-sm font-semibold">
            Allow-list (organisation IDs)
          </label>
          <textarea
            id={`${idBase}-orgs`}
            rows={3}
            value={orgText}
            onChange={(e) => setOrgText(e.target.value)}
            aria-describedby={`${idBase}-orgs-hint`}
            className={`${input} font-mono text-xs`}
          />
          <p id={`${idBase}-orgs-hint`} className="m-0 mt-1 text-xs text-muted">
            One per line or comma-separated. Leave empty to apply to everyone.
          </p>
        </div>
      </div>
      {error && (
        <p role="alert" className="m-0 mt-3 text-sm text-crit">
          {error}
        </p>
      )}
      <div className="mt-4 flex gap-2">
        <button type="submit" className={btn.primary} disabled={busy}>
          {busy ? "Saving…" : flag ? "Save" : "Create flag"}
        </button>
        {flag && (
          <button
            type="button"
            className={btn.danger}
            onClick={async () => {
              await staffApi.deleteFlag(flag.key);
              showToast(`Flag ${flag.key} deleted. Code that checks it now uses its default.`);
              await onSaved();
            }}
          >
            Delete
          </button>
        )}
      </div>
    </form>
  );
}

/** S-75: feature flags with org allow-lists (P6-05). */
export default function StaffFlagsPage() {
  const [flags, setFlags] = useState<FeatureFlag[] | null>(null);
  const [error, setError] = useState(false);

  const load = useCallback(async () => {
    try {
      setFlags(await staffApi.flags());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <StaffShell title="Feature flags" screen="S-75">
      {error && (
        <p role="alert" className="text-sm text-crit">
          Flags could not load.
        </p>
      )}
      <div className="flex flex-col gap-4">
        {flags?.map((f) => <FlagEditor key={`${f.key}-${f.updatedAt}`} flag={f} onSaved={load} />)}
        {flags && flags.length === 0 && (
          <p className="m-0 text-sm text-muted">No flags yet. Flags that do not exist use the default in code.</p>
        )}
        <FlagEditor onSaved={load} />
      </div>
    </StaffShell>
  );
}
