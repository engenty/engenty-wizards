/**
 * The path the app is served under: `/wizards` on https://example.com/wizards, empty at an origin's root.
 * Vite writes it in at build time (APP_BASE_PATH).
 */
export const BASE = String(import.meta.env.VITE_APP_BASE ?? "").replace(/\/+$/, "");

/**
 * The studio: its pages, and once built the app's own files (scripts, icons, labels). The root of
 * the host belongs to others (a landing page); public wizards stay at `/w/<token>`.
 */
export const STUDIO = `${BASE}/studio`;

/** A root-relative address (`/api/...`, `/w/...`) as the browser must request it. */
export function withBase(path: string): string {
  if (!BASE || !path.startsWith("/") || path.startsWith("//")) {
    return path;
  }
  return path === BASE || path.startsWith(`${BASE}/`) ? path : `${BASE}${path}`;
}

/** A file of the app's public folder (`icons/…`, `ai-labels/…`) as the browser must request it. */
export function asset(path: string): string {
  return `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;
}
