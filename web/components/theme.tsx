"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { Icon, I } from "./icons";

type Theme = "light" | "dark";

const ThemeCtx = createContext<{ theme: Theme; setTheme: (t: Theme) => void; toggle: () => void }>({
  theme: "light",
  setTheme: () => {},
  toggle: () => {},
});

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>("light");

  // The boot script in <head> already applied the right theme; sync React state to it.
  useEffect(() => {
    const t = document.documentElement.getAttribute("data-theme");
    if (t === "dark" || t === "light") setThemeState(t);
  }, []);

  const setTheme = useCallback((t: Theme) => {
    document.documentElement.setAttribute("data-theme", t);
    try {
      localStorage.setItem("theme", t);
    } catch {}
    setThemeState(t);
  }, []);

  const toggle = useCallback(() => setTheme(theme === "dark" ? "light" : "dark"), [theme, setTheme]);

  return <ThemeCtx.Provider value={{ theme, setTheme, toggle }}>{children}</ThemeCtx.Provider>;
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
