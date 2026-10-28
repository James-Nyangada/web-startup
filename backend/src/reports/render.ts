import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { chromium } from 'playwright';
import type { ScanResult } from '../scanner/scan.js';
import {
  FullReport,
  ScanSummaryReport,
  FreeCheckReport,
  type FreeCheckReportInput,
  AgencyOverviewReport,
  type AgencyOverviewReportData,
  EvidencePackReport,
  type EvidencePackReportData,
  ClientMonthlyReport,
  type ClientMonthlyReportData,
} from './templates.js';
import type { ReportBranding } from './components.js';

export type ReportType = 'summary' | 'full' | 'free_check' | 'agency_overview';
export type Paper = 'a4' | 'letter';

export interface ReportOptions {
  type: ReportType;
  paper?: Paper;
  branding?: ReportBranding;
  /** Diagonal text printed across every page, e.g. "TRIAL REPORT". */
  watermark?: string;
}

/** R-01 / R-02 as a complete HTML document. */
export function renderReportHtml(
  scan: ScanResult,
  type: ReportType,
  branding?: ReportBranding,
): string {
  const component = type === 'summary' ? ScanSummaryReport : FullReport;
  return `<!doctype html>${renderToStaticMarkup(createElement(component, { scan, branding }))}`;
}

const footerTemplate = (site: string, branding?: ReportBranding) => {
  const defaultText = `${site.replace(/[<>&"]/g, '')} · Automated checks only, not a compliance assessment`;
  const footerText = branding?.reportFooter
    ? branding.reportFooter.replace(/[<>&"]/g, '')
    : defaultText;
  return `
  <div style="width:100%;font-size:8px;color:#476788;padding:0 15mm;display:flex;justify-content:space-between;font-family:Helvetica,Arial,sans-serif;">
    <span>${footerText}</span>
    <span>Page <span class="pageNumber"></span> of <span class="totalPages"></span></span>
  </div>`;
};

/**
 * Prints the report with Chromium (P1-13): A4 or US Letter, tagged PDF and a
 * bookmark outline built from the headings, page numbers in the footer. The
 * page is rendered offline: every network request is refused.
 */
export async function renderReportPdf(scan: ScanResult, options: ReportOptions): Promise<Buffer> {
  let html = renderReportHtml(scan, options.type, options.branding);
  if (options.watermark) {
    const text = options.watermark.replace(/[<>&"]/g, '');
    const mark = `<div aria-hidden="true" style="position:fixed;top:42%;left:0;width:100%;text-align:center;transform:rotate(-30deg);font:700 72px Helvetica,Arial,sans-serif;color:rgba(15,61,62,0.08);pointer-events:none;z-index:9999;">${text}</div>`;
    html = html.replace('</body>', `${mark}</body>`);
  }
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: options.paper === 'letter' ? 'Letter' : 'A4',
      printBackground: true,
      tagged: true,
      outline: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footerTemplate(scan.rootUrl, options.branding),
      margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

export function renderClientMonthlyReportHtml(
  data: ClientMonthlyReportData,
  branding?: ReportBranding,
): string {
  return `<!doctype html>${renderToStaticMarkup(createElement(ClientMonthlyReport, { data, branding }))}`;
}

export async function renderClientMonthlyReportPdf(
  data: ClientMonthlyReportData,
  options: { paper?: Paper; branding?: ReportBranding } = {},
): Promise<Buffer> {
  const html = renderClientMonthlyReportHtml(data, options.branding);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: options.paper === 'letter' ? 'Letter' : 'A4',
      printBackground: true,
      tagged: true,
      outline: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footerTemplate(data.siteName, options.branding),
      margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

export function renderFreeCheckReportHtml(check: FreeCheckReportInput): string {
  return `<!doctype html>${renderToStaticMarkup(createElement(FreeCheckReport, { check }))}`;
}

export async function renderFreeCheckReportPdf(
  check: FreeCheckReportInput,
  paper: Paper = 'a4',
): Promise<Buffer> {
  const html = renderFreeCheckReportHtml(check);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: paper === 'letter' ? 'Letter' : 'A4',
      printBackground: true,
      tagged: true,
      outline: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footerTemplate(check.url),
      margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

export function renderAgencyOverviewReportHtml(
  data: AgencyOverviewReportData,
  branding?: ReportBranding,
): string {
  return `<!doctype html>${renderToStaticMarkup(createElement(AgencyOverviewReport, { data, branding }))}`;
}

export async function renderAgencyOverviewReportPdf(
  data: AgencyOverviewReportData,
  options: { paper?: Paper; branding?: ReportBranding } = {},
): Promise<Buffer> {
  const html = renderAgencyOverviewReportHtml(data, options.branding);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: options.paper === 'letter' ? 'Letter' : 'A4',
      printBackground: true,
      tagged: true,
      outline: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footerTemplate(data.orgName, options.branding),
      margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}

export function renderEvidencePackReportHtml(
  data: EvidencePackReportData,
  branding?: ReportBranding,
): string {
  return `<!doctype html>${renderToStaticMarkup(createElement(EvidencePackReport, { data, branding }))}`;
}

export async function renderEvidencePackReportPdf(
  data: EvidencePackReportData,
  options: { paper?: Paper; branding?: ReportBranding } = {},
): Promise<Buffer> {
  const html = renderEvidencePackReportHtml(data, options.branding);
  const browser = await chromium.launch();
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    await context.route('**/*', (route) => route.abort());
    const page = await context.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: options.paper === 'letter' ? 'Letter' : 'A4',
      printBackground: true,
      tagged: true,
      outline: true,
      displayHeaderFooter: true,
      headerTemplate: '<span></span>',
      footerTemplate: footerTemplate(data.siteName, options.branding),
      margin: { top: '16mm', bottom: '18mm', left: '15mm', right: '15mm' },
    });
    return pdf;
  } finally {
    await browser.close();
  }
}
