import { useEffect, useSyncExternalStore } from "react";
import { ENGENTY_FILL, ENGENTY_KIND_FILL, type EngentyKind } from "../engenty/colors";

export type Theme = "light" | "dark";

const KEY = "wizards.theme";
const listeners = new Set<() => void>();
const system = window.matchMedia("(prefers-color-scheme: dark)");

function stored(): Theme | null {
  try {
    const value = localStorage.getItem(KEY);
    return value === "light" || value === "dark" ? value : null;
  } catch {
    return null;
  }
}

/** The visitor's pick, else the OS setting. */
function current(): Theme {
  return stored() ?? (system.matches ? "dark" : "light");
}

/**
 * The browser's toolbar — and the status bar of a wizard on the home screen — takes the page's
 * colour: paper in light, the wizard's stage in dark.
 */
export function syncThemeColor() {
  requestAnimationFrame(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    const ctx = document.createElement("canvas").getContext("2d");
    if (!meta || !ctx || !document.body) {
      return;
    }
    // The page colour is oklch; a canvas pixel turns it into the hex a meta tag takes.
    ctx.fillStyle = getComputedStyle(document.body).backgroundColor;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    meta.content = `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
  });
}

function apply() {
  const dark = current() === "dark";
  document.documentElement.classList.toggle("dark", dark);
  syncThemeColor();
  for (const listener of listeners) {
    listener();
  }
}

system.addEventListener("change", apply);
apply();

export function setTheme(theme: Theme) {
  try {
    localStorage.setItem(KEY, theme);
  } catch {
    // the pick only lasts this page then
    document.documentElement.classList.toggle("dark", theme === "dark");
    return;
  }
  apply();
}

export function useTheme(): Theme {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
  );
}

/**
 * Deep fill in an engenty's own hue: the dark theme's page, and the stage a
 * jelly stands on in light. The gel is see-through, so it only reads against
 * an intense, dark colour like this.
 */
export const stageFill = (kind: EngentyKind) =>
  `oklch(from ${ENGENTY_FILL[ENGENTY_KIND_FILL[kind] ?? "cobalt"]} 0.34 calc(c * 0.6) h)`;

/**
 * Dark pages take the colour of the wizard's engenty. Set on the root, like
 * the brand accent, because every surface token derives from `--stage` there.
 */
export function useStage(kind: string | null | undefined) {
  useEffect(() => {
    if (!kind) {
      return;
    }
    const root = document.documentElement;
    root.style.setProperty("--stage", stageFill(kind as EngentyKind));
    syncThemeColor();
    return () => {
      root.style.removeProperty("--stage");
      syncThemeColor();
    };
  }, [kind]);
}
