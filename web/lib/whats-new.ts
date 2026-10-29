"use client";

import { useEffect, useState } from "react";
import { API_BASE_URL } from "@/lib/api";

export interface WhatsNewEntry {
  id: string;
  date: string;
  title: string;
}

const SEEN_KEY = "ev_whats_new_seen";
export const WHATS_NEW_DAYS = 14;

/** Entries marked "show in app" that are still inside the 14-day window. */
export function recentInAppEntries<T extends { date: string; showInApp: boolean }>(entries: T[], now = new Date()): T[] {
  const cutoff = now.getTime() - WHATS_NEW_DAYS * 86_400_000;
  return entries.filter((e) => e.showInApp && new Date(`${e.date}T00:00:00Z`).getTime() >= cutoff);
}

function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

/** Unseen "What's new" entries for the dot in the app header, and a way to mark them seen. */
export function useWhatsNew() {
  const [entries, setEntries] = useState<WhatsNewEntry[]>([]);
  const [seen, setSeen] = useState<string[]>([]);

  useEffect(() => {
    setSeen(readSeen());
    let cancelled = false;
    fetch(`${API_BASE_URL}/v1/public/content/changelog`)
      .then((r) => (r.ok ? r.json() : null))
      .then((body: { data?: (WhatsNewEntry & { showInApp: boolean })[] } | null) => {
        if (!cancelled && body?.data) setEntries(recentInAppEntries(body.data));
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);

  const unseen = entries.filter((e) => !seen.includes(e.id));
  const markSeen = () => {
    const all = [...new Set([...seen, ...entries.map((e) => e.id)])].slice(-50);
    setSeen(all);
    try {
      localStorage.setItem(SEEN_KEY, JSON.stringify(all));
    } catch {
      // The dot then returns on the next visit.
    }
  };
  return { unseen, markSeen };
}
