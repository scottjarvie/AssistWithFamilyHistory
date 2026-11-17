"use client";

import { createContext, useContext, useSyncExternalStore } from "react";

type Theme = "light" | "dark";
const STORAGE_KEY = "family-history-home-theme";
const CHANGE_EVENT = "family-history-home-theme-change";
const ThemeContext = createContext<Theme>("light");
let fallbackChoice: Theme | undefined;

function readTheme(): Theme {
  if (fallbackChoice) return fallbackChoice;
  try {
    // Preserve a visitor's earlier home preference without applying it site-wide.
    const saved =
      localStorage.getItem(STORAGE_KEY) ?? localStorage.getItem("theme");
    if (saved === "light" || saved === "dark") return saved;
  } catch {
    // Storage may be disabled; the switch still works for this visit.
  }
  return matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function subscribe(notify: () => void) {
  const media = matchMedia("(prefers-color-scheme: dark)");
  window.addEventListener("storage", notify);
  window.addEventListener(CHANGE_EVENT, notify);
  media.addEventListener("change", notify);
  return () => {
    window.removeEventListener("storage", notify);
    window.removeEventListener(CHANGE_EVENT, notify);
    media.removeEventListener("change", notify);
  };
}

function chooseTheme(theme: Theme) {
  try {
    localStorage.setItem(STORAGE_KEY, theme);
    fallbackChoice = undefined;
  } catch {
    fallbackChoice = theme;
    // Keep the in-memory choice if persistence is unavailable.
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function HomeTheme({ children }: { children: React.ReactNode }) {
  const theme = useSyncExternalStore(
    subscribe,
    readTheme,
    () => "light" as Theme,
  );
  return (
    <ThemeContext.Provider value={theme}>
      <div className={`fh-home ${theme}`}>{children}</div>
    </ThemeContext.Provider>
  );
}

export function useHomeTheme() {
  return useContext(ThemeContext);
}

export function ThemeSwitch() {
  const theme = useHomeTheme();
  return (
    <button
      className="fh-theme"
      onClick={() => chooseTheme(theme === "dark" ? "light" : "dark")}
      aria-label="Switch colour theme"
    >
      Light / Dark
    </button>
  );
}
