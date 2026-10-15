"use client";

import { useRef } from "react";
import { gsap, ScrollTrigger, useGSAP, MOTION_OK, MOTION_REDUCED } from "@/lib/gsap";

/**
 * Reveals every `[data-reveal]` descendant as it scrolls into view.
 * `data-reveal="stagger"` reveals that element's direct children one after another instead.
 * Reduced motion: slides become a short fade (spec 4.6).
 */
export function useReveal<T extends HTMLElement>() {
  const scope = useRef<T>(null);

  useGSAP(
    () => {
      const els = gsap.utils.toArray<HTMLElement>("[data-reveal]", scope.current);
      const mm = gsap.matchMedia();

      mm.add(MOTION_OK, () => {
        els.forEach((el) => {
          const stagger = el.dataset.reveal === "stagger";
          const targets = stagger ? Array.from(el.children) : [el];
          if (stagger) gsap.set(el, { autoAlpha: 1 });
          gsap.fromTo(
            targets,
            { autoAlpha: 0, y: 24 },
            {
              autoAlpha: 1,
              y: 0,
              duration: 0.7,
              ease: "power3.out",
              stagger: stagger ? 0.08 : 0,
              scrollTrigger: { trigger: el, start: "top 88%", once: true },
            },
          );
        });
      });

      mm.add(MOTION_REDUCED, () => {
        gsap.fromTo(els, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: "none" });
      });

      ScrollTrigger.refresh();
      return () => mm.revert();
    },
    { scope },
  );

  return scope;
}

/** Fades + lifts the direct children of the returned ref on mount (and when `deps` change). */
export function useEntrance<T extends HTMLElement>(deps: unknown[] = [], selector?: string) {
  const scope = useRef<T>(null);
  useGSAP(
    () => {
      if (!scope.current) return;
      const targets = selector ? gsap.utils.toArray<HTMLElement>(selector, scope.current) : Array.from(scope.current.children);
      if (!targets.length) return;
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        gsap.fromTo(targets, { autoAlpha: 0, y: 12 }, { autoAlpha: 1, y: 0, duration: 0.45, ease: "power2.out", stagger: 0.05, clearProps: "transform" });
      });
      mm.add(MOTION_REDUCED, () => {
        gsap.fromTo(targets, { autoAlpha: 0 }, { autoAlpha: 1, duration: 0.2, ease: "none" });
      });
      return () => mm.revert();
    },
    { scope, dependencies: deps, revertOnUpdate: false },
  );
  return scope;
}
