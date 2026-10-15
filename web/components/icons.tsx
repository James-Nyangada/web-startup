// Lucide icon paths used by the designs (1.5px stroke, spec 4.6).
const C = "M2 12a10 10 0 1 0 20 0a10 10 0 1 0-20 0";

export const I = {
  critical: "M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z M12 8v4 M12 16h.01", // octagon-alert
  serious: "M21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z M12 9v4 M12 17h.01", // triangle-alert
  moderate: C + " M12 8v4 M12 16h.01", // circle-alert
  minor: C + " M12 16v-4 M12 8h.01", // info
  circle: C,
  fixed: C + " M9 12l2 2l4-4", // circle-check
  regressed: "M3 12a9 9 0 1 0 9-9a9.75 9.75 0 0 0-6.74 2.74L3 8 M3 3v5h5", // rotate-ccw
  ignored:
    "M9.88 9.88a3 3 0 1 0 4.24 4.24 M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68 M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61 M2 2l20 20", // eye-off
  review: C + " M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3 M12 17h.01", // help-circle
  search: "M11 4a7 7 0 1 0 0 14a7 7 0 1 0 0-14z M20 20l-3.5-3.5",
  user: "M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2 M12 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8z",
  sun: "M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M12 2v2 M12 20v2 M4.93 4.93l1.41 1.41 M17.66 17.66l1.41 1.41 M2 12h2 M20 12h2 M6.34 17.66l-1.41 1.41 M19.07 4.93l-1.41 1.41",
  moon: "M12 3a6 6 0 0 0 9 9a9 9 0 1 1-9-9z",
  bell: "M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9 M10.3 21a1.94 1.94 0 0 0 3.4 0",
  chevronsUpDown: "M7 15l5 5l5-5M7 9l5-5l5 5",
  chevronRight: "M9 18l6-6-6-6",
  chevronLeft: "M15 18l-6-6 6-6",
  external: "M15 3h6v6 M10 14L21 3 M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6",
  refresh: "M21 12a9 9 0 1 1-3-6.7L21 8 M21 3v5h-5",
  arrowUpRight: "M7 17L17 7 M8 7h9v9",
  arrowDownRight: "M7 7l10 10 M17 8v9H8",
  link: "M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71 M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71",
  expand: "M15 3h6v6 M9 21H3v-6 M21 3l-7 7 M3 21l7-7",
  close: "M18 6L6 18 M6 6l12 12",
  check: "M20 6L9 17l-5-5",
  menu: "M4 6h16 M4 12h16 M4 18h16",
};

export function Icon({
  d,
  size = 16,
  strokeWidth = 1.5,
  className,
  style,
  stroke = "currentColor",
}: {
  d: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
  style?: React.CSSProperties;
  stroke?: string;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={stroke}
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      style={style}
    >
      <path d={d} />
    </svg>
  );
}
