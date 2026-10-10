import { useSyncExternalStore } from "react";

/**
 * Where the app bar stands and whether it shows, as in engenty-pro: picked in the bar's own
 * context menu, kept per browser like the theme and the language.
 */

export const APP_BAR_POSITIONS = ["left", "top", "right", "bottom"] as const;
export type AppBarPosition = (typeof APP_BAR_POSITIONS)[number];

export interface AppBarPrefs {
  position: AppBarPosition;
  /** Hidden: the bar leaves the page the whole window and comes out while the pointer rests at its edge. */
  hidden: boolean;
}

const KEY = "wizards.appbar";
const DEFAULT: AppBarPrefs = { position: "left", hidden: false };

const isPosition = (value: unknown): value is AppBarPosition =>
  APP_BAR_POSITIONS.includes(value as AppBarPosition);

function read(): AppBarPrefs {
  try {
    const stored = JSON.parse(localStorage.getItem(KEY) ?? "null") as Partial<AppBarPrefs> | null;
    return {
      position: isPosition(stored?.position) ? stored.position : DEFAULT.position,
      hidden: stored?.hidden === true,
    };
  } catch {
    return DEFAULT;
  }
}

let prefs = read();
const listeners = new Set<() => void>();

export function setAppBar(patch: Partial<AppBarPrefs>) {
  prefs = { ...prefs, ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(prefs));
  } catch {
    // the pick only lasts this page then
  }
  for (const listener of listeners) {
    listener();
  }
}

export function useAppBar(): AppBarPrefs {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => prefs,
  );
}

export const isHorizontal = (position: AppBarPosition): boolean =>
  position === "top" || position === "bottom";

/**
 * Where a menu of the bar opens: away from the bar's edge, toward the page. `anchor`: at the
 * bar's start (the space's tile) or its end (the person).
 */
export function besideBar(position: AppBarPosition, anchor: "start" | "end"): string {
  switch (position) {
    case "left":
      return anchor === "start" ? "top-0 left-full ml-3" : "bottom-0 left-full ml-3";
    case "right":
      return anchor === "start" ? "top-0 right-full mr-3" : "bottom-0 right-full mr-3";
    case "top":
      return anchor === "start" ? "top-full left-0 mt-3" : "top-full right-0 mt-3";
    case "bottom":
      return anchor === "start" ? "bottom-full left-0 mb-3" : "bottom-full right-0 mb-3";
  }
}
