import type { PgBoss } from 'pg-boss';
import type { Repositories } from '../db/repositories/index.js';
import { QUEUE_SCAN_PROCESS, QUEUE_SCAN_RUN } from './boss.js';

/**
 * Recovers scans interrupted by worker termination or restarts (spec P2-08).
 * Scans stuck in 'discovering' or 'scanning' are reset to 'queued' and re-enqueued.
 * Scans stuck in 'processing' are re-enqueued to scan.process if raw data exists,
 * or reset to 'queued' and re-enqueued to scan.run.
 */
export async function recoverInterruptedScans(
  repos: Repositories,
  boss?: PgBoss,
): Promise<number> {
  const interrupted = await repos.scans.findInterruptedScans();
  let recoveredCount = 0;

  for (const scan of interrupted) {
    if (scan.status === 'processing' && scan.rawKey) {
      if (boss) {
        await boss.send(QUEUE_SCAN_PROCESS, { scanId: scan.id });
      }
      recoveredCount++;
    } else {
      await repos.scans.requeueInterrupted(scan.id);
      if (boss) {
        await boss.send(QUEUE_SCAN_RUN, { scanId: scan.id });
      }
      recoveredCount++;
    }
  }

  return recoveredCount;
}
