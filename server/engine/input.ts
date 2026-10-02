import type { Field, PageStep } from "../../shared/definition.js";

export interface InputError {
  field: string;
  message: string;
}

function empty(v: unknown): boolean {
  return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
}

function coerce(field: Field, raw: unknown): unknown {
  if (raw === undefined || raw === null) {
    return undefined;
  }
  switch (field.kind) {
    case "number": {
      if (raw === "") {
        return undefined;
      }
      const n = Number(String(raw).replace(",", "."));
      return Number.isFinite(n) ? n : Number.NaN;
    }
    case "toggle":
      return raw === true || raw === "true" || raw === "on";
    case "multiselect":
      return (Array.isArray(raw) ? raw : [raw])
        .map(String)
        .filter((v) => field.options?.includes(v));
    case "image":
    case "file": {
      const ids = (Array.isArray(raw) ? raw : [raw])
        .filter((v): v is string => typeof v === "string" && v.length > 0)
        .slice(0, 20);
      if (!ids.length) {
        return undefined;
      }
      return field.multiple ? ids : ids[0];
    }
    // The account and the list live in the wizard's store, not in the page's answers.
    case "connection":
    case "list":
      return undefined;
    case "items": {
      if (!Array.isArray(raw)) {
        return [];
      }
      const cols = field.columns ?? [];
      return raw
        .filter((r) => r && typeof r === "object")
        .map((r) =>
          Object.fromEntries(
            cols.map((c) => {
              const v = (r as Record<string, unknown>)[c.id];
              if (c.kind === "text") {
                return [c.id, String(v ?? "").slice(0, 2000)];
              }
              const n = Number(String(v ?? "").replace(",", "."));
              return [c.id, Number.isFinite(n) ? n : 0];
            }),
          ),
        )
        .filter((r) => Object.values(r).some((v) => v !== "" && v !== 0))
        .slice(0, 200);
    }
    default:
      return String(raw).slice(0, 20_000);
  }
}

/** Keep only this page's fields, typed; report what is missing or wrong. */
export function readPageInput(
  step: PageStep,
  input: Record<string, unknown>,
): { values: Record<string, unknown>; errors: InputError[] } {
  const values: Record<string, unknown> = {};
  const errors: InputError[] = [];
  for (const field of step.fields) {
    const v = coerce(field, input[field.id]);
    if (field.kind === "connection" || field.kind === "list") {
      continue;
    }
    if (field.required && empty(v) && field.kind !== "toggle") {
      errors.push({ field: field.id, message: "Pflichtfeld" });
      continue;
    }
    if (field.kind === "number" && Number.isNaN(v)) {
      errors.push({ field: field.id, message: "Bitte eine Zahl eingeben" });
      continue;
    }
    if (field.kind === "select" && !empty(v) && !field.options?.includes(String(v))) {
      errors.push({ field: field.id, message: "Ungültige Auswahl" });
      continue;
    }
    if (field.kind === "email" && !empty(v) && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(v))) {
      errors.push({ field: field.id, message: "Keine gültige E-Mail-Adresse" });
      continue;
    }
    if (field.kind === "url" && !empty(v)) {
      try {
        new URL(String(v));
      } catch {
        errors.push({ field: field.id, message: "Keine gültige URL" });
        continue;
      }
    }
    if (v !== undefined) {
      values[field.id] = v;
    }
  }
  return { values, errors };
}

export function defaultsFor(step: PageStep): Record<string, unknown> {
  return Object.fromEntries(
    step.fields.filter((f) => f.default !== undefined).map((f) => [f.id, f.default]),
  );
}
