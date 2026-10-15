"use client";

import { useRef, useState } from "react";
import { gsap, useGSAP, MOTION, prefersReducedMotion } from "@/lib/gsap";

/**
 * Animated show/hide region for accordions and toggletips.
 * Stays mounted while closing so GSAP can animate the height to 0.
 */
export function Collapse({ open, children, className = "" }: { open: boolean; children: React.ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const first = useRef(true);

  useGSAP(
    () => {
      const el = ref.current;
      if (!el) return;
      if (first.current) {
        first.current = false;
        gsap.set(el, open ? { height: "auto", autoAlpha: 1 } : { height: 0, autoAlpha: 0 });
        return;
      }
      const reduced = prefersReducedMotion();
      if (open) {
        gsap.fromTo(
          el,
          { height: reduced ? "auto" : 0, autoAlpha: 0 },
          { height: "auto", autoAlpha: 1, duration: reduced ? 0.15 : 0.28, ease: MOTION.ease },
        );
      } else {
        gsap.to(el, { height: reduced ? "auto" : 0, autoAlpha: 0, duration: reduced ? 0.1 : 0.22, ease: MOTION.ease, onComplete: () => gsap.set(el, { height: 0 }) });
      }
    },
    { dependencies: [open] },
  );

  // Server/first render matches the closed state so there is no flash before GSAP takes over.
  // The object never changes, so React never re-applies it over GSAP's inline styles.
  const [initialStyle] = useState<React.CSSProperties | undefined>(open ? undefined : { height: 0, visibility: "hidden", opacity: 0 });

  return (
    <div ref={ref} className={`overflow-hidden ${className}`} style={initialStyle} inert={!open}>
      {children}
    </div>
  );
}
