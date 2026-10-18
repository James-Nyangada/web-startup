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
  settings: "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6z",
  plus: "M5 12h14 M12 5v14",
  logOut: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4 M16 17l5-5-5-5 M21 12H9",
  globe: "M12 2a10 10 0 1 0 0 20a10 10 0 1 0 0-20z M2 12h20 M12 2a15.3 15.3 0 0 1 4 10a15.3 15.3 0 0 1-4 10a15.3 15.3 0 0 1-4-10a15.3 15.3 0 0 1 4-10z",
  building: "M6 22V4a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v18 M6 12H4a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2 M18 9h2a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2h-2 M10 6h4 M10 10h4 M10 14h4 M10 18h4",
  fileText: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z M14 2v6h6 M16 13H8 M16 17H8 M10 9H8",
  shield: "M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z",
  creditCard: "M21 4H3a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h18a2 2 0 0 0 2-2V6a2 2 0 0 0-2-2z M1 10h22",
  users: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 3a4 4 0 1 0 0 8a4 4 0 1 0 0-8z M22 21v-2a4 4 0 0 0-3-3.87 M16 3.13a4 4 0 0 1 0 7.75",
  layout: "M19 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V5a2 2 0 0 0-2-2z M3 9h18 M9 21V9",
  copy: "M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2 M9 2h6a1 1 0 0 1 1 1v2a1 1 0 0 1-1 1H9a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z",
  audit: "M9 11l3 3L22 4 M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11",
  loader: "M12 2v4 M12 18v4 M4.93 4.93l2.83 2.83 M16.24 16.24l2.83 2.83 M2 12h4 M18 12h4 M4.93 19.07l2.83-2.83 M16.24 7.76l2.83-2.83",
  stop: "M9 9h6v6H9z",
  arrowLeft: "M19 12H5 M12 19l-7-7 7-7",
  arrowRight: "M5 12h14 M12 5l7 7-7 7",
  alert: "M21.73 18l-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3z M12 9v4 M12 17h.01",
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
