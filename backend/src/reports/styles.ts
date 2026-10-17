/** Print styles. Colours match the web app's design tokens (web/app/globals.css, light theme). */
export const reportCss = `
:root {
  --text: #0c1754; --muted: #476788; --border: #ede5db; --bgs: #f4f1ec; --primary: #2545ff;
  --crit: #b42318; --crit-soft: #fef3f2; --ser: #b54708; --ser-soft: #fff6ed;
  --mod: #8a6100; --mod-soft: #fef9e7; --min: #476788; --min-soft: #f4f1ec;
  --ok: #067647; --ok-soft: #ecfdf3;
}
* { box-sizing: border-box; }
html { font-family: Manrope, "Helvetica Neue", Arial, sans-serif; color: var(--text); font-size: 10.5pt; line-height: 1.5; }
body { margin: 0; }
h1 { font-size: 22pt; line-height: 1.2; margin: 0 0 4pt; }
h2 { font-size: 14pt; margin: 22pt 0 8pt; padding-bottom: 4pt; border-bottom: 1pt solid var(--border); break-after: avoid; }
h3 { font-size: 11.5pt; margin: 14pt 0 4pt; break-after: avoid; }
p { margin: 0 0 6pt; }
a { color: var(--primary); }
.muted { color: var(--muted); }
.small { font-size: 9pt; }
.cover { padding: 8pt 0 14pt; border-bottom: 2pt solid var(--text); margin-bottom: 14pt; }
.cover .site { font-size: 12pt; color: var(--muted); word-break: break-all; }
.meta { display: grid; grid-template-columns: max-content 1fr; gap: 2pt 12pt; margin-top: 10pt; font-size: 9.5pt; }
.meta dt { color: var(--muted); }
.meta dd { margin: 0; }
.score { display: flex; gap: 18pt; align-items: center; padding: 12pt; background: var(--bgs); border-radius: 6pt; break-inside: avoid; }
.score .value { font-size: 34pt; font-weight: 700; line-height: 1; }
.score .band { font-weight: 700; }
.counts { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin: 12pt 0; break-inside: avoid; }
.count { padding: 8pt; border-radius: 6pt; border: 1pt solid var(--border); }
.count .n { display: block; font-size: 18pt; font-weight: 700; line-height: 1.1; }
.sev-critical { color: var(--crit); background: var(--crit-soft); }
.sev-serious { color: var(--ser); background: var(--ser-soft); }
.sev-moderate { color: var(--mod); background: var(--mod-soft); }
.sev-minor { color: var(--min); background: var(--min-soft); }
.badge { display: inline-block; padding: 0 5pt; border-radius: 3pt; font-size: 8.5pt; font-weight: 700; text-transform: capitalize; }
table { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; font-size: 9pt; }
th, td { text-align: left; vertical-align: top; padding: 4pt 6pt; border-bottom: 0.75pt solid var(--border); }
th { color: var(--muted); font-weight: 600; }
thead { display: table-header-group; }
tr { break-inside: avoid; }
td.num, th.num { text-align: right; }
.url { word-break: break-all; }
.issue { padding: 10pt 0; border-bottom: 0.75pt solid var(--border); break-inside: avoid-page; }
.issue h3 { margin-top: 0; }
pre { white-space: pre-wrap; word-break: break-all; font-family: "JetBrains Mono", Menlo, Consolas, monospace; font-size: 8pt;
  background: var(--bgs); padding: 6pt 8pt; border-radius: 4pt; margin: 4pt 0; }
ul { margin: 0 0 6pt; padding-left: 14pt; }
.callout { padding: 10pt 12pt; border-left: 3pt solid var(--primary); background: var(--bgs); border-radius: 0 6pt 6pt 0; break-inside: avoid; }
.limits li { margin-bottom: 3pt; }
`;
