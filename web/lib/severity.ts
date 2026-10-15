import { I } from "@/components/icons";

export type Severity = "critical" | "serious" | "moderate" | "minor";

export const SEVERITIES: Severity[] = ["critical", "serious", "moderate", "minor"];

// Fixed severity vocabulary (spec 3.3). Class names are literal so Tailwind can see them.
export const SEV: Record<
  Severity,
  { label: string; text: string; bg: string; icon: string; tip: string; weight: number; lucide: string }
> = {
  critical: {
    label: "Critical",
    text: "text-crit",
    bg: "bg-crit-soft",
    icon: I.critical,
    tip: "Blocks some people from completing a task.",
    weight: 4,
    lucide: "octagon-alert",
  },
  serious: {
    label: "Serious",
    text: "text-ser",
    bg: "bg-ser-soft",
    icon: I.serious,
    tip: "Makes a task very difficult for some people.",
    weight: 3,
    lucide: "triangle-alert",
  },
  moderate: {
    label: "Moderate",
    text: "text-mod",
    bg: "bg-mod-soft",
    icon: I.moderate,
    tip: "Causes frustration or confusion.",
    weight: 2,
    lucide: "circle-alert",
  },
  minor: {
    label: "Minor",
    text: "text-min",
    bg: "bg-min-soft",
    icon: I.minor,
    tip: "Small annoyance; fix when convenient.",
    weight: 1,
    lucide: "info",
  },
};

export type Band = { label: string; text: string; bg: string };

/** Score bands (spec 3.3): Good 90–100, Needs work 70–89, Poor 0–69. */
export function band(score: number | null): Band {
  if (score == null) return { label: "No score", text: "text-muted", bg: "bg-sunk" };
  if (score >= 90) return { label: "Good", text: "text-ok", bg: "bg-ok-soft" };
  if (score >= 70) return { label: "Needs work", text: "text-mod", bg: "bg-mod-soft" };
  return { label: "Poor", text: "text-crit", bg: "bg-crit-soft" };
}
