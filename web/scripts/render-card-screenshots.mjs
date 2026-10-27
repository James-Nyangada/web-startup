import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const OUTPUT_DIR = path.resolve(process.cwd(), "public/screenshots");
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const icons = {
  check: '<path d="M20 6L9 17l-5-5"/>',
  spinner: '<path d="M21 12a9 9 0 1 1-6.219-8.56"/>',
  globe: '<circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/>',
  critical: '<path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  serious: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  moderate: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  minor: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  fixed: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  copy: '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" x2="12" y1="15" y2="3"/>',
  document: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  user: '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/>',
};

function renderSvg(name, size = 18, strokeWidth = 2, className = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" class="${className}">${icons[name] || ""}</svg>`;
}

function getBaseStyles(theme) {
  const isDark = theme === "dark";
  return `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 800px;
      height: 600px;
      overflow: hidden;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
      background: ${isDark ? "#0b1120" : "#f8fafc"};
      color: ${isDark ? "#f1f5f9" : "#0f172a"};
      -webkit-font-smoothing: antialiased;
    }
    .mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
    .card {
      width: 100%;
      height: 100%;
      background: ${isDark ? "#111a2b" : "#ffffff"};
      border: 1px solid ${isDark ? "#26354f" : "#e2e8f0"};
      border-radius: 20px;
      padding: 32px;
      display: flex;
      flex-direction: column;
      box-shadow: ${isDark ? "0 20px 40px -15px rgba(0,0,0,0.5)" : "0 20px 40px -15px rgba(12,23,84,0.08)"};
    }
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 4px 10px;
      border-radius: 9999px;
      font-size: 13px;
      font-weight: 600;
    }
    .badge-critical {
      background: ${isDark ? "#2a1416" : "#fef2f2"};
      color: ${isDark ? "#ff8a80" : "#dc2626"};
      border: 1px solid ${isDark ? "#5c1d24" : "#fecaca"};
    }
    .badge-serious {
      background: ${isDark ? "#2a1e0d" : "#fffbeb"};
      color: ${isDark ? "#fdb022" : "#d97706"};
      border: 1px solid ${isDark ? "#5c3d14" : "#fde68a"};
    }
    .badge-moderate {
      background: ${isDark ? "#262110" : "#fefce8"};
      color: ${isDark ? "#f5d565" : "#ca8a04"};
      border: 1px solid ${isDark ? "#544614" : "#fef08a"};
    }
    .badge-minor {
      background: ${isDark ? "#1a2232" : "#f1f5f9"};
      color: ${isDark ? "#a3aec0" : "#475569"};
      border: 1px solid ${isDark ? "#334155" : "#e2e8f0"};
    }
    .badge-ok {
      background: ${isDark ? "#0f2419" : "#ecfdf5"};
      color: ${isDark ? "#4ade80" : "#059669"};
      border: 1px solid ${isDark ? "#166534" : "#a7f3d0"};
    }
    .badge-primary {
      background: ${isDark ? "#1a2347" : "#eff6ff"};
      color: ${isDark ? "#8fbbff" : "#2563eb"};
      border: 1px solid ${isDark ? "#2b3b75" : "#bfdbfe"};
    }
    .badge-info {
      background: ${isDark ? "#1e1b4b" : "#f5f3ff"};
      color: ${isDark ? "#a78bfa" : "#7c3aed"};
      border: 1px solid ${isDark ? "#3730a3" : "#ddd6fe"};
    }
    .text-muted { color: ${isDark ? "#94a3b8" : "#64748b"}; }
    .text-ink { color: ${isDark ? "#f8fafc" : "#0f172a"}; }
    .border-subtle { border-color: ${isDark ? "#1e293b" : "#f1f5f9"}; }
    .bg-subtle { background: ${isDark ? "#16223a" : "#f8fafc"}; }
    .bg-sunk { background: ${isDark ? "#0e1626" : "#f1f5f9"}; }
  `;
}

function generateHtml(cardType, theme) {
  const isDark = theme === "dark";
  const styles = getBaseStyles(theme);

  if (cardType === "scan-progress") {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${styles}</style>
</head>
<body style="padding: 20px;">
  <div class="card" style="justify-content: space-between;">
    <!-- Card Top Header -->
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid ${isDark ? "#1e293b" : "#f1f5f9"}; padding-bottom: 18px;">
      <div style="display: flex; align-items: center; gap: 12px;">
        <div style="width: 36px; height: 36px; border-radius: 10px; background: ${isDark ? "#1e293b" : "#e0e7ff"}; display: grid; place-items: center; color: ${isDark ? "#8fbbff" : "#2563eb"};">
          ${renderSvg("scan", 20)}
        </div>
        <div>
          <div style="font-size: 17px; font-weight: 700; color: ${isDark ? "#f8fafc" : "#0f172a"};">Oakhaus Furniture Store</div>
          <div class="mono" style="font-size: 13px; color: ${isDark ? "#94a3b8" : "#64748b"};">oakhaus-living.myshopify.com</div>
        </div>
      </div>
      <div class="badge badge-primary" style="padding: 6px 14px; font-size: 14px;">
        <span style="display: inline-block; width: 8px; height: 8px; border-radius: 9999px; background: ${isDark ? "#6ea8ff" : "#2563eb"};"></span>
        Scan in progress (S-28)
      </div>
    </div>

    <!-- Stepper (Discovering ✓ -> Scanning -> Processing) -->
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 14px;">
      <!-- Step 1: Discovering (Completed) -->
      <div style="padding: 16px; border-radius: 14px; background: ${isDark ? "#16223a" : "#f8fafc"}; border: 1px solid ${isDark ? "#223554" : "#e2e8f0"}; display: flex; align-items: center; gap: 12px;">
        <div style="width: 32px; height: 32px; border-radius: 50%; background: ${isDark ? "#0f2419" : "#ecfdf5"}; color: ${isDark ? "#4ade80" : "#059669"}; display: grid; place-items: center;">
          ${renderSvg("check", 18, 2.5)}
        </div>
        <div>
          <div style="font-size: 14px; font-weight: 700; color: ${isDark ? "#f8fafc" : "#0f172a"};">1. Discovering ✓</div>
          <div style="font-size: 12px; color: ${isDark ? "#94a3b8" : "#64748b"};">150 pages queued</div>
        </div>
      </div>

      <!-- Step 2: Scanning (Active) -->
      <div style="padding: 16px; border-radius: 14px; background: ${isDark ? "#1a2347" : "#eff6ff"}; border: 1.5px solid ${isDark ? "#6ea8ff" : "#2563eb"}; display: flex; align-items: center; gap: 12px; box-shadow: 0 4px 14px ${isDark ? "rgba(110,168,255,0.15)" : "rgba(37,99,235,0.12)"};">
        <div style="width: 32px; height: 32px; border-radius: 50%; background: ${isDark ? "#27386d" : "#dbeafe"}; color: ${isDark ? "#8fbbff" : "#2563eb"}; display: grid; place-items: center;">
          ${renderSvg("spinner", 18, 2.5)}
        </div>
        <div>
          <div style="font-size: 14px; font-weight: 700; color: ${isDark ? "#8fbbff" : "#1d4ed8"};">2. Scanning</div>
          <div style="font-size: 12px; color: ${isDark ? "#94a3b8" : "#64748b"}; font-weight: 500;">87 of 150 checked</div>
        </div>
      </div>

      <!-- Step 3: Processing (Pending) -->
      <div style="padding: 16px; border-radius: 14px; background: ${isDark ? "#0e1626" : "#f1f5f9"}; border: 1px solid ${isDark ? "#1c2a44" : "#e2e8f0"}; display: flex; align-items: center; gap: 12px; opacity: 0.65;">
        <div style="width: 32px; height: 32px; border-radius: 50%; background: ${isDark ? "#1c283d" : "#e2e8f0"}; color: ${isDark ? "#64748b" : "#94a3b8"}; display: grid; place-items: center; font-size: 13px; font-weight: 700;">
          3
        </div>
        <div>
          <div style="font-size: 14px; font-weight: 600; color: ${isDark ? "#cbd5e1" : "#475569"};">3. Processing</div>
          <div style="font-size: 12px; color: ${isDark ? "#64748b" : "#94a3b8"};">Score & diff</div>
        </div>
      </div>
    </div>

    <!-- Main Live Progress Panel -->
    <div style="background: ${isDark ? "#0e1626" : "#f8fafc"}; border: 1px solid ${isDark ? "#223554" : "#e2e8f0"}; border-radius: 16px; padding: 24px; display: flex; flex-direction: column; gap: 16px;">
      <!-- Counter & percentage -->
      <div style="display: flex; justify-content: space-between; align-items: flex-end;">
        <div>
          <div style="font-size: 12px; font-weight: 700; letter-spacing: 0.05em; text-transform: uppercase; color: ${isDark ? "#6ea8ff" : "#2563eb"}; margin-bottom: 4px;">Live Progress</div>
          <div style="font-size: 26px; font-weight: 800; color: ${isDark ? "#f8fafc" : "#0f172a"};">Scanning 87 of 150 pages</div>
        </div>
        <div class="mono" style="font-size: 30px; font-weight: 800; color: ${isDark ? "#8fbbff" : "#2563eb"};">58%</div>
      </div>

      <!-- Progress bar (~60% full) -->
      <div style="width: 100%; height: 16px; background: ${isDark ? "#1c283d" : "#e2e8f0"}; border-radius: 9999px; overflow: hidden; position: relative;">
        <div style="width: 58%; height: 100%; background: linear-gradient(90deg, #2563eb 0%, #3b82f6 100%); border-radius: 9999px; box-shadow: 0 0 12px rgba(59,130,246,0.5);"></div>
      </div>

      <!-- Current URL being scanned -->
      <div style="display: flex; align-items: center; gap: 10px; font-size: 14px; padding: 12px 14px; border-radius: 10px; background: ${isDark ? "#16223a" : "#ffffff"}; border: 1px solid ${isDark ? "#26354f" : "#e2e8f0"};">
        <span style="color: ${isDark ? "#6ea8ff" : "#2563eb"}; display: flex;">${renderSvg("globe", 18)}</span>
        <span style="font-weight: 600; color: ${isDark ? "#94a3b8" : "#64748b"};">Checking:</span>
        <span class="mono" style="font-size: 13.5px; font-weight: 600; color: ${isDark ? "#f8fafc" : "#0f172a"};">/products/linen-throw-blanket</span>
      </div>
    </div>

    <!-- Bottom summary row -->
    <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px;">
      <div style="padding: 12px 16px; border-radius: 12px; background: ${isDark ? "#16223a" : "#f8fafc"}; border: 1px solid ${isDark ? "#223554" : "#e2e8f0"};">
        <div style="font-size: 12px; color: ${isDark ? "#94a3b8" : "#64748b"};">Violations found</div>
        <div style="font-size: 18px; font-weight: 800; color: ${isDark ? "#ff8a80" : "#dc2626"};">24 critical issues</div>
      </div>
      <div style="padding: 12px 16px; border-radius: 12px; background: ${isDark ? "#16223a" : "#f8fafc"}; border: 1px solid ${isDark ? "#223554" : "#e2e8f0"};">
        <div style="font-size: 12px; color: ${isDark ? "#94a3b8" : "#64748b"};">Speed</div>
        <div style="font-size: 18px; font-weight: 800; color: ${isDark ? "#f8fafc" : "#0f172a"};">410 ms avg / page</div>
      </div>
      <div style="padding: 12px 16px; border-radius: 12px; background: ${isDark ? "#16223a" : "#f8fafc"}; border: 1px solid ${isDark ? "#223554" : "#e2e8f0"};">
        <div style="font-size: 12px; color: ${isDark ? "#94a3b8" : "#64748b"};">Scan time</div>
        <div style="font-size: 18px; font-weight: 800; color: ${isDark ? "#f8fafc" : "#0f172a"};">1m 18s elapsed</div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  if (cardType === "fix-these-first") {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${styles}</style>
</head>
<body style="padding: 20px;">
  <div class="card" style="justify-content: flex-start; gap: 20px;">
    <!-- Score & Severities Bar (S-24) -->
    <div style="display: flex; justify-content: space-between; align-items: center; background: ${isDark ? "#0e1626" : "#f8fafc"}; border: 1px solid ${isDark ? "#223554" : "#e2e8f0"}; border-radius: 16px; padding: 18px 24px;">
      <div style="display: flex; align-items: center; gap: 18px;">
        <div style="display: flex; flex-direction: column;">
          <span style="font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: ${isDark ? "#94a3b8" : "#64748b"};">Site score</span>
          <div style="display: flex; align-items: baseline; gap: 8px;">
            <span class="mono" style="font-size: 38px; font-weight: 800; line-height: 1; color: ${isDark ? "#f8fafc" : "#0f172a"};">72</span>
            <span style="font-size: 16px; color: ${isDark ? "#94a3b8" : "#64748b"}; font-weight: 500;">/ 100</span>
          </div>
        </div>
        <div class="badge badge-serious" style="padding: 6px 12px; font-size: 14px;">
          ${renderSvg("serious", 16)} Needs work
        </div>
      </div>

      <!-- Severity Counts: Critical 3 · Serious 7 · Moderate 12 · Minor 9 -->
      <div style="display: flex; align-items: center; gap: 8px;">
        <span class="badge badge-critical" style="padding: 6px 10px; font-size: 13px;">
          ${renderSvg("critical", 15)} Critical <strong class="mono" style="font-size: 14px; margin-left: 3px;">3</strong>
        </span>
        <span class="badge badge-serious" style="padding: 6px 10px; font-size: 13px;">
          ${renderSvg("serious", 15)} Serious <strong class="mono" style="font-size: 14px; margin-left: 3px;">7</strong>
        </span>
        <span class="badge badge-moderate" style="padding: 6px 10px; font-size: 13px;">
          ${renderSvg("moderate", 15)} Moderate <strong class="mono" style="font-size: 14px; margin-left: 3px;">12</strong>
        </span>
        <span class="badge badge-minor" style="padding: 6px 10px; font-size: 13px;">
          ${renderSvg("minor", 15)} Minor <strong class="mono" style="font-size: 14px; margin-left: 3px;">9</strong>
        </span>
      </div>
    </div>

    <!-- "Fix these first" Header -->
    <div style="display: flex; justify-content: space-between; align-items: baseline; margin-top: 4px;">
      <div>
        <h2 style="font-size: 21px; font-weight: 700; color: ${isDark ? "#f8fafc" : "#0f172a"}; margin-bottom: 2px;">Fix these first</h2>
        <p style="font-size: 13px; color: ${isDark ? "#94a3b8" : "#64748b"};">Ranked by who they block, times how often they happen</p>
      </div>
      <span style="font-size: 13px; font-weight: 600; color: ${isDark ? "#8fbbff" : "#2563eb"};">Top 3 of 31 issues</span>
    </div>

    <!-- Plain-language Issue Rows -->
    <div style="display: flex; flex-direction: column; gap: 10px; flex: 1;">
      <!-- Row 1: Critical - Product images have no description -->
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; border-radius: 14px; background: ${isDark ? "#16223a" : "#f8fafc"}; border: 1px solid ${isDark ? "#223554" : "#e2e8f0"};">
        <div style="display: flex; align-items: center; gap: 14px;">
          <span class="badge badge-critical" style="padding: 6px 12px; font-size: 13px;">Critical</span>
          <div>
            <div style="font-size: 16px; font-weight: 700; color: ${isDark ? "#f8fafc" : "#0f172a"};">“Product images have no description”</div>
            <div style="font-size: 13px; color: ${isDark ? "#94a3b8" : "#64748b"}; margin-top: 2px;">Screen readers cannot describe product photos to blind shoppers</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div class="mono" style="font-size: 14px; font-weight: 700; color: ${isDark ? "#f8fafc" : "#0f172a"};">148 places</div>
          <div style="font-size: 12px; color: ${isDark ? "#94a3b8" : "#64748b"};">product pages</div>
        </div>
      </div>

      <!-- Row 2: Critical - 'Add to cart' button has no readable name -->
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; border-radius: 14px; background: ${isDark ? "#16223a" : "#f8fafc"}; border: 1px solid ${isDark ? "#223554" : "#e2e8f0"};">
        <div style="display: flex; align-items: center; gap: 14px;">
          <span class="badge badge-critical" style="padding: 6px 12px; font-size: 13px;">Critical</span>
          <div>
            <div style="font-size: 16px; font-weight: 700; color: ${isDark ? "#f8fafc" : "#0f172a"};">“‘Add to cart’ button has no readable name”</div>
            <div style="font-size: 13px; color: ${isDark ? "#94a3b8" : "#64748b"}; margin-top: 2px;">Voice and screen reader users cannot find or click the purchase button</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div class="mono" style="font-size: 14px; font-weight: 700; color: ${isDark ? "#f8fafc" : "#0f172a"};">14 places</div>
          <div style="font-size: 12px; color: ${isDark ? "#94a3b8" : "#64748b"};">product & cart</div>
        </div>
      </div>

      <!-- Row 3: Serious - Text colour is too light to read -->
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 16px 18px; border-radius: 14px; background: ${isDark ? "#16223a" : "#f8fafc"}; border: 1px solid ${isDark ? "#223554" : "#e2e8f0"};">
        <div style="display: flex; align-items: center; gap: 14px;">
          <span class="badge badge-serious" style="padding: 6px 12px; font-size: 13px;">Serious</span>
          <div>
            <div style="font-size: 16px; font-weight: 700; color: ${isDark ? "#f8fafc" : "#0f172a"};">“Text colour is too light to read”</div>
            <div style="font-size: 13px; color: ${isDark ? "#94a3b8" : "#64748b"}; margin-top: 2px;">Low-contrast grey on white fails WCAG 4.5:1 ratio for low vision</div>
          </div>
        </div>
        <div style="text-align: right;">
          <div class="mono" style="font-size: 14px; font-weight: 700; color: ${isDark ? "#f8fafc" : "#0f172a"};">28 places</div>
          <div style="font-size: 12px; color: ${isDark ? "#94a3b8" : "#64748b"};">footer links</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  if (cardType === "fix-guide") {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${styles}</style>
</head>
<body style="padding: 20px;">
  <div class="card" style="justify-content: space-between;">
    <!-- Drawer Header & Platform Tabs (S-26) -->
    <div>
      <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid ${isDark ? "#1e293b" : "#f1f5f9"}; padding-bottom: 14px;">
        <div style="display: flex; align-items: center; gap: 10px;">
          <span class="badge badge-critical" style="padding: 4px 10px; font-size: 12px;">Critical</span>
          <h2 style="font-size: 18px; font-weight: 700; color: ${isDark ? "#f8fafc" : "#0f172a"};">Product images have no description</h2>
        </div>
        <div style="display: flex; gap: 6px;">
          <span style="font-size: 13px; font-weight: 600; color: ${isDark ? "#94a3b8" : "#64748b"};">WCAG 1.1.1 Non-text Content</span>
        </div>
      </div>

      <!-- Platform selector tabs (Shopify selected) -->
      <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 14px;">
        <div style="display: inline-flex; background: ${isDark ? "#0e1626" : "#f1f5f9"}; padding: 4px; border-radius: 9999px; border: 1px solid ${isDark ? "#223554" : "#e2e8f0"};">
          <div style="padding: 6px 18px; border-radius: 9999px; font-size: 13px; font-weight: 700; background: ${isDark ? "#2563eb" : "#2563eb"}; color: #ffffff; box-shadow: 0 2px 6px rgba(37,99,235,0.3);">
            Shopify
          </div>
          <div style="padding: 6px 18px; border-radius: 9999px; font-size: 13px; font-weight: 600; color: ${isDark ? "#94a3b8" : "#64748b"};">
            WordPress
          </div>
          <div style="padding: 6px 18px; border-radius: 9999px; font-size: 13px; font-weight: 600; color: ${isDark ? "#94a3b8" : "#64748b"};">
            Generic HTML
          </div>
        </div>
        <span class="badge badge-ok" style="font-size: 12px;">${renderSvg("fixed", 14)} Shopify 2.0 Theme Guide</span>
      </div>
    </div>

    <!-- Numbered Steps -->
    <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
      <div style="display: flex; align-items: flex-start; gap: 10px; font-size: 14px; line-height: 1.4; color: ${isDark ? "#e2e8f0" : "#1e293b"};">
        <span style="width: 22px; height: 22px; border-radius: 50%; background: ${isDark ? "#1a2347" : "#eff6ff"}; color: ${isDark ? "#8fbbff" : "#2563eb"}; font-weight: 700; display: grid; place-items: center; font-size: 12px; flex-shrink: 0;">1</span>
        <span>Open <strong>Shopify Admin → Products</strong>, select the product, and click the image to edit.</span>
      </div>
      <div style="display: flex; align-items: flex-start; gap: 10px; font-size: 14px; line-height: 1.4; color: ${isDark ? "#e2e8f0" : "#1e293b"};">
        <span style="width: 22px; height: 22px; border-radius: 50%; background: ${isDark ? "#1a2347" : "#eff6ff"}; color: ${isDark ? "#8fbbff" : "#2563eb"}; font-weight: 700; display: grid; place-items: center; font-size: 12px; flex-shrink: 0;">2</span>
        <span>Click <strong>Add alt text</strong>, enter a concise description of the product, and click <strong>Save</strong>.</span>
      </div>
      <div style="display: flex; align-items: flex-start; gap: 10px; font-size: 14px; line-height: 1.4; color: ${isDark ? "#e2e8f0" : "#1e293b"};">
        <span style="width: 22px; height: 22px; border-radius: 50%; background: ${isDark ? "#1a2347" : "#eff6ff"}; color: ${isDark ? "#8fbbff" : "#2563eb"}; font-weight: 700; display: grid; place-items: center; font-size: 12px; flex-shrink: 0;">3</span>
        <span>Or ensure your Liquid snippet outputs the escaped alt attribute:</span>
      </div>
    </div>

    <!-- Code Block with Copy button -->
    <div style="background: ${isDark ? "#080d1a" : "#0f172a"}; border: 1px solid ${isDark ? "#1e293b" : "#334155"}; border-radius: 12px; overflow: hidden;">
      <div style="display: flex; justify-content: space-between; align-items: center; padding: 8px 14px; background: ${isDark ? "#0d1527" : "#1e293b"}; border-bottom: 1px solid ${isDark ? "#1e293b" : "#334155"};">
        <span class="mono" style="font-size: 12px; color: #94a3b8; font-weight: 600;">snippets/product-media.liquid</span>
        <button style="background: ${isDark ? "#1e293b" : "#334155"}; color: #f8fafc; border: 0; padding: 4px 10px; border-radius: 6px; font-size: 12px; font-weight: 600; display: flex; align-items: center; gap: 5px; cursor: pointer;">
          ${renderSvg("copy", 14)} Copy
        </button>
      </div>
      <div class="mono" style="padding: 14px; font-size: 13.5px; line-height: 1.6; color: #f1f5f9; overflow-x: auto;">
        <span style="color: #60a5fa;">&lt;img</span> <span style="color: #93c5fd;">src=</span><span style="color: #86efac;">"{{ image | image_url: width: 800 }}"</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #93c5fd;">alt=</span><span style="color: #fde047;">"{{ image.alt | escape }}"</span><br>
        &nbsp;&nbsp;&nbsp;&nbsp;&nbsp;<span style="color: #93c5fd;">loading=</span><span style="color: #86efac;">"lazy"</span><span style="color: #60a5fa;">&gt;</span>
      </div>
    </div>

    <!-- Actions: Recheck this issue button -->
    <div style="display: flex; justify-content: space-between; align-items: center; border-top: 1px solid ${isDark ? "#1e293b" : "#f1f5f9"}; pt: 14px; padding-top: 14px;">
      <div style="font-size: 13px; color: ${isDark ? "#94a3b8" : "#64748b"};">Last checked: today, 09:12 · Status: Open</div>
      <div style="display: flex; gap: 10px;">
        <button style="background: ${isDark ? "#2563eb" : "#2563eb"}; color: #ffffff; border: 0; padding: 9px 18px; border-radius: 9999px; font-size: 13.5px; font-weight: 700; display: flex; align-items: center; gap: 7px; cursor: pointer; box-shadow: 0 4px 12px rgba(37,99,235,0.25);">
          ${renderSvg("refresh", 16)} Recheck this issue
        </button>
      </div>
    </div>
  </div>
</body>
</html>`;
  }

  if (cardType === "evidence-timeline") {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>${styles}</style>
</head>
<body style="padding: 20px;">
  <div class="card" style="justify-content: flex-start; gap: 16px;">
    <!-- Timeline Top Header (S-31) -->
    <div style="display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid ${isDark ? "#1e293b" : "#f1f5f9"}; padding-bottom: 14px;">
      <div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <h2 style="font-size: 20px; font-weight: 700; color: ${isDark ? "#f8fafc" : "#0f172a"};">Evidence timeline</h2>
          <span class="badge badge-ok" style="font-size: 11.5px; padding: 2px 8px;">
            ${renderSvg("shield", 13)} Append-only verified
          </span>
        </div>
        <p style="font-size: 12.5px; color: ${isDark ? "#94a3b8" : "#64748b"}; margin-top: 2px;">Dated compliance record of automated scans, remediation and testing</p>
      </div>

      <!-- Download evidence pack button in corner -->
      <button style="background: ${isDark ? "#1e293b" : "#0f172a"}; color: #ffffff; border: 1px solid ${isDark ? "#334155" : "#0f172a"}; padding: 8px 16px; border-radius: 9999px; font-size: 13px; font-weight: 700; display: flex; align-items: center; gap: 7px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.15);">
        ${renderSvg("download", 16)} Download evidence pack
      </button>
    </div>

    <!-- Timeline list (4-5 dated events) -->
    <div style="position: relative; padding-left: 28px; display: flex; flex-direction: column; gap: 14px; flex: 1; justify-content: space-between;">
      <!-- Vertical connecting line -->
      <div style="position: absolute; left: 11px; top: 8px; bottom: 8px; width: 2px; background: ${isDark ? "#223554" : "#e2e8f0"};"></div>

      <!-- Event 1: 21 Oct - Issue fixed -->
      <div style="position: relative; display: flex; justify-content: space-between; align-items: center; background: ${isDark ? "#16223a" : "#f8fafc"}; border: 1px solid ${isDark ? "#223554" : "#e2e8f0"}; border-radius: 12px; padding: 12px 16px;">
        <div style="position: absolute; left: -24px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; border-radius: 50%; background: ${isDark ? "#4ade80" : "#059669"}; border: 3px solid ${isDark ? "#111a2b" : "#ffffff"};"></div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="badge badge-ok" style="font-size: 12px; padding: 4px 8px;">
            ${renderSvg("fixed", 14)} Fixed
          </span>
          <div>
            <div style="font-size: 14.5px; font-weight: 700; color: ${isDark ? "#f8fafc" : "#0f172a"};">Issue fixed: “Product images have no description”</div>
            <div style="font-size: 12px; color: ${isDark ? "#94a3b8" : "#64748b"};">Resolved across 148 product pages and verified by automated engine</div>
          </div>
        </div>
        <div class="mono" style="font-size: 12.5px; font-weight: 600; color: ${isDark ? "#94a3b8" : "#64748b"};">21 Oct</div>
      </div>

      <!-- Event 2: 14 Oct - Weekly scan completed -->
      <div style="position: relative; display: flex; justify-content: space-between; align-items: center; background: ${isDark ? "#16223a" : "#f8fafc"}; border: 1px solid ${isDark ? "#223554" : "#e2e8f0"}; border-radius: 12px; padding: 12px 16px;">
        <div style="position: absolute; left: -24px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; border-radius: 50%; background: ${isDark ? "#6ea8ff" : "#2563eb"}; border: 3px solid ${isDark ? "#111a2b" : "#ffffff"};"></div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="badge badge-primary" style="font-size: 12px; padding: 4px 8px;">
            ${renderSvg("scan", 14)} Scan
          </span>
          <div>
            <div style="display: flex; align-items: center; gap: 8px;">
              <span style="font-size: 14.5px; font-weight: 700; color: ${isDark ? "#f8fafc" : "#0f172a"};">Weekly scan completed</span>
              <span class="mono" style="font-size: 13px; font-weight: 700; color: ${isDark ? "#4ade80" : "#059669"};">score 72 → 81</span>
            </div>
            <div style="font-size: 12px; color: ${isDark ? "#94a3b8" : "#64748b"};">150 pages checked · 12 issues resolved · 0 regressions detected</div>
          </div>
        </div>
        <div class="mono" style="font-size: 12.5px; font-weight: 600; color: ${isDark ? "#94a3b8" : "#64748b"};">14 Oct</div>
      </div>

      <!-- Event 3: 10 Oct - Manual check logged -->
      <div style="position: relative; display: flex; justify-content: space-between; align-items: center; background: ${isDark ? "#16223a" : "#f8fafc"}; border: 1px solid ${isDark ? "#223554" : "#e2e8f0"}; border-radius: 12px; padding: 12px 16px;">
        <div style="position: absolute; left: -24px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; border-radius: 50%; background: ${isDark ? "#c084fc" : "#7c3aed"}; border: 3px solid ${isDark ? "#111a2b" : "#ffffff"};"></div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="badge badge-info" style="font-size: 12px; padding: 4px 8px;">
            ${renderSvg("user", 14)} Manual
          </span>
          <div>
            <div style="font-size: 14.5px; font-weight: 700; color: ${isDark ? "#f8fafc" : "#0f172a"};">Manual check logged: keyboard test passed</div>
            <div style="font-size: 12px; color: ${isDark ? "#94a3b8" : "#64748b"};">Checkout flow navigation verified using NVDA screen reader & Tab key</div>
          </div>
        </div>
        <div class="mono" style="font-size: 12.5px; font-weight: 600; color: ${isDark ? "#94a3b8" : "#64748b"};">10 Oct</div>
      </div>

      <!-- Event 4: 3 Oct - Accessibility statement published -->
      <div style="position: relative; display: flex; justify-content: space-between; align-items: center; background: ${isDark ? "#16223a" : "#f8fafc"}; border: 1px solid ${isDark ? "#223554" : "#e2e8f0"}; border-radius: 12px; padding: 12px 16px;">
        <div style="position: absolute; left: -24px; top: 50%; transform: translateY(-50%); width: 14px; height: 14px; border-radius: 50%; background: ${isDark ? "#38bdf8" : "#0284c7"}; border: 3px solid ${isDark ? "#111a2b" : "#ffffff"};"></div>
        <div style="display: flex; align-items: center; gap: 12px;">
          <span class="badge" style="background: ${isDark ? "#0c253b" : "#e0f2fe"}; color: ${isDark ? "#38bdf8" : "#0284c7"}; border: 1px solid ${isDark ? "#075985" : "#bae6fd"}; font-size: 12px; padding: 4px 8px;">
            ${renderSvg("document", 14)} Statement
          </span>
          <div>
            <div style="font-size: 14.5px; font-weight: 700; color: ${isDark ? "#f8fafc" : "#0f172a"};">Accessibility statement published</div>
            <div style="font-size: 12px; color: ${isDark ? "#94a3b8" : "#64748b"};">Public WCAG 2.2 AA statement generated and published at /accessibility</div>
          </div>
        </div>
        <div class="mono" style="font-size: 12.5px; font-weight: 600; color: ${isDark ? "#94a3b8" : "#64748b"};">3 Oct</div>
      </div>
    </div>
  </div>
</body>
</html>`;
  }
}

async function run() {
  console.log("Launching Chromium...");
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 800, height: 600 },
    deviceScaleFactor: 2, // 2x Retina quality
  });
  const page = await context.newPage();

  const cards = [
    { id: "scan-progress", file: "scan-progress" },
    { id: "fix-these-first", file: "fix-these-first" },
    { id: "fix-guide", file: "fix-guide" },
    { id: "evidence-timeline", file: "evidence-timeline" },
  ];

  for (const card of cards) {
    for (const theme of ["dark", "light"]) {
      const html = generateHtml(card.id, theme);
      await page.setContent(html, { waitUntil: "networkidle" });
      
      const filename = theme === "dark" 
        ? `${card.file}.png` // default is dark to match the dark theme in user mockup
        : `${card.file}-light.png`;
      const outPath = path.join(OUTPUT_DIR, filename);
      
      await page.screenshot({ path: outPath, clip: { x: 0, y: 0, width: 800, height: 600 } });
      console.log(`Rendered: ${outPath}`);

      if (theme === "dark") {
        // also save explicit -dark.png
        const darkPath = path.join(OUTPUT_DIR, `${card.file}-dark.png`);
        fs.copyFileSync(outPath, darkPath);
      }
    }
  }

  await browser.close();
  console.log("All screenshots rendered successfully!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
