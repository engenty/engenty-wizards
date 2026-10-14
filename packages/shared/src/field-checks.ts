// SPDX-License-Identifier: FSL-1.1-MIT OR MIT
import { type Field, isAudioValue, isLocationValue } from "./definition.js";
import { bilingual, type RunNote, saidText } from "./run.js";

/**
 * The checks of a page's answers, the same in the page's form, the chat and the runtime: what is
 * missing, a number that is none, an address that cannot be one. The runtime has the last word;
 * the views say it before the page goes there. A problem is a code with its numbers, so every
 * view can word it in the person's language.
 */

export type FieldCode =
  | "required"
  | "number"
  | "email"
  | "url"
  | "date"
  | "dateMin"
  | "dateMax"
  | "filesMin"
  | "filesMax"
  | "select"
  | "slot"
  | "unavailable"
  | "fileMissing"
  | "connect";

export interface FieldProblem {
  code: FieldCode;
  /** The numbers the wording needs: `{ min: 2 }`, `{ max: "2026-12-31" }`. */
  params?: Record<string, string | number>;
}

/** A problem as a response carries it: the field, the code, and its text in the reader's language. */
export interface FieldError extends FieldProblem {
  field: string;
  message: string;
}

/** A problem as the runtime keeps it until it answers: the text in both languages. */
export interface FieldRefusal extends FieldProblem {
  field: string;
  message: RunNote;
}

/** What the runtime says beside the code, for readers that show only `message`. */
const MESSAGES: Record<FieldCode, { de: string; en: string }> = {
  required: { de: "Pflichtfeld", en: "Required" },
  number: { de: "Bitte eine Zahl eingeben", en: "Please enter a number" },
  email: { de: "Keine gültige E-Mail-Adresse", en: "Not a valid email address" },
  url: { de: "Keine gültige URL", en: "Not a valid URL" },
  date: { de: "Kein gültiges Datum", en: "Not a valid date" },
  dateMin: { de: "Frühestens {min}", en: "{min} at the earliest" },
  dateMax: { de: "Spätestens {max}", en: "{max} at the latest" },
  filesMin: { de: "Bitte mindestens {min} auswählen", en: "Please choose at least {min}" },
  filesMax: {
    de: "Höchstens {max} – bitte einige entfernen",
    en: "At most {max} – please remove some",
  },
  select: { de: "Ungültige Auswahl", en: "Invalid choice" },
  slot: { de: "Dieser Termin wird nicht angeboten", en: "This time is not offered" },
  unavailable: {
    de: "Das ist hier gerade nicht verfügbar.",
    en: "That is not available here right now.",
  },
  fileMissing: { de: "Datei nicht gefunden", en: "File not found" },
  connect: { de: "Bitte zuerst verbinden", en: "Please connect first" },
};

export function fieldError(field: string, problem: FieldProblem): FieldRefusal {
  const fill = (text: string) =>
    Object.entries(problem.params ?? {}).reduce(
      (t, [k, v]) => t.replace(`{${k}}`, String(v)),
      text,
    );
  const { de, en } = MESSAGES[problem.code];
  return { field, ...problem, message: bilingual(fill(de), fill(en)) };
}

/** The problems in a language, for whoever reads them. */
export function fieldErrorsIn(errors: FieldRefusal[], lang: "de" | "en"): FieldError[] {
  return errors.map((e) => ({ ...e, message: saidText(e.message, lang) }));
}

const SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/** A link as it is kept: one typed without its scheme (`orf.at`) gets `https://`. */
export function normalizeUrl(raw: string): string {
  const s = raw.trim();
  // `//orf.at` (scheme-relative) takes the scheme alone, not a second pair of slashes.
  return s && !SCHEME.test(s) ? `https://${s.replace(/^\/\//, "")}` : s;
}

/** Schemes that name no host but are links all the same. */
const OPAQUE = new Set(["mailto:", "tel:"]);
/** Schemes that run or carry content instead of pointing somewhere. */
const UNSAFE = new Set(["javascript:", "data:", "vbscript:"]);

/**
 * Whether a link can be opened. A web address needs a host with a dot (or `localhost`); another
 * scheme a host of any kind (`ftp://…`), or none for `mailto:` and `tel:`. Spaces are never
 * part of one, and neither is script.
 */
export function isUrl(raw: string): boolean {
  const s = normalizeUrl(raw);
  if (!s || /\s/.test(s)) {
    return false;
  }
  try {
    const url = new URL(s);
    if (url.protocol === "http:" || url.protocol === "https:") {
      const host = url.hostname;
      return host === "localhost" || host.startsWith("[") || /^[^.]+(\.[^.]+)+\.?$/.test(host);
    }
    return !UNSAFE.has(url.protocol) && (OPAQUE.has(url.protocol) || url.host !== "");
  } catch {
    return false;
  }
}

export function isEmail(raw: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(raw.trim());
}

/** A typed number, with a comma as the decimal mark too; NaN for one that is none, undefined for none at all. */
export function parseNumber(raw: unknown): number | undefined {
  if (typeof raw === "number") {
    return raw;
  }
  const s = String(raw ?? "").trim();
  if (!s) {
    return undefined;
  }
  const n = Number(s.replace(",", "."));
  return Number.isFinite(n) ? n : Number.NaN;
}

/** The earliest and latest day a date field takes, both YYYY-MM-DD and inclusive. */
export interface DateBounds {
  min?: string;
  max?: string;
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * A day as it is kept (YYYY-MM-DD) from the unambiguous forms an API caller, an AI or a voice
 * may send instead: an ISO date with a time (`2026-10-14T10:00:00Z` → its day as written) and
 * the German `14.10.2026`. Anything else comes back trimmed, for the check to turn down.
 */
export function normalizeDate(raw: string): string {
  const s = raw.trim();
  const iso = /^(\d{4}-\d{2}-\d{2})[T ]\d{2}:\d{2}/.exec(s);
  if (iso) {
    return iso[1];
  }
  const de = /^(\d{1,2})\.\s?(\d{1,2})\.\s?(\d{4})$/.exec(s);
  return de ? `${de[3]}-${de[2].padStart(2, "0")}-${de[1].padStart(2, "0")}` : s;
}

function isDay(s: string): boolean {
  const m = DAY.exec(s);
  if (!m) {
    return false;
  }
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return d.toISOString().slice(0, 10) === s;
}

/** A day as the date field gives it (YYYY-MM-DD), within its bounds when it has them. */
export function checkDate(raw: string, bounds: DateBounds = {}): FieldProblem | null {
  const s = raw.trim();
  if (!isDay(s)) {
    return { code: "date" };
  }
  if (bounds.min && isDay(bounds.min) && s < bounds.min) {
    return { code: "dateMin", params: { min: bounds.min } };
  }
  if (bounds.max && isDay(bounds.max) && s > bounds.max) {
    return { code: "dateMax", params: { max: bounds.max } };
  }
  return null;
}

/** Fields that are never asked for an answer: a switch is always one, the others live elsewhere. */
function free(field: Field): boolean {
  return field.kind === "toggle" || field.kind === "connection" || field.kind === "list";
}

/** Whether a field has no answer yet, as typed in a form or as the runtime keeps it. */
export function isBlank(field: Field, v: unknown): boolean {
  if (v === undefined || v === null) {
    return true;
  }
  if (typeof v === "string") {
    return v.trim() === "";
  }
  if (Array.isArray(v)) {
    if (field.kind !== "items") {
      return v.length === 0;
    }
    // A line counts once it holds a text or a number other than zero, as the runtime keeps it.
    const cols = field.columns ?? [];
    return !v.some(
      (row) =>
        row &&
        typeof row === "object" &&
        cols.some((c) => {
          const cell = (row as Record<string, unknown>)[c.id];
          if (c.kind === "text") {
            return String(cell ?? "").trim() !== "";
          }
          const n = parseNumber(cell);
          return n !== undefined && Number.isFinite(n) && n !== 0;
        }),
    );
  }
  if (field.kind === "location") {
    return !isLocationValue(v);
  }
  if (field.kind === "audio") {
    return !isAudioValue(v);
  }
  return false;
}

/**
 * What is wrong with one answer, or null: required, number, e-mail, link and date. Takes the
 * value as typed or as the runtime has read it. Choices, files and connections the runtime
 * checks on its own, against what only it knows.
 */
export function checkAnswer(
  field: Field,
  value: unknown,
  options: { date?: DateBounds } = {},
): FieldProblem | null {
  if (free(field)) {
    return null;
  }
  if (isBlank(field, value)) {
    return field.required ? { code: "required" } : null;
  }
  switch (field.kind) {
    case "number": {
      const n = parseNumber(value);
      return n === undefined || Number.isFinite(n) ? null : { code: "number" };
    }
    case "email":
      return isEmail(String(value)) ? null : { code: "email" };
    case "url":
      return isUrl(String(value)) ? null : { code: "url" };
    case "date":
      return checkDate(String(value), options.date);
    default:
      return null;
  }
}
