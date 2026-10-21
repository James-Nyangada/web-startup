import fs from 'node:fs/promises';
import os from 'node:os';
import type pg from 'pg';
import type { PgBoss } from 'pg-boss';
import { ALL_QUEUES } from '../worker/boss.js';

/** Queue counts for S-72. `failedCount` is pg-boss's dead letter: jobs out of retries. */
export interface QueueSummary {
  name: string;
  queuedCount: number;
  readyCount: number;
  deferredCount: number;
  activeCount: number;
  failedCount: number;
  totalCount: number;
}

export interface QueueJob {
  id: string;
  name: string;
  state: string;
  data: unknown;
  output: unknown;
  retryCount: number;
  createdOn: Date;
  startedOn: Date | null;
  completedOn: Date | null;
}

/** What the staff queue screen needs from pg-boss. Faked in tests. */
export interface QueueAdmin {
  listQueues(): Promise<QueueSummary[]>;
  listJobs(queue: string, state: 'failed' | 'active', limit: number): Promise<QueueJob[]>;
  retryJob(queue: string, id: string): Promise<void>;
  deleteJob(queue: string, id: string): Promise<void>;
}

export function isKnownQueue(name: string): boolean {
  return (ALL_QUEUES as readonly string[]).includes(name);
}

const SCHEMA_NAME = /^[a-z_][a-z0-9_]*$/;

export function pgBossQueueAdmin(
  boss: PgBoss,
  pool: pg.Pool,
  schema = process.env.PG_BOSS_SCHEMA ?? 'pgboss',
): QueueAdmin {
  if (!SCHEMA_NAME.test(schema)) throw new Error(`Invalid pg-boss schema name: ${schema}`);

  return {
    async listQueues() {
      const queues = await boss.getQueues([...ALL_QUEUES]);
      return queues
        .map((q) => ({
          name: q.name,
          queuedCount: q.queuedCount,
          readyCount: q.readyCount,
          deferredCount: q.deferredCount,
          activeCount: q.activeCount,
          failedCount: q.failedCount,
          totalCount: q.totalCount,
        }))
        .sort((a, b) => a.name.localeCompare(b.name));
    },

    async listJobs(queue, state, limit) {
      // findJobs() cannot filter by state, so read the queue's job table directly.
      const { rows: tables } = await pool.query<{ table_name: string }>(
        `select table_name from ${schema}.queue where name = $1`,
        [queue],
      );
      const table = tables[0]?.table_name;
      if (!table || !SCHEMA_NAME.test(table)) return [];
      const { rows } = await pool.query<QueueJob>(
        `select id, name, state, data, output, retry_count as "retryCount",
                created_on as "createdOn", started_on as "startedOn", completed_on as "completedOn"
           from ${schema}.${table}
          where name = $1 and state = $2
          order by coalesce(completed_on, started_on, created_on) desc
          limit $3`,
        [queue, state, limit],
      );
      return rows;
    },

    async retryJob(queue, id) {
      await boss.retry(queue, id);
    },

    async deleteJob(queue, id) {
      await boss.deleteJob(queue, id);
    },
  };
}

export interface SystemSnapshot {
  hostname: string;
  uptimeSeconds: number;
  loadAverage: number[];
  cpuCount: number;
  memory: { totalBytes: number; freeBytes: number; usedRatio: number };
  process: { rssBytes: number; heapUsedBytes: number; uptimeSeconds: number };
  disk: { path: string; totalBytes: number; freeBytes: number; usedRatio: number } | null;
}

/** Server health for S-72. Disk is the volume holding `path` (the data directory in production). */
export async function getSystemSnapshot(diskPath = process.cwd()): Promise<SystemSnapshot> {
  const total = os.totalmem();
  const free = os.freemem();
  const disk: SystemSnapshot['disk'] = await fs
    .statfs(diskPath)
    .then((stats) => {
      const totalBytes = stats.blocks * stats.bsize;
      const freeBytes = stats.bavail * stats.bsize;
      return {
        path: diskPath,
        totalBytes,
        freeBytes,
        usedRatio: totalBytes ? 1 - freeBytes / totalBytes : 0,
      };
    })
    .catch(() => null);
  const mem = process.memoryUsage();
  return {
    hostname: os.hostname(),
    uptimeSeconds: Math.round(os.uptime()),
    loadAverage: os.loadavg().map((n) => Math.round(n * 100) / 100),
    cpuCount: os.cpus().length,
    memory: { totalBytes: total, freeBytes: free, usedRatio: total ? 1 - free / total : 0 },
    process: {
      rssBytes: mem.rss,
      heapUsedBytes: mem.heapUsed,
      uptimeSeconds: Math.round(process.uptime()),
    },
    disk,
  };
}
