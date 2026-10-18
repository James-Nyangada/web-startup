import type pg from 'pg';
import type { PgBoss } from 'pg-boss';
import type { Repositories } from '../db/repositories/index.js';
import type { StorageService } from '../storage/index.js';
import type { ScanLogger } from '../scanner/types.js';

export interface WorkerContext {
  repos: Repositories;
  storage: StorageService;
  boss?: PgBoss;
  pool?: pg.Pool;
  scannerConcurrency?: number;
  userAgent?: string;
  abortSignal?: AbortSignal;
  /** In testing or monolithic execution, run scan.process immediately after scan.run. */
  autoProcess?: boolean;
  logger?: ScanLogger;
}

export interface ScanJobPayload {
  scanId: string;
}

export interface IssueRecheckJobPayload {
  issueId: string;
}
