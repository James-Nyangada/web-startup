import { closeDb, getDb } from '../index.js';
import { staffAnalyticsRepository, todayUtc } from '../repositories/staff-analytics.js';

/**
 * Backfills metrics_daily for the last N days (default 365), oldest first, ending today.
 * Safe to re-run: rows are upserted. Usage: npm run metrics:backfill -- 365
 */
export async function backfillMetrics(
  repo: Pick<ReturnType<typeof staffAnalyticsRepository>, 'computeMetricsForDate'>,
  days: number,
  today = todayUtc(),
  log: (msg: string) => void = console.log,
): Promise<number> {
  let rows = 0;
  for (let i = days; i >= 0; i--) {
    const date = new Date(new Date(`${today}T00:00:00Z`).getTime() - i * 86_400_000)
      .toISOString()
      .slice(0, 10);
    rows += await repo.computeMetricsForDate(date);
    if (i % 30 === 0) log(`backfilled up to ${date} (${rows} rows)`);
  }
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const days = Number(process.argv[2] ?? 365);
  try {
    const started = Date.now();
    const rows = await backfillMetrics(staffAnalyticsRepository(getDb().db), days);
    console.log(`Done: ${rows} metric rows in ${Math.round((Date.now() - started) / 1000)}s.`);
  } catch (error) {
    console.error('Backfill failed:', error);
    process.exitCode = 1;
  } finally {
    await closeDb();
  }
}
