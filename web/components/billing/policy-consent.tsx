"use client";

import Link from "next/link";
import { useId } from "react";

/** Checkbox the buyer must tick before paying. Never pre-ticked. */
export function PolicyConsent({
  checked,
  onChange,
  showError,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  showError?: boolean;
}) {
  const errorId = useId();
  return (
    <div className="flex flex-col gap-1">
      <label className="flex items-start gap-2.5 text-sm text-ink cursor-pointer">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={showError && !checked ? errorId : undefined}
          aria-invalid={showError && !checked ? true : undefined}
          className="mt-0.5 size-4 shrink-0 accent-[var(--color-primary)]"
        />
        <span>
          I agree to the{" "}
          <Link href="/legal/terms" target="_blank" className="text-primary underline">
            Terms of Service
          </Link>{" "}
          and the{" "}
          <Link href="/legal/refunds" target="_blank" className="text-primary underline">
            Refund Policy
          </Link>
          .
        </span>
      </label>
      {showError && !checked && (
        <p id={errorId} role="alert" className="m-0 pl-6.5 text-xs font-semibold text-crit">
          Tick the box to agree before you continue.
        </p>
      )}
    </div>
  );
}
