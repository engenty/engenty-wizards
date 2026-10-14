import { type Lang, localLang } from "@engenty-wizards/shared/definition";
import type { Context } from "hono";

/**
 * The language a visitor's request asks for, as the studio starts in it (`localLang`): the
 * first of the browser's languages engenty speaks other than English, else English. The
 * browser's `Accept-Language` names them in its order; the server has no time zone to go by.
 */
export function requestLang(c: Context): Lang {
  const asked = (c.req.header("accept-language") ?? "")
    .split(",")
    .map((part) => part.split(";")[0]?.trim() ?? "")
    .filter(Boolean);
  return localLang(asked) ?? "en";
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
