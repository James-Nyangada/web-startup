import type pg from 'pg';
import { broadcastScanProgress } from '../routes/scans.js';

export interface ProgressEvent {
  phase: string;
  pagesScanned: number;
  pagesPlanned: number;
  currentUrl?: string;
  score?: number | null;
  status?: string;
  message?: string;
}

export async function publishScanProgress(
  pool: pg.Pool | undefined,
  scanId: string,
  event: ProgressEvent,
): Promise<void> {
  // 1. In-memory local broadcast (for active SSE listeners in the same process)
  try {
    broadcastScanProgress(scanId, event);
  } catch {
    // Ignore in-memory listener errors
  }

  // 2. Postgres NOTIFY scan_progress, payload
  if (pool) {
    try {
      const payload = JSON.stringify({ scanId, ...event });
      await pool.query('SELECT pg_notify($1, $2)', ['scan_progress', payload]);
    } catch {
      // Ignore notification delivery errors
    }
  }
}
