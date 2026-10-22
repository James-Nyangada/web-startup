"use client";

import React, { useCallback, useEffect, useState } from "react";
import { StaffShell, btn, card, formatDate, td, th } from "@/components/staff/staff-shell";
import { useToast } from "@/components/shell/toast-context";
import { formatBytes, formatMoney, staffApi, type QueueJob, type QueueSummary, type SystemReport } from "@/lib/admin-api";

function Meter({ label, ratio, detail }: { label: string; ratio: number; detail: string }) {
  const pct = Math.round(ratio * 100);
  const tone = pct >= 90 ? "bg-crit" : pct >= 75 ? "bg-ser" : "bg-ok";
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className="font-semibold">{label}</span>
        <span className="tnum text-muted">{pct}% used</span>
      </div>
      <div
        role="meter"
        aria-label={`${label} used`}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className="mt-1.5 h-2 overflow-hidden rounded-full bg-sunk"
      >
        <div className={`h-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <p className="m-0 mt-1 text-xs text-muted">{detail}</p>
    </div>
  );
}

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className={card}>
      <p className="m-0 text-xs font-semibold text-muted">{label}</p>
      <p className="tnum m-0 mt-1 text-2xl font-semibold">{value}</p>
      {hint && <p className="m-0 mt-1 text-xs text-muted">{hint}</p>}
    </div>
  );
}

/** S-72: queue depths, dead jobs and server health (P6-03). */
export default function StaffQueuesPage() {
  const { showToast } = useToast();
  const [queues, setQueues] = useState<QueueSummary[] | null>(null);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [report, setReport] = useState<SystemReport | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [jobState, setJobState] = useState<"failed" | "active">("failed");
  const [jobs, setJobs] = useState<QueueJob[]>([]);
  const [busyJob, setBusyJob] = useState<string | null>(null);

  const load = useCallback(async () => {
    const [q, r] = await Promise.allSettled([staffApi.queues(), staffApi.system(7)]);
    if (q.status === "fulfilled") {
      setQueues(q.value);
      setQueueError(null);
    } else setQueueError(q.reason instanceof Error ? q.reason.message : "Queues could not load.");
    if (r.status === "fulfilled") setReport(r.value);
  }, []);

  const loadJobs = useCallback(async (queue: string, state: "failed" | "active") => {
    setJobs(await staffApi.jobs(queue, state).catch(() => []));
  }, []);

  useEffect(() => {
    void load();
    const t = setInterval(() => void load(), 15_000);
    return () => clearInterval(t);
  }, [load]);

  useEffect(() => {
    if (selected) void loadJobs(selected, jobState);
  }, [selected, jobState, loadJobs]);

  const act = async (job: QueueJob, action: "retry" | "delete") => {
    setBusyJob(job.id);
    try {
      if (action === "retry") await staffApi.retryJob(job.name, job.id);
      else await staffApi.deleteJob(job.name, job.id);
      showToast(action === "retry" ? "Job queued again." : "Job deleted.");
      await Promise.all([load(), loadJobs(job.name, jobState)]);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "That did not work.", { type: "error" });
    } finally {
      setBusyJob(null);
    }
  };

  const m = report?.metrics;
  const sys = report?.system;

  return (
    <StaffShell
      title="Queues and system"
     
      actions={
        <button type="button" className={btn.secondary} onClick={() => void load()}>
          Refresh
        </button>
      }
    >
      {m && (
        <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-5">
          <Stat label="Scans, last 7 days" value={String(m.scans.total)} />
          <Stat
            label="Scan failure rate"
            value={`${(m.scans.failureRate * 100).toFixed(1)}%`}
            hint={`${m.scans.failed} failed`}
          />
          <Stat
            label="Average scan time"
            value={m.scans.avgDurationMs ? `${Math.round(m.scans.avgDurationMs / 60_000)} min` : "—"}
          />
          <Stat
            label="Trials converted"
            value={`${m.trialConversion.converted} / ${m.trialConversion.trialsStarted}`}
            hint="Orgs created in the last 7 days"
          />
          <Stat label="MRR" value={formatMoney(m.mrrCents)} />
        </div>
      )}

      {sys && (
        <section aria-labelledby="h-server" className={`${card} mb-5`}>
          <h2 id="h-server" className="m-0 mb-4 text-base font-semibold">
            Server {sys.hostname}
            <span className="ml-2 text-sm font-normal text-muted">
              up {Math.round(sys.uptimeSeconds / 3600)} h · load {sys.loadAverage.join(" / ")} on {sys.cpuCount} CPUs
            </span>
          </h2>
          <div className="grid gap-5 sm:grid-cols-2">
            <Meter
              label="Memory"
              ratio={sys.memory.usedRatio}
              detail={`${formatBytes(sys.memory.totalBytes - sys.memory.freeBytes)} of ${formatBytes(sys.memory.totalBytes)} · API process ${formatBytes(sys.process.rssBytes)}`}
            />
            {sys.disk ? (
              <Meter
                label="Disk"
                ratio={sys.disk.usedRatio}
                detail={`${formatBytes(sys.disk.freeBytes)} free of ${formatBytes(sys.disk.totalBytes)} (${sys.disk.path})`}
              />
            ) : (
              <p className="m-0 text-sm text-muted">Disk usage is not available.</p>
            )}
          </div>
        </section>
      )}

      <section aria-labelledby="h-queues" className="overflow-hidden rounded-2xl border border-line bg-surface shadow-card">
        <h2 id="h-queues" className="m-0 border-b border-line px-5 py-3 text-base font-semibold">
          Queues
        </h2>
        {queueError && (
          <p role="alert" className="m-0 px-5 py-4 text-sm text-crit">
            {queueError}
          </p>
        )}
        {queues && (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead className="bg-subtle">
                <tr>
                  <th scope="col" className={th}>Queue</th>
                  <th scope="col" className={`${th} text-right`}>Ready</th>
                  <th scope="col" className={`${th} text-right`}>Deferred</th>
                  <th scope="col" className={`${th} text-right`}>Running</th>
                  <th scope="col" className={`${th} text-right`}>Failed (dead)</th>
                  <th scope="col" className={th}>
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {queues.map((q) => (
                  <tr key={q.name} className={selected === q.name ? "bg-primary-soft/40" : undefined}>
                    <th scope="row" className={`${td} font-mono font-semibold`}>{q.name}</th>
                    <td className={`${td} tnum text-right`}>{q.readyCount}</td>
                    <td className={`${td} tnum text-right`}>{q.deferredCount}</td>
                    <td className={`${td} tnum text-right`}>{q.activeCount}</td>
                    <td className={`${td} tnum text-right ${q.failedCount ? "font-semibold text-crit" : ""}`}>{q.failedCount}</td>
                    <td className={`${td} text-right`}>
                      <button
                        type="button"
                        className={btn.secondary}
                        aria-pressed={selected === q.name}
                        onClick={() => setSelected(selected === q.name ? null : q.name)}
                      >
                        {selected === q.name ? "Hide jobs" : "Jobs"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {selected && (
        <section aria-labelledby="h-jobs" className={`${card} mt-5`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 id="h-jobs" className="m-0 text-base font-semibold">
              <span className="font-mono">{selected}</span> jobs
            </h2>
            <div role="group" aria-label="Job state" className="flex gap-1">
              {(["failed", "active"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  aria-pressed={jobState === s}
                  onClick={() => setJobState(s)}
                  className={jobState === s ? btn.primary : btn.secondary}
                >
                  {s === "failed" ? "Failed" : "Running"}
                </button>
              ))}
            </div>
          </div>
          {jobs.length === 0 ? (
            <p className="m-0 text-sm text-muted">No {jobState === "failed" ? "failed" : "running"} jobs.</p>
          ) : (
            <ul className="m-0 flex list-none flex-col gap-3 p-0">
              {jobs.map((j) => (
                <li key={j.id} className="rounded-xl border border-line p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
                    <span className="font-mono text-xs">{j.id}</span>
                    <span className="text-xs text-muted">
                      created {formatDate(j.createdOn, true)} · retries {j.retryCount}
                      {j.completedOn && ` · failed ${formatDate(j.completedOn, true)}`}
                    </span>
                  </div>
                  <details className="mt-2">
                    <summary className="cursor-pointer text-sm font-semibold">Payload and error</summary>
                    <pre className="mt-2 max-h-64 overflow-auto rounded-lg bg-subtle p-3 text-xs">
                      {JSON.stringify({ data: j.data, output: j.output }, null, 2)}
                    </pre>
                  </details>
                  {jobState === "failed" && (
                    <div className="mt-2 flex gap-2">
                      <button type="button" className={btn.secondary} disabled={busyJob === j.id} onClick={() => void act(j, "retry")}>
                        Retry
                      </button>
                      <button type="button" className={btn.danger} disabled={busyJob === j.id} onClick={() => void act(j, "delete")}>
                        Delete
                      </button>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
    </StaffShell>
  );
}
