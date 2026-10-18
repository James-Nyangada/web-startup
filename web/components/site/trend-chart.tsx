"use client";

import { useRef, useState } from "react";
import { band } from "@/lib/severity";
import { gsap, useGSAP, MOTION_OK } from "@/lib/gsap";

const W = 820,
  H = 240,
  L = 40,
  R = 120,
  T = 14,
  B = 34;
const pw = W - L - R,
  ph = H - T - B;

// y-axis fixed at 0–100 so changes aren't exaggerated (spec 12).
const y = (v: number) => T + ((100 - v) * ph) / 100;

export interface TrendChartProps {
  trend?: [string, number, number, boolean?][];
  ariaLabel?: string;
}

/**
 * Score over the last 12 scans (Spec S-24, P2-11).
 * Includes both an accessible SVG chart with focusable points and tooltips,
 * and a visually hidden <table> alternative for screen reader users.
 */
export function TrendChart({
  trend = [],
  ariaLabel = "Score by scan date. Each point is focusable.",
}: TrendChartProps) {
  const [hover, setHover] = useState<number | null>(null);
  const scope = useRef<SVGSVGElement>(null);

  const points = trend;
  const n = points.length;
  const x = (i: number) => (n <= 1 ? L + pw / 2 : L + (i * pw) / (n - 1));

  const lastPoint = points[n - 1] ?? points[0];
  const lastScore = lastPoint ? lastPoint[1] : 78;
  const lastBandLabel = band(lastScore).label;

  useGSAP(
    () => {
      const mm = gsap.matchMedia();
      mm.add(MOTION_OK, () => {
        const line = scope.current?.querySelector<SVGPolylineElement>("[data-line]");
        if (line) {
          const len = line.getTotalLength();
          gsap.fromTo(
            line,
            { strokeDasharray: len, strokeDashoffset: len },
            {
              strokeDashoffset: 0,
              duration: 1.2,
              ease: "power2.inOut",
              clearProps: "strokeDasharray,strokeDashoffset",
            },
          );
        }
        gsap.fromTo(
          "[data-point]",
          { scale: 0, transformOrigin: "50% 50%" },
          { scale: 1, duration: 0.3, ease: "back.out(2.5)", stagger: 0.08, delay: 0.15 },
        );
        gsap.fromTo("[data-ann]", { autoAlpha: 0, x: -6 }, { autoAlpha: 1, x: 0, duration: 0.4, delay: 1.1 });
      });
      return () => mm.revert();
    },
    { scope, dependencies: [points] },
  );

  const t = hover != null && hover !== n - 1 ? points[hover] : null;
  const bx = hover != null ? Math.min(x(hover) - 70, W - 150) : 0;
  const by = t ? y(t[1]) - 66 : 0;

  return (
    <div className="relative w-full">
      {/* Visually hidden data table as accessible alternative (Spec P2-11 acceptance criteria) */}
      <table className="sr-only">
        <caption>Accessibility score trend over recent scans</caption>
        <thead>
          <tr>
            <th scope="col">Scan date</th>
            <th scope="col">Score</th>
            <th scope="col">Open problems</th>
            <th scope="col">Status</th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p[0]}>
              <td>{p[0]}</td>
              <td>{p[1]}</td>
              <td>{p[2]}</td>
              <td>{p[3] ? "Partial scan" : "Full scan"}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <svg
        ref={scope}
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="group"
        aria-label={ariaLabel}
        className="block overflow-visible"
      >
        {[0, 25, 50, 75, 100].map((v) => (
          <g key={v}>
            <line x1={L} x2={W - R + 10} y1={y(v)} y2={y(v)} stroke="var(--border)" />
            <text x={L - 10} y={y(v) + 4} textAnchor="end" fontSize={12} fill="var(--muted)">
              {v}
            </text>
          </g>
        ))}
        {points.map((p, i) =>
          i % 2 === 0 || i === n - 1 ? (
            <text key={p[0]} x={x(i)} y={H - 10} textAnchor="middle" fontSize={12} fill="var(--muted)">
              {p[0]}
            </text>
          ) : null,
        )}
        <polyline
          data-line
          points={points.map((p, i) => `${x(i)},${y(p[1])}`).join(" ")}
          fill="none"
          stroke="var(--primary)"
          strokeWidth={2.5}
          strokeLinejoin="round"
        />
        {points.map((p, i) => (
          <circle
            key={p[0]}
            data-point
            cx={x(i)}
            cy={y(p[1])}
            r={i === n - 1 ? 6 : 4.5}
            fill={p[3] ? "var(--bg)" : "var(--primary)"}
            stroke="var(--primary)"
            strokeWidth={2}
            tabIndex={0}
            role="img"
            aria-label={`${p[0]}: score ${p[1]}, ${p[2]} open problems${p[3] ? ", partial scan" : ""}`}
            className="cursor-pointer"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
            onFocus={() => setHover(i)}
            onBlur={() => setHover(null)}
          />
        ))}
        <text
          data-ann
          x={x(n - 1) + 12}
          y={y(lastScore) + 5}
          fontSize={14}
          fontWeight={600}
          fill="var(--text)"
        >
          {`${lastScore} · ${lastBandLabel}`}
        </text>
        {t && (
          <g pointerEvents="none">
            <rect x={bx} y={by} width={140} height={52} rx={6} fill="var(--bg)" stroke="var(--bstrong)" />
            <text x={bx + 12} y={by + 21} fontSize={13} fontWeight={600} fill="var(--text)">
              {`${t[0]} · ${t[1]}${t[3] ? " (partial)" : ""}`}
            </text>
            <text x={bx + 12} y={by + 40} fontSize={12} fill="var(--muted)">
              {`${t[2]} open problems`}
            </text>
          </g>
        )}
      </svg>
    </div>
  );
}
