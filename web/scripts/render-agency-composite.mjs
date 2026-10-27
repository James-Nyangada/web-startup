import { chromium } from "playwright";
import fs from "fs";
import path from "path";

const OUTPUT_DIR = path.resolve(process.cwd(), "public/screenshots");
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const icons = {
  check: '<path d="M20 6L9 17l-5-5"/>',
  arrowUp: '<path d="m5 12 7-7 7 7"/><path d="M12 19V5"/>',
  critical: '<path d="M7.86 2h8.28L22 7.86v8.28L16.14 22H7.86L2 16.14V7.86z"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  serious: '<path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/>',
  moderate: '<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  minor: '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  fixed: '<circle cx="12" cy="12" r="10"/><path d="m9 12 2 2 4-4"/>',
  regressed: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8"/><path d="M3 3v5h5"/>',
  sparkles: '<path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>',
  building: '<rect width="16" height="20" x="4" y="2" rx="2" ry="2"/><path d="M9 22v-4h6v4"/><path d="M8 6h.01"/><path d="M16 6h.01"/><path d="M8 10h.01"/><path d="M16 10h.01"/><path d="M8 14h.01"/><path d="M16 14h.01"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>',
  fileText: '<path d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z"/><path d="M14 2v4a2 2 0 0 0 2 2h4"/><path d="M10 9H8"/><path d="M16 13H8"/><path d="M16 17H8"/>',
  clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  arrowUpRight: '<path d="M7 17 17 7"/><path d="M7 7h10v10"/>',
};

function renderSvg(name, size = 16, strokeWidth = 2, className = "") {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${strokeWidth}" stroke-linecap="round" stroke-linejoin="round" class="${className}">${icons[name] || ""}</svg>`;
}

function generateCompositeHtml() {
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    html, body {
      width: 1600px;
      height: 1000px;
      overflow: hidden;
      background: #0B1120;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Inter", sans-serif;
      color: #f1f5f9;
      -webkit-font-smoothing: antialiased;
    }
    .mono { font-family: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace; }
    .serif { font-family: "Instrument Serif", Georgia, serif; }

    /* Container */
    .stage {
      position: relative;
      width: 1600px;
      height: 1000px;
      background: #0B1120;
      overflow: hidden;
    }

    /* Ambient lighting gradients */
    .glow-teal {
      position: absolute;
      top: 15%;
      right: 10%;
      width: 500px;
      height: 500px;
      background: radial-gradient(circle, rgba(15, 118, 110, 0.18) 0%, rgba(11, 17, 32, 0) 70%);
      pointer-events: none;
    }
    .glow-blue {
      position: absolute;
      top: 5%;
      left: 10%;
      width: 600px;
      height: 600px;
      background: radial-gradient(circle, rgba(37, 69, 255, 0.12) 0%, rgba(11, 17, 32, 0) 70%);
      pointer-events: none;
    }

    /* BACK LAYER: Agency Overview Dashboard (S-20) */
    .dashboard-window {
      position: absolute;
      top: 36px;
      left: 48px;
      width: 1140px;
      height: 880px;
      background: #111a2b;
      border: 1px solid #26354f;
      border-radius: 18px;
      box-shadow: 0 25px 60px -15px rgba(0, 0, 0, 0.7), 0 0 0 1px rgba(255, 255, 255, 0.05);
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .window-header {
      height: 48px;
      background: #0e1626;
      border-bottom: 1px solid #1e293b;
      display: flex;
      align-items: center;
      padding: 0 18px;
      justify-content: space-between;
    }
    .window-controls {
      display: flex;
      gap: 8px;
    }
    .window-dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
    }
    .dot-close { background: #ef4444; }
    .dot-min { background: #f59e0b; }
    .dot-max { background: #10b981; }

    .agency-topbar {
      height: 64px;
      background: #131f33;
      border-bottom: 1px solid #223554;
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0 24px;
    }
    .agency-brand {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .agency-logo-badge {
      width: 36px;
      height: 36px;
      border-radius: 10px;
      background: linear-gradient(135deg, #0f766e 0%, #14b8a6 100%);
      display: grid;
      place-items: center;
      color: #ffffff;
      font-weight: 800;
      font-size: 18px;
      letter-spacing: -0.05em;
      box-shadow: 0 4px 12px rgba(20, 184, 166, 0.3);
    }
    .agency-name-text {
      font-size: 17px;
      font-weight: 700;
      letter-spacing: -0.01em;
      color: #ffffff;
    }
    .agency-plan-tag {
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 6px;
      background: rgba(20, 184, 166, 0.15);
      color: #2dd4bf;
      border: 1px solid rgba(20, 184, 166, 0.3);
      text-transform: uppercase;
      letter-spacing: 0.05em;
    }

    .agency-nav {
      display: flex;
      gap: 6px;
    }
    .nav-tab {
      padding: 7px 16px;
      border-radius: 8px;
      font-size: 13.5px;
      font-weight: 600;
      color: #94a3b8;
    }
    .nav-tab.active {
      background: #1e2d47;
      color: #ffffff;
    }

    /* Dashboard Body */
    .dashboard-body {
      padding: 26px 28px;
      display: flex;
      flex-direction: column;
      gap: 20px;
    }

    .summary-cards-row {
      display: grid;
      grid-template-columns: repeat(3, 1fr);
      gap: 16px;
    }
    .summary-card {
      background: #0e1626;
      border: 1px solid #223554;
      border-radius: 12px;
      padding: 14px 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .summary-card-val {
      font-size: 26px;
      font-weight: 800;
      color: #f8fafc;
      line-height: 1.1;
      margin-top: 4px;
    }
    .summary-card-lbl {
      font-size: 12px;
      font-weight: 600;
      color: #94a3b8;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    /* Table styling */
    .table-container {
      background: #0e1626;
      border: 1px solid #223554;
      border-radius: 14px;
      overflow: hidden;
    }
    .table-header-bar {
      padding: 14px 20px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #1c2a44;
      background: #111c30;
    }
    .table-title {
      font-size: 15px;
      font-weight: 700;
      color: #ffffff;
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .table-sort-badge {
      font-size: 11.5px;
      color: #38bdf8;
      background: rgba(56, 189, 248, 0.12);
      border: 1px solid rgba(56, 189, 248, 0.25);
      padding: 2px 8px;
      border-radius: 9999px;
      font-weight: 600;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }
    th {
      padding: 11px 18px;
      font-size: 12px;
      font-weight: 600;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid #1c2a44;
      background: #0e1626;
    }
    td {
      padding: 14px 18px;
      font-size: 14px;
      border-bottom: 1px solid #182338;
      color: #e2e8f0;
      vertical-align: middle;
    }
    tr:last-child td {
      border-bottom: none;
    }
    tr.highlight-row {
      background: rgba(20, 184, 166, 0.05);
    }

    /* Badges */
    .badge {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 3px 9px;
      border-radius: 6px;
      font-size: 12.5px;
      font-weight: 700;
    }
    .badge-poor {
      background: #3b1219;
      color: #ff8a80;
      border: 1px solid #5c1d24;
    }
    .badge-needswork {
      background: #382307;
      color: #fdb022;
      border: 1px solid #5c3d14;
    }
    .badge-good {
      background: #0f2419;
      color: #4ade80;
      border: 1px solid #166534;
    }
    .badge-regressed {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.3);
      padding: 2px 7px;
      border-radius: 4px;
      font-size: 11px;
      font-weight: 700;
      text-transform: uppercase;
    }

    /* FRONT LAYER: Branded PDF Report Cover (R-04) */
    .report-card {
      position: absolute;
      right: 52px;
      bottom: 48px;
      width: 610px;
      height: 820px;
      background: #ffffff;
      color: #0f172a;
      border-radius: 16px;
      padding: 44px 44px 36px 44px;
      box-shadow: 
        0 30px 80px -15px rgba(0, 0, 0, 0.8),
        0 10px 30px -5px rgba(0, 0, 0, 0.4),
        0 0 0 1px rgba(255, 255, 255, 0.15);
      transform: rotate(2.2deg);
      transform-origin: 80% 90%;
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      z-index: 10;
    }

    .report-top-stripe {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 8px;
      background: linear-gradient(90deg, #0f766e 0%, #14b8a6 100%);
      border-radius: 16px 16px 0 0;
    }

    .report-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      border-bottom: 2px solid #f1f5f9;
      padding-bottom: 24px;
    }
    .report-brand-lockup {
      display: flex;
      align-items: center;
      gap: 12px;
    }
    .report-logo-mark {
      width: 42px;
      height: 42px;
      border-radius: 10px;
      background: #0f766e;
      color: #ffffff;
      display: grid;
      place-items: center;
      font-weight: 800;
      font-size: 20px;
      box-shadow: 0 4px 10px rgba(15, 118, 110, 0.25);
    }
    .report-brand-title {
      font-size: 19px;
      font-weight: 800;
      color: #0f766e;
      letter-spacing: -0.02em;
    }
    .report-brand-sub {
      font-size: 11.5px;
      font-weight: 600;
      color: #64748b;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    .report-pill-date {
      font-size: 12px;
      font-weight: 700;
      padding: 5px 12px;
      border-radius: 9999px;
      background: #f1f5f9;
      color: #475569;
    }

    .report-title-section {
      margin-top: 10px;
    }
    .report-eyebrow {
      font-size: 12px;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.08em;
      color: #0f766e;
      margin-bottom: 6px;
    }
    .report-title {
      font-size: 26px;
      font-weight: 800;
      line-height: 1.25;
      color: #0f172a;
      letter-spacing: -0.02em;
    }
    .report-subtitle {
      font-size: 14.5px;
      color: #64748b;
      margin-top: 6px;
    }

    /* "This month at a glance" Card inside Report */
    .report-glance-card {
      background: #f8fafc;
      border: 1.5px solid #ccfbf1;
      border-radius: 14px;
      padding: 22px;
      display: flex;
      flex-direction: column;
      gap: 16px;
    }
    .glance-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .glance-title {
      font-size: 13.5px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #0f766e;
    }
    .score-leap-badge {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      padding: 6px 14px;
      border-radius: 9999px;
      background: #ecfdf5;
      border: 1px solid #a7f3d0;
      color: #059669;
      font-weight: 800;
      font-size: 15px;
    }

    .glance-stats-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 12px;
    }
    .glance-stat-box {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      border-radius: 10px;
      padding: 12px 14px;
    }
    .stat-box-num {
      font-size: 22px;
      font-weight: 800;
      color: #0f172a;
      display: flex;
      align-items: center;
      gap: 6px;
    }
    .stat-box-lbl {
      font-size: 12px;
      color: #64748b;
      margin-top: 2px;
      font-weight: 500;
    }

    .remediation-callout {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 12px 14px;
      background: #ffffff;
      border-radius: 10px;
      border-left: 4px solid #0f766e;
      font-size: 13px;
      color: #334155;
    }

    .report-footer {
      border-top: 1px solid #f1f5f9;
      padding-top: 18px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 12px;
      color: #64748b;
    }
    .report-agency-signoff {
      font-weight: 700;
      color: #0f766e;
      display: flex;
      align-items: center;
      gap: 6px;
    }

    /* OPTIONAL THIRD LAYER: Client Portal Phone (S-61) */
    .phone-mockup {
      position: absolute;
      left: 78px;
      bottom: 40px;
      width: 270px;
      height: 480px;
      background: #090e17;
      border: 8px solid #202b3d;
      border-radius: 36px;
      box-shadow: 
        0 35px 70px -10px rgba(0, 0, 0, 0.85),
        0 10px 25px rgba(0, 0, 0, 0.5),
        0 0 0 1px rgba(255, 255, 255, 0.1);
      transform: rotate(-2.5deg);
      transform-origin: 20% 90%;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      z-index: 15;
    }

    .phone-notch-bar {
      height: 24px;
      display: flex;
      justify-content: center;
      align-items: center;
      background: #090e17;
    }
    .phone-dynamic-island {
      width: 80px;
      height: 14px;
      background: #000000;
      border-radius: 9999px;
    }

    .phone-screen {
      flex: 1;
      background: #0d1524;
      padding: 16px;
      display: flex;
      flex-direction: column;
      gap: 12px;
      color: #f8fafc;
    }
    .portal-header-small {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 10px;
    }
    .portal-brand-text {
      font-size: 12px;
      font-weight: 800;
      color: #2dd4bf;
    }
    .portal-site-name {
      font-size: 16px;
      font-weight: 800;
      color: #ffffff;
    }
    .portal-score-card {
      background: #142033;
      border: 1px solid #233552;
      border-radius: 12px;
      padding: 12px;
      text-align: center;
    }
    .portal-score-num {
      font-size: 32px;
      font-weight: 800;
      color: #4ade80;
      line-height: 1;
    }
    .portal-improving-pill {
      display: inline-block;
      font-size: 11px;
      font-weight: 700;
      padding: 2px 8px;
      border-radius: 9999px;
      background: rgba(74, 222, 128, 0.15);
      color: #4ade80;
      margin-top: 4px;
    }
    .portal-jargon-free-note {
      font-size: 12px;
      font-weight: 600;
      color: #cbd5e1;
      line-height: 1.4;
      margin-top: 4px;
    }

    .portal-fix-item {
      display: flex;
      align-items: center;
      gap: 8px;
      font-size: 11.5px;
      color: #94a3b8;
      background: #0e1626;
      border: 1px solid #1a273e;
      padding: 7px 10px;
      border-radius: 8px;
    }
    .fix-check-icon {
      color: #4ade80;
      display: flex;
    }
  </style>
</head>
<body>
  <div class="stage">
    <!-- Ambient glow effects -->
    <div class="glow-teal"></div>
    <div class="glow-blue"></div>

    <!-- ============================================== -->
    <!-- BACK LAYER: Agency Overview Dashboard (S-20)   -->
    <!-- ============================================== -->
    <div class="dashboard-window">
      <!-- Browser window chrome -->
      <div class="window-header">
        <div class="window-controls">
          <div class="window-dot dot-close"></div>
          <div class="window-dot dot-min"></div>
          <div class="window-dot dot-max"></div>
        </div>
        <div class="mono" style="font-size: 12px; color: #64748b;">app.everyvisitor.com/brightline-studio/overview</div>
        <div style="width: 50px;"></div>
      </div>

      <!-- Agency top navigation bar -->
      <div class="agency-topbar">
        <div class="agency-brand">
          <div class="agency-logo-badge">B</div>
          <div>
            <div class="agency-name-text">Brightline Studio</div>
            <div style="font-size: 11px; color: #94a3b8;">Client Accessibility Portal</div>
          </div>
          <span class="agency-plan-tag">Agency Pro</span>
        </div>

        <div class="agency-nav">
          <div class="nav-tab active">Overview (5 sites)</div>
          <div class="nav-tab">Reports</div>
          <div class="nav-tab">Branding</div>
          <div class="nav-tab">Settings</div>
        </div>

        <div style="display: flex; align-items: center; gap: 12px;">
          <div style="display: flex; align-items: center; gap: 8px; background: #0e1626; border: 1px solid #223554; padding: 6px 12px; border-radius: 8px; font-size: 13px; color: #94a3b8;">
            ${renderSvg("search", 14)} Search client sites...
          </div>
          <div style="width: 32px; height: 32px; border-radius: 50%; background: #0f766e; color: #ffffff; display: grid; place-items: center; font-size: 13px; font-weight: 700;">
            DM
          </div>
        </div>
      </div>

      <!-- Dashboard Content -->
      <div class="dashboard-body">
        <!-- Summary cards row -->
        <div class="summary-cards-row">
          <div class="summary-card">
            <div>
              <div class="summary-card-lbl">Monitored sites</div>
              <div class="summary-card-val">5 client stores</div>
            </div>
            <div style="color: #38bdf8; background: rgba(56, 189, 248, 0.1); padding: 10px; border-radius: 10px;">
              ${renderSvg("building", 22)}
            </div>
          </div>

          <div class="summary-card">
            <div>
              <div class="summary-card-lbl">Average portfolio score</div>
              <div class="summary-card-val mono" style="color: #4ade80;">77.6 <span style="font-size: 14px; font-weight: 600; color: #4ade80;">↑ +5.2</span></div>
            </div>
            <div style="color: #4ade80; background: rgba(74, 222, 128, 0.1); padding: 10px; border-radius: 10px;">
              ${renderSvg("shield", 22)}
            </div>
          </div>

          <div class="summary-card" style="border-color: rgba(245, 158, 11, 0.3);">
            <div>
              <div class="summary-card-lbl">Attention needed</div>
              <div class="summary-card-val" style="color: #fdb022; font-size: 22px;">1 Regressed alert</div>
            </div>
            <div style="color: #fdb022; background: rgba(245, 158, 11, 0.1); padding: 10px; border-radius: 10px;">
              ${renderSvg("regressed", 22)}
            </div>
          </div>
        </div>

        <!-- Worst-first Table -->
        <div class="table-container">
          <div class="table-header-bar">
            <div class="table-title">
              <span>Client sites</span>
              <span class="table-sort-badge">Sorted: Worst score first</span>
            </div>
            <div style="font-size: 12.5px; color: #94a3b8;">
              Showing all 5 monitored production domains
            </div>
          </div>

          <table>
            <thead>
              <tr>
                <th style="width: 280px;">Client Site</th>
                <th>Score</th>
                <th>Critical / Serious</th>
                <th>Last scan</th>
                <th>Alerts</th>
              </tr>
            </thead>
            <tbody>
              <!-- Row 1: Harbour Coffee (Worst: 58) -->
              <tr>
                <td>
                  <div style="font-weight: 700; color: #ffffff; font-size: 14.5px;">harbourcoffee.com</div>
                  <div style="font-size: 12px; color: #94a3b8;">Harbour Coffee Roasters</div>
                </td>
                <td>
                  <span class="badge badge-poor mono">
                    ${renderSvg("critical", 13)} 58 · Poor
                  </span>
                </td>
                <td class="mono" style="font-weight: 700; color: #ff8a80;">4 / 9</td>
                <td style="color: #94a3b8; font-size: 13px;">2 days ago</td>
                <td><span style="color: #64748b; font-size: 12px;">—</span></td>
              </tr>

              <!-- Row 2: Juniper & Co. (72 with Regressed alert) -->
              <tr class="highlight-row">
                <td>
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <div style="font-weight: 700; color: #ffffff; font-size: 14.5px;">juniperandco.com</div>
                    <span class="badge-regressed">${renderSvg("regressed", 11)} Regressed</span>
                  </div>
                  <div style="font-size: 12px; color: #94a3b8;">Juniper & Co. Apparel</div>
                </td>
                <td>
                  <span class="badge badge-needswork mono">
                    ${renderSvg("serious", 13)} 72 · Needs work
                  </span>
                </td>
                <td class="mono" style="font-weight: 700; color: #fdb022;">3 / 7</td>
                <td style="color: #94a3b8; font-size: 13px;">Yesterday</td>
                <td><span style="color: #f87171; font-size: 12.5px; font-weight: 600;">1 reopened</span></td>
              </tr>

              <!-- Row 3: Northfield Bikes (79) -->
              <tr>
                <td>
                  <div style="font-weight: 700; color: #ffffff; font-size: 14.5px;">northfieldbikes.com</div>
                  <div style="font-size: 12px; color: #94a3b8;">Northfield Cycles</div>
                </td>
                <td>
                  <span class="badge badge-needswork mono">
                    ${renderSvg("serious", 13)} 79 · Needs work
                  </span>
                </td>
                <td class="mono" style="font-weight: 700; color: #e2e8f0;">1 / 5</td>
                <td style="color: #94a3b8; font-size: 13px;">Today</td>
                <td><span style="color: #4ade80; font-size: 12px;">All passing</span></td>
              </tr>

              <!-- Row 4: Luma Skincare (86) -->
              <tr>
                <td>
                  <div style="font-weight: 700; color: #ffffff; font-size: 14.5px;">lumaskincare.com</div>
                  <div style="font-size: 12px; color: #94a3b8;">Luma Natural Skincare</div>
                </td>
                <td>
                  <span class="badge badge-needswork mono" style="color: #facc15; border-color: #713f12;">
                    ${renderSvg("moderate", 13)} 86 · Needs work
                  </span>
                </td>
                <td class="mono" style="font-weight: 700; color: #e2e8f0;">0 / 3</td>
                <td style="color: #94a3b8; font-size: 13px;">3 days ago</td>
                <td><span style="color: #64748b; font-size: 12px;">—</span></td>
              </tr>

              <!-- Row 5: Oak & Ember (93 Good) -->
              <tr>
                <td>
                  <div style="font-weight: 700; color: #ffffff; font-size: 14.5px;">oakandember.co.uk</div>
                  <div style="font-size: 12px; color: #94a3b8;">Oak & Ember Home</div>
                </td>
                <td>
                  <span class="badge badge-good mono">
                    ${renderSvg("fixed", 13)} 93 · Good
                  </span>
                </td>
                <td class="mono" style="font-weight: 700; color: #4ade80;">0 / 1</td>
                <td style="color: #94a3b8; font-size: 13px;">Today</td>
                <td><span style="color: #4ade80; font-size: 12px;">Care plan active</span></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <!-- ============================================== -->
    <!-- FRONT LAYER: Branded PDF Report Cover (R-04)   -->
    <!-- ============================================== -->
    <div class="report-card">
      <div class="report-top-stripe"></div>

      <!-- Report Brand Header -->
      <div class="report-header">
        <div class="report-brand-lockup">
          <div class="report-logo-mark">B</div>
          <div>
            <div class="report-brand-title">BRIGHTLINE STUDIO</div>
            <div class="report-brand-sub">Accessibility & Design Practice</div>
          </div>
        </div>
        <div class="report-pill-date">October 2026</div>
      </div>

      <!-- Report Title -->
      <div class="report-title-section">
        <div class="report-eyebrow">Client Accessibility Care Plan</div>
        <h1 class="report-title">Monthly accessibility report — Juniper & Co. — October 2026</h1>
        <p class="report-subtitle">Automated compliance audit, remediation record and WCAG conformance progress.</p>
      </div>

      <!-- "This month at a glance" Block -->
      <div class="report-glance-card">
        <div class="glance-header">
          <span class="glance-title">This month at a glance</span>
          <div class="score-leap-badge">
            <span class="mono" style="font-size: 18px; font-weight: 800;">Score 72 → 81</span>
            <span style="font-size: 15px;">↑</span>
          </div>
        </div>

        <div class="glance-stats-grid">
          <div class="glance-stat-box">
            <div class="stat-box-num" style="color: #059669;">
              ${renderSvg("check", 20, 2.5)} 6
            </div>
            <div class="stat-box-lbl">problems fixed this month</div>
          </div>

          <div class="glance-stat-box">
            <div class="stat-box-num" style="color: #d97706;">
              ${renderSvg("serious", 20, 2.5)} 3
            </div>
            <div class="stat-box-lbl">still open: 1 critical, 2 serious</div>
          </div>
        </div>

        <div class="remediation-callout">
          <div style="font-weight: 700; color: #0f766e;">Key Fix:</div>
          <div>Product image missing descriptions remediated across entire catalog.</div>
        </div>
      </div>

      <!-- Report Signoff Footer (No EveryVisitor branding!) -->
      <div class="report-footer">
        <div class="report-agency-signoff">
          ${renderSvg("shield", 15)} Prepared by Brightline Studio
        </div>
        <div style="font-size: 11px; color: #94a3b8;">
          Verified compliance engine · Page 1 of 6
        </div>
      </div>
    </div>

    <!-- ============================================== -->
    <!-- OPTIONAL THIRD LAYER: Client Portal Phone      -->
    <!-- ============================================== -->
    <div class="phone-mockup">
      <div class="phone-notch-bar">
        <div class="phone-dynamic-island"></div>
      </div>

      <div class="phone-screen">
        <div class="portal-header-small">
          <span class="portal-brand-text">BRIGHTLINE PORTAL</span>
          <span style="font-size: 10px; color: #94a3b8;">Client View</span>
        </div>

        <div>
          <div style="font-size: 11px; color: #94a3b8;">Website status</div>
          <div class="portal-site-name">Juniper & Co.</div>
        </div>

        <div class="portal-score-card">
          <div style="font-size: 11px; color: #94a3b8; text-transform: uppercase;">Accessibility Score</div>
          <div class="portal-score-num mono">81</div>
          <span class="portal-improving-pill">● Improving</span>
          <div class="portal-jargon-free-note">
            “6 problems fixed by your agency this month”
          </div>
        </div>

        <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
          <div style="font-size: 11px; font-weight: 700; color: #cbd5e1;">Recent Fixes:</div>
          <div class="portal-fix-item">
            <span class="fix-check-icon">${renderSvg("check", 13, 2.5)}</span>
            <span>Product image descriptions added</span>
          </div>
          <div class="portal-fix-item">
            <span class="fix-check-icon">${renderSvg("check", 13, 2.5)}</span>
            <span>Cart checkout buttons readable</span>
          </div>
          <div class="portal-fix-item">
            <span class="fix-check-icon">${renderSvg("check", 13, 2.5)}</span>
            <span>Footer text contrast boosted</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

async function run() {
  console.log("Launching Chromium for Agency Composite...");
  const browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    deviceScaleFactor: 2, // 2x Retina resolution
  });
  const page = await context.newPage();

  const html = generateCompositeHtml();
  await page.setContent(html, { waitUntil: "networkidle" });

  const webpPath = path.join(OUTPUT_DIR, "agency-composite.webp");
  const pngPath = path.join(OUTPUT_DIR, "agency-composite.png");

  // Export WebP
  await page.screenshot({ path: webpPath, type: "webp", quality: 92, clip: { x: 0, y: 0, width: 1600, height: 1000 } });
  console.log(`Rendered: ${webpPath}`);

  // Also export PNG
  await page.screenshot({ path: pngPath, type: "png", clip: { x: 0, y: 0, width: 1600, height: 1000 } });
  console.log(`Rendered: ${pngPath}`);

  await browser.close();
  console.log("Agency Composite rendered successfully!");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
