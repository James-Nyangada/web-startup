import type pg from 'pg';
import type { PgBoss } from 'pg-boss';
import type { Repositories } from '../db/repositories/index.js';
import type { StorageService } from '../storage/index.js';
import type { ScanLogger } from '../scanner/types.js';
import type { GuardPolicy } from '../scanner/net/guard.js';

import type { EmailSender } from '../emails/sender.js';
import type { EmailBranding, EmailTemplateId } from '../emails/types.js';

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
  emailSender?: EmailSender;
  /** SSRF policy override for the scanner; tests use it to reach the local fixture server. */
  scannerPolicy?: GuardPolicy;
}

export interface ScanJobPayload {
  scanId: string;
}

export interface IssueRecheckJobPayload {
  issueId: string;
}

export interface EmailSendJobPayload {
  to: string;
  templateId: EmailTemplateId;
  data: Record<string, unknown>;
  branding?: EmailBranding;
}

export interface FreeCheckJobPayload {
  checkId: string;
}

export interface ReportRenderJobPayload {
  reportId: string;
}
