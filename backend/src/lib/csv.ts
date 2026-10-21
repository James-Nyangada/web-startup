import type { Response } from 'express';

/**
 * One CSV field. Values starting with a spreadsheet formula character are prefixed with an
 * apostrophe so a malicious email or URL cannot run as a formula when opened (OWASP CSV
 * injection).
 */
export function csvField(value: string | number | boolean | Date | null | undefined): string {
  if (value === null || value === undefined) return '';
  let str = value instanceof Date ? value.toISOString() : String(value);
  if (/^[=+\-@\t\r]/.test(str)) str = `'${str}`;
  return /[",\r\n]/.test(str) ? `"${str.replace(/"/g, '""')}"` : str;
}

export function toCsv(
  headers: string[],
  rows: Array<Array<string | number | boolean | Date | null | undefined>>,
): string {
  const lines = [headers, ...rows].map((row) => row.map(csvField).join(','));
  // BOM so Excel opens UTF-8 correctly.
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function sendCsv(res: Response, filename: string, csv: string): void {
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename.replace(/"/g, '')}"`);
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(csv);
}
