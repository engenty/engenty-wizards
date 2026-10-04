/** How many projects a tenant can hold. */
export const MAX_PROJECTS = 5;

// --- facts ---------------------------------------------------------------------
// What a project knows about itself as label and value: an address, a VAT id, anything. Every
// step of the project's wizards can read them.

export const FACT_TYPES = [
  "text",
  "longtext",
  "number",
  "date",
  "url",
  "email",
  "phone",
  "boolean",
] as const;
export type FactType = (typeof FACT_TYPES)[number];

export interface ProjectFact {
  /** How templates name it: `{{facts.<key>}}`. Made from the label, stable afterwards. */
  key: string;
  label: string;
  value: string;
  /** Only when chosen by hand; otherwise the type is read off the value. */
  type?: FactType;
}

const DATE_RE = /^(\d{4}-\d{2}-\d{2}|\d{1,2}\.\s?\d{1,2}\.\s?\d{4})$/;
const NUMBER_RE = /^[+-]?\d{1,3}([.,\s']?\d{3})*([.,]\d+)?$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const URL_RE = /^(https?:\/\/|www\.)\S+$/i;
const PHONE_RE = /^\+?[\d\s()/.-]{7,20}$/;
const BOOLEAN_RE = /^(ja|nein|yes|no|true|false)$/i;

/** The type a value looks like. A value that looks like nothing in particular is text. */
export function detectFactType(value: string): FactType {
  const v = value.trim();
  if (!v) {
    return "text";
  }
  if (v.includes("\n") || v.length > 140) {
    return "longtext";
  }
  if (BOOLEAN_RE.test(v)) {
    return "boolean";
  }
  if (EMAIL_RE.test(v)) {
    return "email";
  }
  if (URL_RE.test(v)) {
    return "url";
  }
  if (DATE_RE.test(v)) {
    return "date";
  }
  // A postcode or a count is a number; a phone number starts with + or 0 and is longer.
  if (NUMBER_RE.test(v) && !/^(\+|0\d)/.test(v)) {
    return "number";
  }
  if (PHONE_RE.test(v) && v.replace(/\D/g, "").length >= 7) {
    return "phone";
  }
  return "text";
}

export function factType(fact: Pick<ProjectFact, "value" | "type">): FactType {
  return fact.type ?? detectFactType(fact.value);
}

/** A fact's key from its label: lower case, a-z 0-9 and _, unique among `taken`. */
export function factKey(label: string, taken: string[] = []): string {
  const base =
    label
      .toLowerCase()
      .replace(/ä/g, "ae")
      .replace(/ö/g, "oe")
      .replace(/ü/g, "ue")
      .replace(/ß/g, "ss")
      .normalize("NFD")
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "fakt";
  let key = base;
  for (let i = 2; taken.includes(key); i++) {
    key = `${base}_${i}`;
  }
  return key;
}

/** Facts most projects have; offered as empty rows to fill in. */
export const BASIC_FACTS: { key: string; de: string; en: string }[] = [
  { key: "adresse", de: "Adresse", en: "Address" },
  { key: "plz", de: "PLZ", en: "Postcode" },
  { key: "ort", de: "Ort", en: "City" },
  { key: "uid", de: "UID", en: "VAT id" },
  { key: "telefon", de: "Telefon", en: "Phone" },
  { key: "e_mail", de: "E-Mail", en: "Email" },
  { key: "website", de: "Website", en: "Website" },
  { key: "iban", de: "IBAN", en: "IBAN" },
];

// --- brand -----------------------------------------------------------------------

export interface BrandColor {
  /** What the colour is for, in the admin's words: "Primär", "Hintergrund", "Akzent Herbst". */
  name: string;
  /** #rrggbb */
  value: string;
}

// --- files -----------------------------------------------------------------------

export const PROJECT_FILE_KINDS = ["logo", "asset", "document"] as const;
export type ProjectFileKind = (typeof PROJECT_FILE_KINDS)[number];

/** `pending`: being read, described and indexed. */
export type ProjectFileStatus = "pending" | "ready" | "failed";

export interface ProjectFileView {
  id: string;
  kind: ProjectFileKind;
  name: string;
  mime: string;
  size: number;
  description: string;
  /** A web address the file was fetched from, when it was not uploaded. */
  source: string | null;
  status: ProjectFileStatus;
  error: string | null;
  /** Documents: what the index holds of it. `embeddings` includes the keywords. */
  indexed: "embeddings" | "keywords" | null;
  pages: number | null;
  chars: number | null;
  createdAt: string;
}

export const PROJECT_LIMITS = {
  facts: 100,
  colors: 12,
  files: { logo: 8, asset: 100, document: 50 },
  bytes: { logo: 5_000_000, asset: 15_000_000, video: 80_000_000, document: 30_000_000 },
} as const;

/** The largest file of a kind and type a project takes. */
export function projectFileLimit(kind: ProjectFileKind, mime: string): number {
  if (kind === "asset" && mime.startsWith("video/")) {
    return PROJECT_LIMITS.bytes.video;
  }
  return PROJECT_LIMITS.bytes[kind];
}

/** One passage the document index found for a question. */
export interface ProjectSearchHit {
  fileId: string;
  name: string;
  /** The passage's place in its document, from 0. */
  index: number;
  text: string;
  score: number;
}
