"use client";

import React, { useEffect, useId, useMemo, useRef, useState } from "react";
import { Icon, I } from "@/components/icons";

export interface TimeZoneOption {
  value: string;
  city: string;
  region: string;
  longName: string;
  offset: string;
  offsetMinutes: number;
  /** City, zone names, abbreviations, offsets and KEYWORDS: a hit here ranks above a region-only hit. */
  primaryWords: string[];
  searchWords: string[];
}

// ICU still reports some zones under their old names; show and save the current ones.
const RENAMED: Record<string, string> = {
  "Asia/Calcutta": "Asia/Kolkata",
  "Asia/Katmandu": "Asia/Kathmandu",
  "Asia/Rangoon": "Asia/Yangon",
  "Asia/Saigon": "Asia/Ho_Chi_Minh",
  "Europe/Kiev": "Europe/Kyiv",
  "America/Godthab": "America/Nuuk",
  "Atlantic/Faeroe": "Atlantic/Faroe",
  "Pacific/Enderbury": "Pacific/Kanton",
  "America/Buenos_Aires": "America/Argentina/Buenos_Aires",
  "America/Indianapolis": "America/Indiana/Indianapolis",
};

// Extra search words for zones people usually look up by a neighbouring city,
// country or abbreviation rather than the IANA city.
const KEYWORDS: Record<string, string> = {
  UTC: "gmt zulu universal coordinated",
  "Europe/London": "uk britain england gmt bst dublin edinburgh",
  "Europe/Paris": "france cet berlin amsterdam brussels madrid rome",
  "Europe/Berlin": "germany cet",
  "America/New_York": "eastern est edt toronto miami boston washington usa",
  "America/Chicago": "central cst cdt dallas houston usa",
  "America/Denver": "mountain mst mdt calgary usa",
  "America/Phoenix": "arizona mst usa",
  "America/Los_Angeles": "pacific pst pdt san francisco seattle vancouver usa",
  "America/Anchorage": "alaska akst usa",
  "Pacific/Honolulu": "hawaii hst usa",
  "America/Sao_Paulo": "brazil brt rio",
  "Africa/Nairobi": "kenya eat addis ababa kampala dar es salaam",
  "Africa/Lagos": "nigeria wat",
  "Africa/Johannesburg": "south africa sast cape town",
  "Africa/Cairo": "egypt eet",
  "Asia/Kolkata": "india ist mumbai delhi bangalore calcutta",
  "Asia/Dubai": "uae gst abu dhabi",
  "Asia/Singapore": "sgt malaysia kuala lumpur",
  "Asia/Hong_Kong": "hkt china",
  "Asia/Shanghai": "china cst beijing",
  "Asia/Tokyo": "japan jst",
  "Asia/Seoul": "korea kst",
  "Australia/Sydney": "aest aedt melbourne canberra",
  "Pacific/Auckland": "new zealand nzst nzdt wellington",
};

function offsetParts(
  timeZone: string,
  now: Date,
): { offset: string; minutes: number } {
  const raw =
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "longOffset" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? "GMT";
  const m = /GMT([+-])(\d{2}):(\d{2})/.exec(raw);
  if (!m) return { offset: "+00:00", minutes: 0 };
  const minutes = (Number(m[2]) * 60 + Number(m[3])) * (m[1] === "-" ? -1 : 1);
  return { offset: `${m[1]}${m[2]}:${m[3]}`, minutes };
}

function longName(timeZone: string, now: Date): string {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "long" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? ""
  );
}

function shortName(timeZone: string, now: Date): string {
  return (
    new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "short" })
      .formatToParts(now)
      .find((p) => p.type === "timeZoneName")?.value ?? ""
  );
}

function isKnownTimeZone(timeZone: string): boolean {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone });
    return true;
  } catch {
    return false;
  }
}

/** `extra` adds zones the runtime didn't list, such as a saved value, so they stay selectable. */
export function buildTimeZoneOptions(
  extra: string[] = [],
  now = new Date(),
): TimeZoneOption[] {
  const supported =
    typeof Intl.supportedValuesOf === "function"
      ? Intl.supportedValuesOf("timeZone")
      : Object.keys(KEYWORDS);
  const ids = Array.from(
    new Set([
      "UTC",
      ...supported.map((tz) => RENAMED[tz] ?? tz),
      ...extra.filter(isKnownTimeZone),
    ]),
  );

  return ids
    .map((value) => {
      const segments = value.split("/");
      const city =
        value === "UTC"
          ? "UTC"
          : (segments[segments.length - 1] ?? value).replace(/_/g, " ");
      const region =
        value === "UTC"
          ? "Coordinated Universal Time"
          : segments.slice(0, -1).join(" / ").replace(/_/g, " ");
      const { offset, minutes } = offsetParts(value, now);
      const name =
        value === "UTC" ? "Coordinated Universal Time" : longName(value, now);
      const sign = minutes < 0 ? "-" : "+";
      const abs = Math.abs(minutes);
      // "+5:30" and "+3" as well as the padded "+05:30", with or without a utc/gmt prefix.
      const short = `${sign}${Math.floor(abs / 60)}${abs % 60 ? `:${String(abs % 60).padStart(2, "0")}` : ""}`;
      const offsets = [offset, short].flatMap((o) => [o, `utc${o}`, `gmt${o}`]);
      const words = (parts: string[]) =>
        parts
          .join(" ")
          .toLowerCase()
          .split(/[\s/_()·,]+/)
          .filter(Boolean);
      const primaryWords = words([
        city,
        name,
        shortName(value, now),
        ...offsets,
        KEYWORDS[value] ?? "",
      ]);
      const searchWords = [...primaryWords, ...words([value, region])];
      return {
        value,
        city,
        region,
        longName: name,
        offset,
        offsetMinutes: minutes,
        primaryWords,
        searchWords,
      };
    })
    .sort(
      (a, b) =>
        a.offsetMinutes - b.offsetMinutes || a.city.localeCompare(b.city),
    );
}

export function formatTimeZoneLabel(o: TimeZoneOption): string {
  return `${o.city} (${o.longName} · UTC${o.offset})`;
}

interface TimeZoneComboboxProps {
  id: string;
  value: string;
  onChange: (value: string) => void;
  describedBy?: string;
}

export function TimeZoneCombobox({
  id,
  value,
  onChange,
  describedBy,
}: TimeZoneComboboxProps) {
  const base = useMemo(() => buildTimeZoneOptions(), []);
  // A saved zone the runtime doesn't list (an old alias, say) still needs a row to show as selected.
  const options = useMemo(
    () =>
      value && !base.some((o) => o.value === value)
        ? buildTimeZoneOptions([value])
        : base,
    [base, value],
  );
  const detected = useMemo(
    () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    [],
  );
  const listId = useId();
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const terms = q.split(/\s+/).filter(Boolean);
    if (terms.length === 0) return options;
    // Each term must start a word, so "est" finds Eastern but not Creston.
    const hits = (words: string[]) =>
      terms.every((t) => words.some((w) => w.startsWith(t)));
    const rank = (o: TimeZoneOption) =>
      o.city.toLowerCase().startsWith(q) ? 0 : hits(o.primaryWords) ? 1 : 2;
    return options
      .filter((o) => hits(o.searchWords))
      .map((o) => ({ o, r: rank(o) }))
      .sort((a, b) => a.r - b.r)
      .map(({ o }) => o);
  }, [options, query]);

  // Open on the current selection so the list doesn't start at UTC-12.
  const openList = () => {
    setQuery("");
    setActive(
      Math.max(
        0,
        options.findIndex((o) => o.value === value),
      ),
    );
    setOpen(true);
  };

  useEffect(() => {
    if (!open) return;
    listRef.current
      ?.querySelector<HTMLElement>(`[data-index="${active}"]`)
      ?.scrollIntoView({ block: "nearest" });
  }, [active, open, filtered]);

  const choose = (o: TimeZoneOption | undefined) => {
    if (!o) return;
    onChange(o.value);
    setOpen(false);
    setQuery("");
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    switch (e.key) {
      case "ArrowDown":
        e.preventDefault();
        if (!open) openList();
        else setActive((i) => Math.min(filtered.length - 1, i + 1));
        break;
      case "ArrowUp":
        e.preventDefault();
        if (open) setActive((i) => Math.max(0, i - 1));
        break;
      case "Enter":
        if (open) {
          e.preventDefault();
          choose(filtered[active]);
        }
        break;
      case "Escape":
        if (open) {
          e.preventDefault();
          setOpen(false);
          setQuery("");
        }
        break;
    }
  };

  const activeOption = open ? filtered[active] : undefined;

  return (
    <div className="relative">
      <input
        ref={inputRef}
        id={id}
        type="text"
        role="combobox"
        aria-expanded={open}
        aria-controls={listId}
        aria-autocomplete="list"
        aria-activedescendant={
          activeOption ? `${listId}-${activeOption.value}` : undefined
        }
        aria-describedby={describedBy}
        autoComplete="off"
        spellCheck={false}
        placeholder={
          open
            ? "Search city, country, or offset (e.g. Nairobi, EST, +5:30)"
            : undefined
        }
        value={open ? query : selected ? formatTimeZoneLabel(selected) : value}
        onFocus={openList}
        onClick={() => !open && openList()}
        onBlur={() => {
          setOpen(false);
          setQuery("");
        }}
        onChange={(e) => {
          setQuery(e.target.value);
          setActive(0);
          setOpen(true);
        }}
        onKeyDown={onKeyDown}
        className="h-10 w-full rounded-xl border border-line bg-surface pl-3 pr-9 text-sm text-ink outline-none placeholder:text-muted focus:border-primary focus:ring-1 focus:ring-primary"
      />
      <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-muted">
        <Icon d={open ? I.search : I.chevronDown} size={16} />
      </span>

      {open && (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="Time zones"
          className="absolute z-20 mt-1 max-h-72 w-full overflow-y-auto rounded-xl border border-line bg-surface p-1 shadow-dialog"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-sm text-muted">
              No time zones match “{query}”.
            </li>
          ) : (
            filtered.map((o, i) => (
              <li
                key={o.value}
                id={`${listId}-${o.value}`}
                data-index={i}
                role="option"
                aria-selected={o.value === value}
                // mousedown fires before the input's blur, so the click still lands.
                onMouseDown={(e) => {
                  e.preventDefault();
                  choose(o);
                }}
                onMouseMove={() => setActive(i)}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm ${
                  i === active ? "bg-primary-soft" : ""
                }`}
              >
                <span className="min-w-0">
                  <span className="flex items-center gap-2 font-medium text-ink">
                    {o.city}
                    {o.value === detected && (
                      <span className="rounded-full bg-subtle px-2 py-0.5 text-[11px] font-medium text-muted">
                        Your device
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted">
                    {o.longName}
                    {o.region && o.region !== o.longName
                      ? ` · ${o.region}`
                      : ""}
                  </span>
                </span>
                <span className="flex shrink-0 items-center gap-2 font-mono text-xs text-muted">
                  UTC{o.offset}
                  {o.value === value && <Icon d={I.check} size={14} />}
                </span>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
