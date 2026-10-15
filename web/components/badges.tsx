import { Icon, I } from "./icons";
import { SEV, type Severity, band } from "@/lib/severity";

/** Severity badge — always icon + word (colour never carries meaning alone). */
export function SeverityBadge({ sev, className = "" }: { sev: Severity; className?: string }) {
  const s = SEV[sev];
  return (
    <span
      className={`inline-flex items-center gap-1 justify-self-start rounded px-2 py-0.5 text-[13px] leading-5 font-semibold whitespace-nowrap ${s.bg} ${s.text} ${className}`}
    >
      <Icon d={s.icon} />
      {s.label}
    </span>
  );
}

const STATUS = {
  open: { label: "Open", icon: I.circle, cls: "text-ink" },
  fixed: { label: "Fixed", icon: I.fixed, cls: "text-ok" },
  regressed: { label: "Regressed", icon: I.regressed, cls: "text-ink" },
  ignored: { label: "Ignored", icon: I.ignored, cls: "text-muted" },
  needsReview: { label: "Needs review", icon: I.review, cls: "text-ink" },
} as const;

export type IssueStatus = keyof typeof STATUS;

export function StatusBadge({ status, icon = true }: { status: IssueStatus; icon?: boolean }) {
  const s = STATUS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded border border-line-strong px-2 py-px text-[13px] leading-5 font-medium whitespace-nowrap ${s.cls}`}
    >
      {icon && <Icon d={s.icon} size={14} />}
      {s.label}
    </span>
  );
}

export function BandBadge({ score, className = "text-sm" }: { score: number | null; className?: string }) {
  const b = band(score);
  return <span className={`rounded px-2 py-0.5 font-semibold whitespace-nowrap ${b.bg} ${b.text} ${className}`}>{b.label}</span>;
}
