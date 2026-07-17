"use client";

import { useEffect, useState } from "react";

/*
  ThemeToggle — flips the whole app between dark and light.
  It writes `data-cw-theme` on <html> and persists the choice in localStorage under
  the same key the no-flash init script (in layout.tsx) reads on load, so the choice
  survives a refresh. Starts from whatever the init script already applied.
*/

type Theme = "dark" | "light";
const STORAGE_KEY = "cw-theme";

export function ThemeToggle({ className = "" }: { className?: string }) {
  const [theme, setTheme] = useState<Theme>("dark");

  // Read the theme the init script already stamped on <html> so the button label
  // matches the current palette on first render.
  useEffect(() => {
    const current =
      (document.documentElement.getAttribute("data-cw-theme") as Theme) ||
      "dark";
    setTheme(current);
  }, []);

  function toggle() {
    const next: Theme = theme === "dark" ? "light" : "dark";
    setTheme(next);
    document.documentElement.setAttribute("data-cw-theme", next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* localStorage unavailable (private mode) — theme still applies for this session */
    }
  }

  return (
    <button
      onClick={toggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className={`inline-flex items-center gap-2 rounded-full border border-line-strong bg-card px-4 py-2 text-xs font-semibold text-ink transition-colors hover:border-bronze ${className}`}
    >
      {theme === "dark" ? "☀ Light" : "☾ Dark"}
    </button>
  );
}
