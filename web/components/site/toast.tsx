"use client";

import { useRef } from "react";
import { Icon, I } from "@/components/icons";
import { gsap, useGSAP, MOTION, prefersReducedMotion } from "@/lib/gsap";

/** Success toast - polite live region, closes after 6s (paused on hover/focus by the parent). */
export function Toast({
  message,
  onClose,
  onPause,
  onResume,
}: {
  message: string | null;
  onClose: () => void;
  onPause: () => void;
  onResume: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      if (!message || !ref.current) return;
      const reduced = prefersReducedMotion();
      gsap.fromTo(ref.current, reduced ? { autoAlpha: 0 } : { autoAlpha: 0, y: 16 }, { autoAlpha: 1, y: 0, duration: MOTION.panel, ease: MOTION.ease });
    },
    { dependencies: [message] },
  );

  return (
    <div role="status" aria-live="polite" className="fixed right-4 bottom-4 z-40 sm:right-6 sm:bottom-6">
      {message && (
        <div
          ref={ref}
          onMouseEnter={onPause}
          onMouseLeave={onResume}
          onFocus={onPause}
          onBlur={onResume}
          className="flex w-[min(400px,calc(100vw-32px))] items-start gap-3 rounded-lg border border-line bg-surface py-3.5 pr-3 pl-4 text-sm leading-5 shadow-pop"
        >
          <Icon d={I.fixed} size={20} stroke="var(--ok)" className="flex-none" />
          <span className="flex-1">{message}</span>
          <button type="button" onClick={onClose} aria-label="Dismiss message" className="grid size-6 place-items-center border-0 bg-transparent text-muted hover:text-ink">
            <Icon d={I.close} />
          </button>
        </div>
      )}
    </div>
  );
}
