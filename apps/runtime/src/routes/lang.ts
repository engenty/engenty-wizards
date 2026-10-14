import type { Context } from "hono";

/**
 * The language a visitor's request asks for: what the runner around it speaks, the browser's
 * first language (apps/web: `navigator.language`) — German for "de…", else English; English
 * without one, as the runner starts.
 */
export function requestLang(c: Context): "de" | "en" {
  const asked = c.req.header("accept-language")?.trim().toLowerCase();
  return asked?.startsWith("de") ? "de" : "en";
}

/** A line the person reads, in the language their request asks for. */
export function inLang(c: Context, de: string, en: string): string {
  return requestLang(c) === "de" ? de : en;
}
