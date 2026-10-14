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

/** A 404 the person may read: a sentence in their language, the machine code beside it. */
export function notFoundAnswer(c: Context): { error: string; code: "not_found" } {
  return {
    error: inLang(c, "Das gibt es nicht oder nicht mehr.", "This doesn’t exist or was deleted."),
    code: "not_found",
  };
}
