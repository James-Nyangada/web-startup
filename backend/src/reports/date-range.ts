/**
 * Period covered by an evidence pack (R-03, P5-04). Dates are inclusive calendar days
 * in UTC, formatted YYYY-MM-DD as stored in reports.date_from / date_to.
 */

export interface ReportDateRange {
  from: string;
  to: string;
}

/** Longest period one pack may cover; keeps generation well inside the 3-minute budget. */
export const MAX_RANGE_MONTHS = 36;
export const DEFAULT_RANGE_MONTHS = 12;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class DateRangeError extends Error {}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseIsoDate(value: string, field: string): Date {
  const parsed = new Date(`${value}T00:00:00Z`);
  // Rejects both bad formats and impossible days such as 2026-02-30.
  if (!ISO_DATE.test(value) || Number.isNaN(parsed.getTime()) || toIsoDate(parsed) !== value) {
    throw new DateRangeError(`${field} must be a valid date formatted YYYY-MM-DD.`);
  }
  return parsed;
}

function addMonths(date: Date, months: number): Date {
  const result = new Date(date);
  result.setUTCMonth(result.getUTCMonth() + months);
  return result;
}

/**
 * Validates a requested range and fills in defaults: `to` defaults to today and `from`
 * to 12 months before `to`. Throws DateRangeError with a user-facing message.
 */
export function resolveReportDateRange(
  input: { start?: string; end?: string } | undefined,
  now: Date = new Date(),
): ReportDateRange {
  const today = toIsoDate(now);
  const to = input?.end ? toIsoDate(parseIsoDate(input.end, 'End date')) : today;
  const toDate = parseIsoDate(to, 'End date');
  const from = input?.start
    ? toIsoDate(parseIsoDate(input.start, 'Start date'))
    : toIsoDate(addMonths(toDate, -DEFAULT_RANGE_MONTHS));
  const fromDate = parseIsoDate(from, 'Start date');

  if (to > today) {
    throw new DateRangeError('End date cannot be in the future.');
  }
  if (fromDate > toDate) {
    throw new DateRangeError('Start date must be on or before the end date.');
  }
  if (fromDate < addMonths(toDate, -MAX_RANGE_MONTHS)) {
    throw new DateRangeError(`The period can be at most ${MAX_RANGE_MONTHS} months long.`);
  }
  return { from, to };
}

/** Start of `from` and end of `to` as instants, for filtering timestamp columns. */
export function rangeBounds(range: ReportDateRange): { start: Date; end: Date } {
  return {
    start: new Date(`${range.from}T00:00:00.000Z`),
    end: new Date(`${range.to}T23:59:59.999Z`),
  };
}

export function formatRangeDate(value: string): string {
  return new Date(`${value}T00:00:00Z`).toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'UTC',
  });
}
