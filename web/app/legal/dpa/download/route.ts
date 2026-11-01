import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import { DPA_SECTIONS, DPA_UPDATED } from "@/lib/legal/dpa";

export const runtime = "nodejs";

const PAGE_W = 595.28; // A4
const PAGE_H = 841.89;
const MARGIN = 56;
const BODY = 10.5;
const LEADING = 15;
const TEXT_W = PAGE_W - MARGIN * 2;

/** The built-in PDF fonts only cover WinAnsi; swap the few common characters outside it. */
const clean = (s: string) =>
  s
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[‐-–]/g, "-")
    .replace(/—/g, " - ")
    .replace(/…/g, "...")
    .replace(/[^\x09\x0A\x20-\x7E\xA0-\xFF]/g, "");

function wrap(text: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of clean(text).split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (line && font.widthOfTextAtSize(next, size) > width) {
      lines.push(line);
      line = word;
    } else {
      line = next;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * DPA download (P6-09): a PDF of the agreement with signature blocks for both parties.
 */
export async function GET() {
  const pdf = await PDFDocument.create();
  pdf.setTitle("EveryVisitor Data Processing Agreement");
  pdf.setAuthor("EveryVisitor Ltd.");
  pdf.setLanguage("en");
  const regular = await pdf.embedFont(StandardFonts.TimesRoman);
  const bold = await pdf.embedFont(StandardFonts.TimesRomanBold);
  const ink = rgb(0.07, 0.07, 0.07);

  let page: PDFPage = pdf.addPage([PAGE_W, PAGE_H]);
  let y = PAGE_H - MARGIN;

  /** Moves to a new page when `needed` points of vertical space are not left. */
  const ensure = (needed: number) => {
    if (y - needed < MARGIN) {
      page = pdf.addPage([PAGE_W, PAGE_H]);
      y = PAGE_H - MARGIN;
    }
  };

  const paragraph = (text: string, opts: { font?: PDFFont; size?: number; indent?: number; gap?: number } = {}) => {
    const font = opts.font ?? regular;
    const size = opts.size ?? BODY;
    const indent = opts.indent ?? 0;
    for (const line of wrap(text, font, size, TEXT_W - indent)) {
      ensure(LEADING);
      y -= LEADING;
      page.drawText(line, { x: MARGIN + indent, y, size, font, color: ink });
    }
    y -= opts.gap ?? 6;
  };

  /** A bold lead-in ("Term:") followed by the text, wrapped as one paragraph. */
  const labelled = (term: string, text: string, indent = 0) => {
    const label = `${clean(term)}: `;
    const labelW = bold.widthOfTextAtSize(label, BODY);
    const words = clean(text).split(/\s+/).filter(Boolean);
    let x = MARGIN + indent;
    ensure(LEADING);
    y -= LEADING;
    page.drawText(label, { x, y, size: BODY, font: bold, color: ink });
    x += labelW;
    for (const word of words) {
      const w = regular.widthOfTextAtSize(word, BODY);
      if (x + w > MARGIN + TEXT_W && x > MARGIN + indent + labelW - 0.1) {
        ensure(LEADING);
        y -= LEADING;
        x = MARGIN + indent;
      }
      page.drawText(word, { x, y, size: BODY, font: regular, color: ink });
      x += w + regular.widthOfTextAtSize(" ", BODY);
    }
    y -= 6;
  };

  paragraph("Data Processing Agreement", { font: bold, size: 20, gap: 2 });
  paragraph(`EveryVisitor Ltd. - Article 28 GDPR and UK GDPR - Version of ${DPA_UPDATED}`, { size: 10, gap: 14 });

  for (const s of DPA_SECTIONS) {
    ensure(LEADING * 3);
    y -= 8;
    paragraph(s.title, { font: bold, size: 13, gap: 4 });
    for (const p of s.paragraphs ?? []) paragraph(p);
    for (const t of s.terms ?? []) labelled(t.term, t.text);
    for (const b of s.bullets ?? []) {
      const startY = y;
      const startPage = page;
      labelled(b.term, b.text, 14);
      // Bullet marker beside the first line, wherever it landed.
      if (startPage === page && startY === y) continue;
      startPage.drawText("-", { x: MARGIN + 3, y: startY - LEADING, size: BODY, font: regular, color: ink });
    }
  }

  // Signature blocks sit together on one page.
  const SIG_H = 6 * 30 + 40;
  ensure(SIG_H);
  y -= 24;
  const colW = (TEXT_W - 30) / 2;
  const parties = ["Controller (Customer)", "Processor (EveryVisitor Ltd.)"];
  const fields = ["Entity name", "Signatory name", "Title", "Signature", "Date"];
  parties.forEach((party, i) => {
    const x = MARGIN + i * (colW + 30);
    let fy = y;
    page.drawText(clean(party), { x, y: fy, size: 11.5, font: bold, color: ink });
    for (const f of fields) {
      fy -= 30;
      page.drawText(`${f}:`, { x, y: fy + 3, size: 9.5, font: regular, color: ink });
      const lineX = x + regular.widthOfTextAtSize(`${f}:`, 9.5) + 6;
      page.drawLine({ start: { x: lineX, y: fy }, end: { x: x + colW, y: fy }, thickness: 0.7, color: ink });
    }
  });

  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const label = `EveryVisitor DPA - Page ${i + 1} of ${pages.length}`;
    p.drawText(label, {
      x: PAGE_W / 2 - regular.widthOfTextAtSize(label, 8.5) / 2,
      y: 28,
      size: 8.5,
      font: regular,
      color: rgb(0.4, 0.4, 0.4),
    });
  });

  const bytes = await pdf.save();
  return new Response(Buffer.from(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="everyvisitor-dpa.pdf"',
      "Cache-Control": "public, max-age=3600",
    },
  });
}
