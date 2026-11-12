import { useSyncExternalStore } from "react";

// App themes. Each one is a set of CSS variables in styles/themes/<id>.css,
// switched at runtime with <html data-theme="…">. "system" follows the
// computer's light/dark setting. The choice is saved in this browser, and
// index.html applies it before the first paint (no flash of the wrong theme).

export type ThemeId = "sky" | "slate" | "sage" | "graphite" | "rust" | "indigo" | "dark";
export type ThemePref = ThemeId | "system";

export type ThemeInfo = {
  id: ThemeId;
  label: string;
  dark: boolean;
  // For the preview cards and the browser/desktop window chrome.
  swatch: { bg: string; surface: string; sidebar: string; accent: string; text: string };
};

export const THEMES: ThemeInfo[] = [
  { id: "sky", label: "Sky", dark: false, swatch: { bg: "#f5f8fb", surface: "#ffffff", sidebar: "#ffffff", accent: "#59a5d8", text: "#14202b" } },
  // Sober, muted themes.
  { id: "slate", label: "Slate", dark: false, swatch: { bg: "#f6f7f9", surface: "#ffffff", sidebar: "#ffffff", accent: "#475569", text: "#1e2430" } },
  { id: "sage", label: "Sage", dark: false, swatch: { bg: "#f6f7f5", surface: "#ffffff", sidebar: "#ffffff", accent: "#4d6b57", text: "#1f2621" } },
  { id: "graphite", label: "Graphite", dark: false, swatch: { bg: "#f7f7f7", surface: "#ffffff", sidebar: "#ffffff", accent: "#3f3f46", text: "#18181b" } },
  { id: "rust", label: "Rust", dark: false, swatch: { bg: "#faf6f3", surface: "#ffffff", sidebar: "#ffffff", accent: "#b7410e", text: "#2a1d17" } },
  { id: "indigo", label: "Indigo", dark: false, swatch: { bg: "#f7f7f8", surface: "#ffffff", sidebar: "#f7f7f8", accent: "#4f46e5", text: "#18181b" } },
  { id: "dark", label: "Dark", dark: true, swatch: { bg: "#111418", surface: "#1a1e24", sidebar: "#15191e", accent: "#6cb6e6", text: "#e6e9ed" } },
];

// Must match the inline script in index.html.
export const THEME_STORAGE_KEY = "owl_theme";
export const DEFAULT_THEME: ThemeId = "sky";
const LIGHT_FOR_SYSTEM: ThemeId = "sky";

const isThemeId = (v: unknown): v is ThemeId => THEMES.some((t) => t.id === v);
const isPref = (v: unknown): v is ThemePref => v === "system" || isThemeId(v);

const darkQuery = () => (typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null);

export function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_STORAGE_KEY);
    return isPref(v) ? v : DEFAULT_THEME;
  } catch {
    return DEFAULT_THEME;
  }
}

export function resolveTheme(pref: ThemePref): ThemeId {
  if (pref !== "system") return pref;
  return darkQuery()?.matches ? "dark" : LIGHT_FOR_SYSTEM;
}

export const themeInfo = (id: ThemeId) => THEMES.find((t) => t.id === id) ?? THEMES[0];

type DesktopTheme = { setTheme?: (t: { id: ThemeId; dark: boolean; background: string }) => void };

function apply(pref: ThemePref) {
  const id = resolveTheme(pref);
  const info = themeInfo(id);
  const root = document.documentElement;
  root.dataset.theme = id;
  root.style.colorScheme = info.dark ? "dark" : "light";
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", info.dark ? info.swatch.bg : "#2a74a8");
  // The desktop app matches its window background and title bar.
  try {
    (window as unknown as { owlDesktop?: DesktopTheme }).owlDesktop?.setTheme?.({ id, dark: info.dark, background: info.swatch.bg });
  } catch { /* older desktop app */ }
}

// ── store ──
let current: ThemePref = typeof window !== "undefined" ? readPref() : DEFAULT_THEME;
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export function setThemePref(pref: ThemePref) {
  current = pref;
  try { localStorage.setItem(THEME_STORAGE_KEY, pref); } catch { /* storage blocked: still applies for this visit */ }
  apply(pref);
  emit();
}

// Call once at startup: re-applies (index.html already did) and keeps
// "system" in step with the OS, and other tabs in step with this one.
export function initTheme() {
  apply(current);
  darkQuery()?.addEventListener("change", () => {
    if (current === "system") { apply(current); emit(); }
  });
  window.addEventListener("storage", (e) => {
    if (e.key !== THEME_STORAGE_KEY) return;
    current = readPref();
    apply(current);
    emit();
  });
}

const subscribe = (l: () => void) => { listeners.add(l); return () => { listeners.delete(l); }; };
// "pref|resolved", so an OS light/dark change re-renders even though the
// preference ("system") itself didn't change.
const snapshot = () => `${current}|${resolveTheme(current)}`;

export function useTheme(): { pref: ThemePref; theme: ThemeId; dark: boolean; setPref: (p: ThemePref) => void } {
  const [pref, theme] = useSyncExternalStore(subscribe, snapshot, () => `${DEFAULT_THEME}|${DEFAULT_THEME}`).split("|") as [ThemePref, ThemeId];
  return { pref, theme, dark: themeInfo(theme).dark, setPref: setThemePref };
}
