"use client";

import React, { useCallback, useEffect, useState } from "react";
import { StaffShell, btn, card, formatDate } from "@/components/staff/staff-shell";
import { useToast } from "@/components/shell/toast-context";
import { staffApi, type FlaggedSuggestion } from "@/lib/admin-api";

/** S-74: AI fix suggestions users reported as wrong (P6-05). */
export default function StaffContentPage() {
  const { showToast } = useToast();
  const [items, setItems] = useState<FlaggedSuggestion[] | null>(null);
  const [error, setError] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setItems(await staffApi.flaggedSuggestions());
      setError(false);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const act = async (s: FlaggedSuggestion, action: "approve" | "delete" | "promote") => {
    setBusy(s.id);
    try {
      if (action === "approve") {
        await staffApi.approveSuggestion(s.id);
        showToast("Suggestion approved. It will be shown again.");
      } else if (action === "delete") {
        await staffApi.deleteSuggestion(s.id);
        showToast("Suggestion deleted. A new one is generated next time it is asked for.");
      } else {
        const { guide } = await staffApi.promoteSuggestion(s.id);
        showToast(`Draft guide ${guide.slug} created. Edit it in packages/fix-guides before publishing.`);
      }
      await load();
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That did not work.", { type: "error" });
    } finally {
      setBusy(null);
    }
  };

  return (
    <StaffShell title="Content review" screen="S-74">
      <p className="mb-4 max-w-3xl text-sm text-muted">
        These AI suggestions were reported as wrong or unhelpful and are hidden from customers. Approve one to show it
        again, delete it so a fresh one is generated, or turn a good one into an unpublished written-guide draft.
      </p>
      {error && (
        <p role="alert" className="text-sm text-crit">
          Flagged suggestions could not load.
        </p>
      )}
      {items && items.length === 0 && (
        <div className={`${card} text-center text-sm text-muted`}>Nothing to review. No suggestions are flagged.</div>
      )}
      <ul className="m-0 flex list-none flex-col gap-4 p-0">
        {items?.map((s) => (
          <li key={s.id} className={card}>
            <article aria-labelledby={`s-${s.id}`}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 id={`s-${s.id}`} className="m-0 text-base font-semibold">
                  <span className="font-mono">{s.ruleId}</span> on {s.platform}
                </h2>
                <span className="text-xs text-muted">
                  {s.model} · flagged {formatDate(s.updatedAt, true)}
                </span>
              </div>
              <pre className="mt-3 max-h-80 overflow-auto whitespace-pre-wrap rounded-xl bg-subtle p-4 font-sans text-sm leading-6">
                {s.suggestionMd}
              </pre>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" className={btn.secondary} disabled={busy === s.id} onClick={() => void act(s, "approve")}>
                  Approve
                </button>
                <button type="button" className={btn.secondary} disabled={busy === s.id} onClick={() => void act(s, "promote")}>
                  Promote to guide draft
                </button>
                <button type="button" className={btn.danger} disabled={busy === s.id} onClick={() => void act(s, "delete")}>
                  Delete
                </button>
              </div>
            </article>
          </li>
        ))}
      </ul>
    </StaffShell>
  );
}
