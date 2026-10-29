const KEY = "ev_first_utm";
const FIELDS = ["source", "medium", "campaign", "term", "content"] as const;

export type FirstUtm = Partial<Record<(typeof FIELDS)[number], string>>;

/** Saves the first UTM parameters of a visit in sessionStorage (no cookies). The first touch wins. */
export function captureFirstUtm(search: string): void {
  try {
    if (sessionStorage.getItem(KEY)) return;
    const params = new URLSearchParams(search);
    const found: FirstUtm = {};
    for (const f of FIELDS) {
      const v = params.get(`utm_${f}`)?.trim().slice(0, 100);
      if (v) found[f] = v;
    }
    if (Object.keys(found).length > 0) sessionStorage.setItem(KEY, JSON.stringify(found));
  } catch {
    // Storage can be blocked; attribution is best-effort.
  }
}

/** The saved first-touch UTM, or undefined when the visit had none. */
export function readFirstUtm(): FirstUtm | undefined {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as FirstUtm) : undefined;
  } catch {
    return undefined;
  }
}
