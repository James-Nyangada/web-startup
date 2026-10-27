"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Icon, I } from "@/components/icons";
import { apiBaseUrl } from "@/lib/api";
import { formatBytes, privacyApi, type DataExport } from "@/lib/admin-api";

const when = (v: string | null) =>
  v
    ? new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }).format(
        new Date(v),
      )
    : "-";

/**
 * S-48 personal data export (GDPR, P6-09): request a zip, see its status, download it while
 * the link is valid. The E-22 email links here with ?export=<id>, which highlights that row.
 */
export function DataExportCard() {
  const params = useSearchParams();
  const highlight = params?.get("export") ?? null;
  const [exports, setExports] = useState<DataExport[]>([]);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [busy, setBusy] = useState(false);
  const cardRef = useRef<HTMLElement>(null);

  const load = useCallback(async () => {
    setExports(await privacyApi.listExports().catch(() => []));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Poll while an export is being prepared.
  useEffect(() => {
    if (!exports.some((e) => e.status === "queued")) return;
    const t = setInterval(() => void load(), 5000);
    return () => clearInterval(t);
  }, [exports, load]);

  useEffect(() => {
    if (highlight && cardRef.current) cardRef.current.scrollIntoView({ block: "center" });
  }, [highlight]);

  const request = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await privacyApi.requestExport();
      setMessage({ text: res.message });
      await load();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "The export could not be requested.", error: true });
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      ref={cardRef}
      id="privacy"
      aria-labelledby="export-title"
      className="flex scroll-mt-24 flex-col gap-4 rounded-2xl border border-line bg-surface p-6 shadow-card"
    >
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 id="export-title" className="m-0 text-base font-semibold text-ink">
            Download your data
          </h2>
          <p className="m-0 mt-0.5 text-xs text-muted">
            A zip with your profile, roles, sign-ins, settings, notes you wrote and files you uploaded, in JSON. We email
            you when it is ready; the download works for 7 days.
          </p>
        </div>
        <button
          type="button"
          onClick={() => void request()}
          disabled={busy || exports.some((e) => e.status === "queued")}
          className="ease-ui flex items-center gap-2 rounded-full border border-line bg-surface px-4 py-2 text-xs font-semibold text-ink hover:bg-subtle disabled:opacity-50"
        >
          <Icon d={I.download} size={15} />
          <span>{busy ? "Requesting…" : "Request my data"}</span>
        </button>
      </div>

      <p role="status" className={`m-0 text-xs ${message?.error ? "font-semibold text-crit" : "text-ink"}`}>
        {message?.text ?? ""}
      </p>

      {exports.length > 0 && (
        <ul className="m-0 list-none divide-y divide-line rounded-xl border border-line p-0">
          {exports.map((e) => (
            <li
              key={e.id}
              className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 text-xs ${e.id === highlight ? "bg-primary-soft/50" : ""}`}
            >
              <span className="text-ink">
                Requested {when(e.createdAt)}
                <span className="block text-muted">
                  {e.status === "queued" && "Being prepared…"}
                  {e.status === "failed" && "This export failed. Request it again, or contact support."}
                  {e.status === "ready" && e.downloadable && `Ready · ${e.fileSize ? formatBytes(e.fileSize) : ""} · link works until ${when(e.expiresAt)}`}
                  {e.status === "ready" && !e.downloadable && "Expired"}
                </span>
              </span>
              {e.status === "ready" && e.downloadable && (
                <a
                  href={`${apiBaseUrl()}${privacyApi.downloadPath(e.id)}`}
                  className="ease-ui rounded-full bg-primary px-3.5 py-1.5 font-semibold text-on-primary no-underline hover:bg-primary-hover"
                >
                  Download zip
                </a>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
