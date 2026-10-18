"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Icon, I } from "./icons";

export type Theme = "light" | "dark";
export type ThemePreference = "light" | "dark" | "system";

export interface ThemeContextType {
  theme: Theme;
  themePreference: ThemePreference;
  setTheme: (t: Theme) => void;
  setThemePreference: (p: ThemePreference) => void;
  toggle: () => void;
}

const ThemeCtx = createContext<ThemeContextType>({
  theme: "light",
  themePreference: "system",
  setTheme: () => {},
  setThemePreference: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");
  const [themePreference, setThemePrefState] = useState<ThemePreference>("system");

  // Read saved preference or sync with system
  useEffect(() => {
    let pref: ThemePreference = "system";
    try {
      const savedPref = localStorage.getItem("theme_preference") as ThemePreference | null;
      if (savedPref === "light" || savedPref === "dark" || savedPref === "system") {
        pref = savedPref;
      } else {
        const legacy = localStorage.getItem("theme");
        if (legacy === "light" || legacy === "dark") {
          pref = legacy;
        }
      }
    } catch {}

    setThemePrefState(pref);

    const applyTheme = (resolved: Theme) => {
      document.documentElement.setAttribute("data-theme", resolved);
      setThemeState(resolved);
    };

    if (pref === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      applyTheme(mq.matches ? "dark" : "light");

      const handler = (e: MediaQueryListEvent) => {
        applyTheme(e.matches ? "dark" : "light");
      };
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    } else {
      applyTheme(pref);
    }
  }, [themePreference]);

  const setThemePreference = useCallback((p: ThemePreference) => {
    setThemePrefState(p);
    try {
      localStorage.setItem("theme_preference", p);
      if (p === "system") {
        localStorage.removeItem("theme");
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        document.documentElement.setAttribute("data-theme", isDark ? "dark" : "light");
        setThemeState(isDark ? "dark" : "light");
      } else {
        localStorage.setItem("theme", p);
        document.documentElement.setAttribute("data-theme", p);
        setThemeState(p);
      }
    } catch {}
  }, []);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemePreference(t);
    },
    [setThemePreference]
  );

  const toggle = useCallback(() => {
    setThemePreference(theme === "dark" ? "light" : "dark");
  }, [theme, setThemePreference]);

  return (
    <ThemeCtx.Provider value={{ theme, themePreference, setTheme, setThemePreference, toggle }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export const useTheme = () => useContext(ThemeCtx);

/** Pill text button used on the marketing header ("Dark" / "Light"). */
export function ThemeTextToggle({ className = "" }: { className?: string }) {
  const { theme, toggle } = useTheme();
  const dark = theme === "dark";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      className={`ease-ui h-9 rounded-full border border-line bg-surface px-2.5 text-[13px] text-muted hover:text-ink ${className}`}
    >
      {dark ? "Light" : "Dark"}
    </button>
  );
}

/** Round icon button used in the app top bar. */
export function ThemeIconToggle() {
  const { theme, toggle } = useTheme();
  const label = theme === "dark" ? "Switch to light theme" : "Switch to dark theme";
  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={label}
      title={label}
      className="ease-ui grid size-9 shrink-0 place-items-center rounded-full border border-line bg-surface text-ink hover:bg-subtle"
    >
      <Icon d={theme === "dark" ? I.sun : I.moon} size={18} />
    </button>
  );
}

/** Light / Dark segmented radio group (Foundations header). */
export function ThemeRadio() {
  const { theme, setTheme } = useTheme();
  return (
    <div role="radiogroup" aria-label="Theme" className="inline-flex overflow-hidden rounded-full border border-line-strong">
      {(["light", "dark"] as const).map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          aria-checked={theme === t}
          onClick={() => setTheme(t)}
          className={`ease-ui h-8 px-3.5 text-sm font-semibold ${
            theme === t ? "bg-primary text-on-primary" : "bg-surface text-ink hover:bg-subtle"
          }`}
        >
          {t === "light" ? "Light" : "Dark"}
        </button>
      ))}
    </div>
  );
}

/** Light / Dark / System segmented radio group (S-48 Account settings). */
export function ThemePreferenceRadio({ className = "" }: { className?: string }) {
  const { themePreference, setThemePreference } = useTheme();
  const options: { id: ThemePreference; label: string; icon: string }[] = [
    { id: "system", label: "System", icon: I.monitor },
    { id: "light", label: "Light", icon: I.sun },
    { id: "dark", label: "Dark", icon: I.moon },
  ];

  return (
    <div
      role="radiogroup"
      aria-label="Theme appearance"
      className={`inline-flex rounded-full border border-line bg-surface p-1 ${className}`}
    >
      {options.map((opt) => (
        <button
          key={opt.id}
          type="button"
          role="radio"
          aria-checked={themePreference === opt.id}
          onClick={() => setThemePreference(opt.id)}
          className={`ease-ui flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold ${
            themePreference === opt.id
              ? "bg-primary text-on-primary shadow-xs"
              : "text-muted hover:text-ink"
          }`}
        >
          <Icon d={opt.icon} size={14} />
          <span>{opt.label}</span>
        </button>
      ))}
    </div>
  );
}
