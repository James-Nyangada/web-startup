"use client";

import { useEffect, useRef, useState } from "react";
import { Icon, I } from "@/components/icons";
import { useFocusTrap } from "@/components/use-focus-trap";
import { IGNORE_REASONS } from "@/lib/site-data";
import { gsap, useGSAP, MOTION, prefersReducedMotion } from "@/lib/gsap";

/** Ignore dialog (S-26). Focus starts on the first radio; note is required for the last two reasons. */
export function IgnoreDialog({ onCancel, onConfirm }: { onCancel: () => void; onConfirm: (reason: string, note?: string) => void }) {
  const [reason, setReason] = useState(0);
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState(false);
  const scrim = useRef<HTMLDivElement>(null);
  const dialog = useRef<HTMLDivElement>(null);
  const firstRadio = useRef<HTMLInputElement>(null);
  const required = reason >= 2;

  useFocusTrap(dialog, true);
  useEffect(() => firstRadio.current?.focus(), []);

  useGSAP(() => {
    const reduced = prefersReducedMotion();
    // Opacity only (not autoAlpha): the first radio must stay focusable while the dialog fades in.
    gsap.fromTo(scrim.current, { opacity: 0 }, { opacity: 1, duration: MOTION.panel, ease: MOTION.ease });
    gsap.fromTo(dialog.current, reduced ? { opacity: 0 } : { opacity: 0, scale: 0.96, y: 8 }, { opacity: 1, scale: 1, y: 0, duration: MOTION.panel, ease: MOTION.ease });
  });

  const confirm = () => {
    if (required && !note.trim()) {
      setNoteError(true);
      return;
    }
    onConfirm(IGNORE_REASONS[reason].toLowerCase(), note.trim() || undefined);
  };

  return (
    <div ref={scrim} className="fixed inset-0 z-30 grid place-items-center bg-scrim p-4">
      <div
        ref={dialog}
        role="dialog"
        aria-modal="true"
        aria-labelledby="ig-title"
        className="flex w-[min(480px,100%)] flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-dialog"
      >
        <h2 id="ig-title" className="m-0 text-xl leading-7 font-semibold">
          Ignore this issue?
        </h2>
        <p className="m-0 text-sm leading-5 text-muted">Ignored issues stay in your evidence log with your reason, so the history stays honest.</p>
        <fieldset className="m-0 flex flex-col gap-2 border-0 p-0">
          <legend className="mb-2 font-semibold">Reason</legend>
          {IGNORE_REASONS.map((r, i) => (
            <label key={r} className="flex cursor-pointer items-center gap-2.5 text-sm">
              <input
                ref={i === 0 ? firstRadio : undefined}
                type="radio"
                name="reason"
                checked={reason === i}
                onChange={() => {
                  setReason(i);
                  setNoteError(false);
                }}
                className="m-0 size-[18px] accent-ptext"
              />
              {r}
            </label>
          ))}
        </fieldset>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="ig-note" className="text-sm font-semibold">
            Note {required ? "(required)" : "(optional)"}
          </label>
          <textarea
            id="ig-note"
            rows={3}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              setNoteError(false);
            }}
            aria-invalid={noteError}
            aria-describedby={noteError ? "ig-note-error" : undefined}
            className={`rounded border bg-surface px-3 py-2.5 text-sm text-ink ${noteError ? "border-crit" : "border-line-strong"}`}
          />
          {noteError && (
            <span id="ig-note-error" className="flex items-center gap-1.5 text-sm text-crit">
              <Icon d={I.critical} />
              Add a note explaining this decision.
            </span>
          )}
        </div>
        <div className="flex justify-end gap-3">
          <button type="button" onClick={onCancel} className="ease-ui h-10 rounded-full border border-line-strong bg-surface px-4 text-sm font-semibold text-ink hover:bg-subtle">
            Cancel
          </button>
          <button type="button" onClick={confirm} className="ease-ui h-10 rounded-full border-0 bg-primary px-4 text-sm font-semibold text-on-primary hover:bg-primary-hover">
            Ignore issue
          </button>
        </div>
      </div>
    </div>
  );
}
