import {
  allFields,
  type Field,
  isAudioValue,
  isLocationValue,
  itemsTotals,
  locationText,
  type WizardDefinition,
} from "@engenty-wizards/shared/definition";
import type { RunState } from "@engenty-wizards/shared/run";
import { type ListDef, type ListRow, listAsMarkdown } from "@engenty-wizards/shared/store";

export interface TemplateScope {
  def: WizardDefinition;
  state: RunState;
  brand: { name?: string; details?: string };
  /** The wizard's stored lists as they are when the step starts. */
  lists?: Record<string, { def: ListDef; rows: ListRow[] }>;
}

const TEMPLATE_RE = /\{\{\s*([^}]+?)\s*\}\}/g;

function money(n: number, currency: string): string {
  try {
    return new Intl.NumberFormat("de-DE", { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

/** Line items as a Markdown table with their totals — what a model needs to write a document. */
export function itemsAsMarkdown(
  field: Field,
  value: unknown,
  values: Record<string, unknown>,
): string {
  const totals = itemsTotals(field, value, values);
  const cols = field.columns ?? [];
  if (!totals.rows.length) {
    return "(no line items)";
  }
  const head = `| ${cols.map((c) => c.label).join(" | ")} | Amount |\n|${cols.map(() => " --- ").join("|")}| ---: |`;
  const body = totals.rows.map(
    (r) =>
      `| ${cols
        .map((c) =>
          c.kind === "money" ? money(Number(r[c.id]) || 0, totals.currency) : String(r[c.id] ?? ""),
        )
        .join(" | ")} | ${money(r.amount as number, totals.currency)} |`,
  );
  const sums = [
    `Net: ${money(totals.net, totals.currency)}`,
    totals.vatRate ? `VAT ${totals.vatRate}%: ${money(totals.vat, totals.currency)}` : null,
    `Total: ${money(totals.gross, totals.currency)}`,
  ].filter(Boolean);
  return [head, ...body, "", ...sums].join("\n");
}

function stringify(v: unknown): string {
  if (v === undefined || v === null) {
    return "";
  }
  if (typeof v === "string") {
    return v;
  }
  if (typeof v === "number" || typeof v === "boolean") {
    return String(v);
  }
  if (Array.isArray(v) && v.every((x) => typeof x !== "object")) {
    return v.join(", ");
  }
  return JSON.stringify(v, null, 2);
}

export function resolveRef(ref: string, scope: TemplateScope): unknown {
  const { def, state, brand } = scope;
  const [head, ...rest] = ref.split(".");
  if (head === "lists") {
    const list = scope.lists?.[rest[0] ?? ""];
    return list ? listAsMarkdown(list.def, list.rows) : "";
  }
  if (head === "today") {
    return new Date().toISOString().slice(0, 10);
  }
  if (head === "brand") {
    return (brand as Record<string, unknown>)[rest[0] ?? "name"] ?? "";
  }
  if (head === "steps") {
    const out = state.outputs[rest[0] ?? ""];
    if (!out) {
      return "";
    }
    if (rest.length === 1) {
      return out.json !== undefined ? out.json : (out.text ?? "");
    }
    let cur: unknown = out.json;
    for (const key of rest.slice(1)) {
      cur = cur && typeof cur === "object" ? (cur as Record<string, unknown>)[key] : undefined;
    }
    return cur;
  }
  const field = allFields(def).find((f) => f.id === head);
  const value = state.values[head];
  if (field?.kind === "items") {
    if (!rest.length) {
      return itemsAsMarkdown(field, value, state.values);
    }
    const totals = itemsTotals(field, value, state.values) as unknown as Record<string, unknown>;
    return totals[rest[0]];
  }
  if (field?.kind === "image" || field?.kind === "file") {
    // The files themselves are read with read_document / scan_documents by these names.
    const ids = (Array.isArray(value) ? value : [value]).filter(
      (v): v is string => typeof v === "string" && v.length > 0,
    );
    return ids.map((id) => `upload:${id}`).join(", ");
  }
  if (field?.kind === "location") {
    if (!isLocationValue(value)) {
      return "";
    }
    switch (rest[0]) {
      case undefined:
        return locationText(value);
      case "map":
        return value.lat === undefined
          ? ""
          : `https://www.openstreetmap.org/?mlat=${value.lat}&mlon=${value.lng}#map=17/${value.lat}/${value.lng}`;
      default:
        return (value as Record<string, unknown>)[rest[0]];
    }
  }
  if (field?.kind === "audio") {
    if (!isAudioValue(value)) {
      return "";
    }
    if (rest[0] === "seconds") {
      return value.seconds;
    }
    // A recording reads as what is said in it.
    return value.transcript?.trim() || "(voice note without intelligible speech)";
  }
  if (field?.kind === "signature") {
    // Documents place it as an image: <img src="asset://ID">.
    return typeof value === "string" && value ? `asset://${value}` : "";
  }
  if (field?.kind === "list") {
    const list = scope.lists?.[field.list ?? ""];
    return list ? listAsMarkdown(list.def, list.rows) : "";
  }
  if (field?.kind === "toggle") {
    return value ? "yes" : "no";
  }
  return value;
}

export function renderTemplate(template: string, scope: TemplateScope): string {
  return template.replace(TEMPLATE_RE, (_m, ref: string) =>
    stringify(resolveRef(ref.trim(), scope)),
  );
}

/** Everything the person entered so far, readable — handed to agents as data. */
export function answersAsText(scope: TemplateScope): string {
  const lines: string[] = [];
  for (const field of allFields(scope.def)) {
    const value = scope.state.values[field.id];
    if (value === undefined || value === "" || (Array.isArray(value) && !value.length)) {
      continue;
    }
    lines.push(`### ${field.label}\n${stringify(resolveRef(field.id, scope))}`);
  }
  return lines.join("\n\n");
}
