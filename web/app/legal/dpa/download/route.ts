import { DPA_SECTIONS, DPA_UPDATED } from "@/lib/legal/dpa";

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/**
 * DPA download (P6-09): a standalone, accessible HTML document with signature blocks.
 * Opens in any browser and prints cleanly to PDF.
 */
export function GET() {
  const body = DPA_SECTIONS.map((s) => {
    const paras = (s.paragraphs ?? []).map((p) => `<p>${esc(p)}</p>`).join("");
    const terms = (s.terms ?? []).map((t) => `<p><strong>${esc(t.term)}:</strong> ${esc(t.text)}</p>`).join("");
    const bullets = s.bullets?.length
      ? `<ul>${s.bullets.map((b) => `<li><strong>${esc(b.term)}:</strong> ${esc(b.text)}</li>`).join("")}</ul>`
      : "";
    return `<section><h2>${esc(s.title)}</h2>${paras}${terms}${bullets}</section>`;
  }).join("\n");

  const signature = (party: string) => `
    <div class="sig">
      <h3>${party}</h3>
      <p>Entity name: <span class="line"></span></p>
      <p>Signatory name: <span class="line"></span></p>
      <p>Title: <span class="line"></span></p>
      <p>Signature: <span class="line"></span></p>
      <p>Date: <span class="line"></span></p>
    </div>`;

  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Plainsight Data Processing Agreement</title>
<style>
  body { font: 16px/1.6 Georgia, "Times New Roman", serif; color: #111; max-width: 46rem; margin: 2.5rem auto; padding: 0 1.25rem; }
  h1 { font-size: 1.75rem; margin: 0 0 .25rem; }
  h2 { font-size: 1.15rem; margin: 2rem 0 .5rem; }
  h3 { font-size: 1rem; margin: 0 0 .75rem; }
  .meta { color: #444; margin: 0 0 2rem; }
  .sigs { display: grid; grid-template-columns: 1fr 1fr; gap: 2rem; margin-top: 3rem; break-inside: avoid; }
  .line { display: inline-block; min-width: 12rem; border-bottom: 1px solid #111; }
  @media print { body { margin: 0; } a { color: inherit; } }
</style>
</head>
<body>
<main>
<h1>Data Processing Agreement</h1>
<p class="meta">Plainsight Ltd. · Article 28 GDPR and UK GDPR · Version of ${esc(DPA_UPDATED)}</p>
${body}
<section class="sigs" aria-label="Signatures">
${signature("Controller (Customer)")}
${signature("Processor (Plainsight Ltd.)")}
</section>
</main>
</body>
</html>`;

  return new Response(html, {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Disposition": 'attachment; filename="plainsight-dpa.html"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
