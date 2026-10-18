import type { ScanFrequency } from '../db/schema/index.js';

export interface NextScanOptions {
  frequency: ScanFrequency;
  scanDay: number; // 0 = Sunday, 1 = Monday, ..., 6 = Saturday
  scanHour: number; // 0 - 23
  timeZone: string; // IANA time zone identifier
  from?: Date;
}

export interface ZonedParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

/**
 * Returns the local date/time parts for a Date in a specific IANA time zone.
 */
export function getZonedParts(date: Date, timeZone: string): ZonedParts {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: 'numeric',
    second: 'numeric',
    hourCycle: 'h23',
  });
  const parts = Object.fromEntries(formatter.formatToParts(date).map((p) => [p.type, p.value]));
  return {
    year: parseInt(parts.year ?? '0', 10),
    month: parseInt(parts.month ?? '0', 10),
    day: parseInt(parts.day ?? '0', 10),
    hour: parseInt(parts.hour ?? '0', 10),
    minute: parseInt(parts.minute ?? '0', 10),
    second: parseInt(parts.second ?? '0', 10),
  };
}

/**
 * Returns the day of the week (0 = Sunday, 1 = Monday, ..., 6 = Saturday)
 * for a Date in a specific IANA time zone.
 */
export function getZonedDayOfWeek(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
  const dayStr = formatter.format(date);
  const days: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return days[dayStr] ?? 0;
}

/**
 * Converts a wall-clock date & time in an IANA time zone into a UTC Date object,
 * accounting for DST transitions and offsets.
 */
export function zonedWallClockToUtc(
  year: number,
  month: number, // 1 - 12
  day: number,
  hour: number,
  minute: number,
  timeZone: string,
): Date {
  const guess = new Date(Date.UTC(year, month - 1, day, hour, minute, 0));
  const getOffset = (d: Date): number => {
    const parts = getZonedParts(d, timeZone);
    const asUtc = Date.UTC(
      parts.year,
      parts.month - 1,
      parts.day,
      parts.hour,
      parts.minute,
      parts.second,
    );
    return asUtc - d.getTime();
  };
  const offset = getOffset(guess);
  let result = new Date(guess.getTime() - offset);
  const finalOffset = getOffset(result);
  if (finalOffset !== offset) {
    result = new Date(guess.getTime() - finalOffset);
  }
  return result;
}

/**
 * Calculates the next scan execution time based on site configuration and org time zone.
 * Handles DST changes so weekly/daily scans execute at the configured local hour (spec P2-09).
 */
export function computeNextScanAt(options: NextScanOptions): Date | null {
  if (options.frequency === 'manual') {
    return null;
  }

  const from = options.from ?? new Date();
  const timeZone = options.timeZone || 'UTC';
  const currentParts = getZonedParts(from, timeZone);
  const currentDow = getZonedDayOfWeek(from, timeZone);

  const targetYear = currentParts.year;
  const targetMonth = currentParts.month;
  const targetDay = currentParts.day;

  if (options.frequency === 'daily') {
    const candidate = zonedWallClockToUtc(
      targetYear,
      targetMonth,
      targetDay,
      options.scanHour,
      0,
      timeZone,
    );
    if (candidate.getTime() > from.getTime()) {
      return candidate;
    }
    const nextDay = new Date(candidate.getTime() + 24 * 3600 * 1000);
    const nextParts = getZonedParts(nextDay, timeZone);
    return zonedWallClockToUtc(
      nextParts.year,
      nextParts.month,
      nextParts.day,
      options.scanHour,
      0,
      timeZone,
    );
  }

  if (options.frequency === 'weekly') {
    let daysToAdd = (options.scanDay - currentDow + 7) % 7;
    if (daysToAdd === 0) {
      const candidate = zonedWallClockToUtc(
        targetYear,
        targetMonth,
        targetDay,
        options.scanHour,
        0,
        timeZone,
      );
      if (candidate.getTime() > from.getTime()) {
        return candidate;
      }
      daysToAdd = 7;
    }
    const futureApprox = new Date(
      Date.UTC(targetYear, targetMonth - 1, targetDay + daysToAdd, 12, 0, 0),
    );
    const futureParts = getZonedParts(futureApprox, timeZone);
    return zonedWallClockToUtc(
      futureParts.year,
      futureParts.month,
      futureParts.day,
      options.scanHour,
      0,
      timeZone,
    );
  }

  return null;
}
