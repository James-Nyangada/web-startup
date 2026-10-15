"use client";

import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger, useGSAP);
}

/** Spec 4.6 motion tokens. */
export const MOTION = {
  hover: 0.15,
  panel: 0.2,
  ease: "power2.out",
} as const;

export const MOTION_OK = "(prefers-reduced-motion: no-preference)";
export const MOTION_REDUCED = "(prefers-reduced-motion: reduce)";

export function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia(MOTION_REDUCED).matches;
}

export { gsap, ScrollTrigger, useGSAP };
