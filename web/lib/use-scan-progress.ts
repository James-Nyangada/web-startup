"use client";

import { useEffect, useRef, useState } from "react";
import { API_BASE_URL, apiClient } from "./api";

export type ScanStatus =
  | "queued"
  | "discovering"
  | "scanning"
  | "processing"
  | "completed"
  | "partial"
  | "failed"
  | "canceled";

export interface ScanCounts {
  critical?: number;
  serious?: number;
  moderate?: number;
  minor?: number;
  new?: number;
  fixed?: number;
  regressed?: number;
  open?: number;
}

export interface ScanRecord {
  id: string;
  orgId: string;
  siteId: string;
  trigger: "manual" | "scheduled" | "onboarding" | "api" | "plugin";
  status: ScanStatus;
  queuedAt: string;
  startedAt?: string | null;
  finishedAt?: string | null;
  pagesDiscovered: number;
  pagesPlanned: number;
  pagesScanned: number;
  pagesFailed: number;
  templatesFound: number;
  axeVersion: string;
  engineVersion: string;
  standard: string;
  score?: number | null;
  counts?: ScanCounts;
  errorCode?: string | null;
  errorMessage?: string | null;
  currentUrl?: string;
}

export interface ScanProgressState {
  scan: ScanRecord | null;
  status: ScanStatus;
  phase: string;
  pagesScanned: number;
  pagesPlanned: number;
  pagesDiscovered: number;
  currentUrl?: string;
  score?: number | null;
  counts?: ScanCounts;
  errorCode?: string | null;
  errorMessage?: string | null;
  isLive: boolean;
  isPolling: boolean;
  announcement: string;
}

/**
 * Live scan progress hook:
 * - Subscribes to Server-Sent Events (SSE) at /v1/orgs/:orgId/scans/:scanId/events
 * - Reconnects automatically on disconnect
 * - Falls back to polling every 5 s if SSE fails (spec P2-10)
 * - Emits throttled aria-live announcements (every 10% change OR every 15 s)
 */
export function useScanProgress(orgId: string, scanId: string, initialScan?: ScanRecord | null): ScanProgressState {
  const [scan, setScan] = useState<ScanRecord | null>(initialScan ?? null);
  const [status, setStatus] = useState<ScanStatus>(initialScan?.status ?? "queued");
  const [phase, setPhase] = useState<string>(initialScan?.status ?? "queued");
  const [pagesScanned, setPagesScanned] = useState<number>(initialScan?.pagesScanned ?? 0);
  const [pagesPlanned, setPagesPlanned] = useState<number>(initialScan?.pagesPlanned ?? 50);
  const [pagesDiscovered, setPagesDiscovered] = useState<number>(initialScan?.pagesDiscovered ?? 0);
  const [currentUrl, setCurrentUrl] = useState<string | undefined>(undefined);
  const [score, setScore] = useState<number | null | undefined>(initialScan?.score);
  const [counts, setCounts] = useState<ScanCounts | undefined>(initialScan?.counts);
  const [errorCode, setErrorCode] = useState<string | null | undefined>(initialScan?.errorCode);
  const [errorMessage, setErrorMessage] = useState<string | null | undefined>(initialScan?.errorMessage);
  const [isPolling, setIsPolling] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const lastAnnounceTime = useRef<number>(Date.now());
  const lastAnnouncePercent = useRef<number>(0);
  const lastAnnouncePhase = useRef<string>("");

  const isTerminal = ["completed", "partial", "failed", "canceled"].includes(status);
  const isLive = !isTerminal;

  // Throttled aria-live announcements: every 10% change OR every 15 seconds (spec P2-10)
  const maybeAnnounce = (
    newStatus: ScanStatus,
    newPhase: string,
    newScanned: number,
    newPlanned: number,
    newScore?: number | null,
    errorMsg?: string | null,
  ) => {
    const now = Date.now();
    const percent = newPlanned > 0 ? Math.min(100, Math.floor((newScanned / newPlanned) * 100)) : 0;
    const phaseChanged = newPhase !== lastAnnouncePhase.current || newStatus !== lastAnnouncePhase.current;
    const percentJump = percent - lastAnnouncePercent.current >= 10;
    const timeElapsed = now - lastAnnounceTime.current >= 15000 && percent !== lastAnnouncePercent.current;
    const terminal = ["completed", "partial", "failed", "canceled"].includes(newStatus);

    if (phaseChanged || percentJump || timeElapsed || terminal) {
      lastAnnounceTime.current = now;
      lastAnnouncePercent.current = percent;
      lastAnnouncePhase.current = newStatus === "scanning" ? newPhase : newStatus;

      let msg = "";
      if (newStatus === "completed") {
        msg = `Scan complete. Final score is ${newScore ?? 0} out of 100.`;
      } else if (newStatus === "partial") {
        msg = `Scan partially complete. Scanned ${newScanned} of ${newPlanned} pages.`;
      } else if (newStatus === "failed") {
        msg = `Scan failed. ${errorMsg ?? "An error occurred."}`;
      } else if (newStatus === "canceled") {
        msg = "Scan was canceled.";
      } else if (newPhase === "discovering" || newStatus === "discovering") {
        msg = "Scan in progress. Discovering site pages and sitemaps.";
      } else if (newPhase === "processing" || newStatus === "processing") {
        msg = "Pages scanned. Now processing violations and calculating score.";
      } else {
        msg = `Scanning page ${newScanned} of ${newPlanned}, ${percent}% complete.`;
      }

      setAnnouncement(msg);
    }
  };

  useEffect(() => {
    if (!orgId || !scanId) return;

    let eventSource: EventSource | null = null;
    let pollTimer: NodeJS.Timeout | null = null;
    let isDisposed = false;

    const stopPolling = () => {
      if (pollTimer) {
        clearInterval(pollTimer);
        pollTimer = null;
      }
      setIsPolling(false);
    };

    const startPolling = () => {
      if (pollTimer || isDisposed) return;
      setIsPolling(true);
      pollTimer = setInterval(async () => {
        try {
          const res = await apiClient<{ scan: ScanRecord }>(`/v1/orgs/${orgId}/scans/${scanId}`);
          if (isDisposed) return;
          const s = res.scan;
          setScan(s);
          setStatus(s.status);
          setPhase(s.status);
          setPagesScanned(s.pagesScanned);
          setPagesPlanned(s.pagesPlanned);
          setPagesDiscovered(s.pagesDiscovered);
          if (s.score !== undefined) setScore(s.score);
          if (s.counts) setCounts(s.counts);
          if (s.errorCode) setErrorCode(s.errorCode);
          if (s.errorMessage) setErrorMessage(s.errorMessage);

          maybeAnnounce(s.status, s.status, s.pagesScanned, s.pagesPlanned, s.score, s.errorMessage);

          if (["completed", "partial", "failed", "canceled"].includes(s.status)) {
            stopPolling();
          }
        } catch {
          // Polling error silently retries on next tick
        }
      }, 5000);
    };

    const connectSSE = () => {
      if (isDisposed) return;

      try {
        const url = `${API_BASE_URL}/v1/orgs/${orgId}/scans/${scanId}/events`;
        eventSource = new EventSource(url, { withCredentials: true });

        eventSource.onmessage = (event) => {
          if (isDisposed) return;
          try {
            const data = JSON.parse(event.data);
            if (data.status) setStatus(data.status);
            if (data.phase) setPhase(data.phase);
            if (typeof data.pagesScanned === "number") setPagesScanned(data.pagesScanned);
            if (typeof data.pagesPlanned === "number") setPagesPlanned(data.pagesPlanned);
            if (data.currentUrl) setCurrentUrl(data.currentUrl);
            if (data.score !== undefined) setScore(data.score);

            maybeAnnounce(
              data.status || status,
              data.phase || phase,
              data.pagesScanned ?? pagesScanned,
              data.pagesPlanned ?? pagesPlanned,
              data.score ?? score,
            );
          } catch {
            // ignore JSON parse error
          }
        };

        eventSource.addEventListener("complete", (event) => {
          if (isDisposed) return;
          try {
            const finalData = JSON.parse((event as MessageEvent).data);
            setScan(finalData);
            setStatus(finalData.status);
            setPhase(finalData.status);
            setPagesScanned(finalData.pagesScanned);
            setPagesPlanned(finalData.pagesPlanned);
            if (finalData.score !== undefined) setScore(finalData.score);
            if (finalData.counts) setCounts(finalData.counts);
            if (finalData.errorMessage) setErrorMessage(finalData.errorMessage);

            maybeAnnounce(
              finalData.status,
              finalData.status,
              finalData.pagesScanned,
              finalData.pagesPlanned,
              finalData.score,
              finalData.errorMessage,
            );
          } catch {
            // ignore parse error
          }
          eventSource?.close();
          stopPolling();
        });

        eventSource.onerror = () => {
          if (isDisposed) return;
          eventSource?.close();
          // Fall back to polling every 5s if SSE fails (spec P2-10)
          startPolling();

          // Attempt to reconnect SSE after 5 seconds
          setTimeout(() => {
            if (!isDisposed && !isTerminal) {
              connectSSE();
            }
          }, 5000);
        };
      } catch {
        startPolling();
      }
    };

    // Initial fetch to load scan data
    void (async () => {
      try {
        const res = await apiClient<{ scan: ScanRecord }>(`/v1/orgs/${orgId}/scans/${scanId}`);
        if (isDisposed) return;
        const s = res.scan;
        setScan(s);
        setStatus(s.status);
        setPhase(s.status);
        setPagesScanned(s.pagesScanned);
        setPagesPlanned(s.pagesPlanned);
        setPagesDiscovered(s.pagesDiscovered);
        if (s.score !== undefined) setScore(s.score);
        if (s.counts) setCounts(s.counts);
        if (s.errorCode) setErrorCode(s.errorCode);
        if (s.errorMessage) setErrorMessage(s.errorMessage);

        maybeAnnounce(s.status, s.status, s.pagesScanned, s.pagesPlanned, s.score, s.errorMessage);

        if (!["completed", "partial", "failed", "canceled"].includes(s.status)) {
          connectSSE();
        }
      } catch {
        connectSSE();
      }
    })();

    return () => {
      isDisposed = true;
      eventSource?.close();
      stopPolling();
    };
  }, [orgId, scanId]);

  return {
    scan,
    status,
    phase,
    pagesScanned,
    pagesPlanned,
    pagesDiscovered,
    currentUrl,
    score,
    counts,
    errorCode,
    errorMessage,
    isLive,
    isPolling,
    announcement,
  };
}
