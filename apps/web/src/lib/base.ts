/**
 * The path the app is served under: `/w` on https://engenty.ai/w, empty at an origin's root.
 * Vite writes it into BASE_URL at build time (APP_BASE_PATH).
 */
export const BASE = import.meta.env.BASE_URL.replace(/\/+$/, "");

/** A root-relative address (`/api/...`, `/r/...`) as the browser must request it. */
export function withBase(path: string): string {
  if (!BASE || !path.startsWith("/") || path.startsWith("//")) {
    return path;
  }
  return path === BASE || path.startsWith(`${BASE}/`) ? path : `${BASE}${path}`;
}
