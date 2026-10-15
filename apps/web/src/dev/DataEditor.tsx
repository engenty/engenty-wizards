import { Tabs } from "@engenty-wizards/runner/ui";
import { ChevronRight, Link2, Plus, Trash2, X } from "lucide-react";
import { type ReactNode, useState } from "react";
import { cn } from "../ui";
import type { Shape } from "./data-shape";

/**
 * Mock: how the admin shows and edits a run's nested data, drawn from its schema (concept A).
 * Lists of flat entries are tables as in Space → Data; entries that hold lists of their own are
 * cards that open; lists of words are chips; a link to another list shows that entry's title.
 */

type Path = (string | number)[];
type Mode = "view" | "edit" | "json";
type Fields = Record<string, Shape>;

interface Ctx {
  root: Record<string, unknown>;
  edit: boolean;
  set: (path: Path, value: unknown) => void;
  open: (id: string) => void;
}

const cellField =
  "w-full min-w-0 rounded-md bg-transparent px-2 py-1.5 text-[0.875rem] outline-none transition placeholder:text-ink-4 hover:bg-accent focus:bg-paper focus:ring-1 focus:ring-ring";

const label = "font-medium text-[0.6875rem] text-ink-3 uppercase tracking-[0.08em]";

function setIn(value: unknown, path: Path, next: unknown): unknown {
  if (!path.length) {
    return next;
  }
  const [head, ...rest] = path;
  if (Array.isArray(value)) {
    const copy = [...value];
    copy[head as number] = setIn(copy[head as number], rest, next);
    return copy;
  }
  const obj = (value ?? {}) as Record<string, unknown>;
  return { ...obj, [head]: setIn(obj[head], rest, next) };
}

/** Fields that fit in a table cell: no lists of entries, no long text. */
const flat = (s: Shape) =>
  s.kind !== "object" &&
  !(s.kind === "list" && s.of.kind === "object") &&
  !(s.kind === "text" && s.long);

const isTable = (s: Shape) =>
  s.kind === "list" && s.of.kind === "object" && Object.values(s.of.fields).every(flat);

/** Entries without lists of their own but with long text: numbered rows (steps of a recipe). */
const isRows = (s: Shape) =>
  s.kind === "list" &&
  s.of.kind === "object" &&
  Object.values(s.of.fields).every(
    (f) => f.kind !== "object" && !(f.kind === "list" && f.of.kind === "object"),
  );

/** An entry's name: its first short text. */
function titleOf(fields: Fields, entry: Record<string, unknown>): string {
  const key = Object.entries(fields).find(([, f]) => f.kind === "text" && !f.long)?.[0];
  return key ? String(entry[key] ?? "") : "";
}

/** An entry of another list by its id, and its name. */
function refTarget(ctx: Ctx, to: string, id: unknown) {
  const list = (ctx.root[to] ?? []) as Record<string, unknown>[];
  return list.find((e) => e.id === id);
}

function Words({ text }: { text: string }) {
  return <span className="whitespace-pre-wrap">{text}</span>;
}

/** One value by its kind, shown or edited in place. */
function Value({
  shape,
  value,
  path,
  ctx,
  cell,
}: {
  shape: Shape;
  value: unknown;
  path: Path;
  ctx: Ctx;
  cell?: boolean;
}) {
  switch (shape.kind) {
    case "text":
      if (!ctx.edit) {
        return <Words text={String(value ?? "")} />;
      }
      return shape.long ? (
        <textarea
          className={cn(cellField, "field-sizing-content max-h-60 resize-none")}
          value={String(value ?? "")}
          onChange={(e) => ctx.set(path, e.target.value)}
        />
      ) : (
        <input
          className={cellField}
          value={String(value ?? "")}
          onChange={(e) => ctx.set(path, e.target.value)}
        />
      );
    case "number":
      return ctx.edit ? (
        <span className="flex items-center gap-1">
          <input
            type="number"
            className={cn(cellField, "text-right tabular-nums", cell && "w-20")}
            value={value === undefined || value === null ? "" : Number(value)}
            onChange={(e) => ctx.set(path, e.target.value === "" ? null : Number(e.target.value))}
          />
          {shape.unit ? <span className="text-[0.8125rem] text-ink-3">{shape.unit}</span> : null}
        </span>
      ) : (
        <span className="tabular-nums">
          {value === null || value === undefined
            ? ""
            : `${value}${shape.unit ? ` ${shape.unit}` : ""}`}
        </span>
      );
    case "yesno":
      return ctx.edit ? (
        <label className="flex items-center gap-2 px-2 py-1.5 text-[0.8125rem] text-ink-2">
          <input
            type="checkbox"
            checked={Boolean(value)}
            onChange={(e) => ctx.set(path, e.target.checked)}
            className="size-4 accent-[var(--second)]"
          />
          {value ? (shape.yes ?? "Ja") : (shape.no ?? "Nein")}
        </label>
      ) : (
        <span
          className={cn(
            "inline-flex rounded-full px-2 py-0.5 text-[0.75rem]",
            value ? "bg-second-tint text-second" : "bg-paper-2 text-ink-3",
          )}
        >
          {value ? (shape.yes ?? "Ja") : (shape.no ?? "Nein")}
        </span>
      );
    case "choice":
      return ctx.edit ? (
        <select
          className={cellField}
          value={String(value ?? "")}
          onChange={(e) => ctx.set(path, e.target.value)}
        >
          {[...new Set([String(value ?? ""), ...shape.options])].map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </select>
      ) : (
        <span>{String(value ?? "")}</span>
      );
    case "ref": {
      const target = refTarget(ctx, shape.to, value);
      const list = (ctx.root[shape.to] ?? []) as Record<string, unknown>[];
      const fields = (() => {
        const s = ctx.root.__shape as Shape | undefined;
        return s?.kind === "object" && s.fields[shape.to]?.kind === "list"
          ? ((s.fields[shape.to] as { of: Shape }).of as { fields: Fields }).fields
          : {};
      })();
      if (ctx.edit) {
        return (
          <select
            className={cellField}
            value={String(value ?? "")}
            onChange={(e) => ctx.set(path, e.target.value)}
          >
            {list.map((e) => (
              <option key={String(e.id)} value={String(e.id)}>
                {titleOf(fields, e)}
              </option>
            ))}
          </select>
        );
      }
      return target ? (
        <button
          type="button"
          onClick={() => ctx.open(String(target.id))}
          className="inline-flex items-center gap-1 text-left text-ember-strong hover:underline"
        >
          <Link2 className="size-3.5 shrink-0" />
          {titleOf(fields, target)}
        </button>
      ) : (
        <span className="text-rose">{String(value ?? "")} fehlt</span>
      );
    }
    case "list":
      if (shape.of.kind === "object") {
        return isTable(shape) ? (
          <EntryTable shape={shape.of} value={value} path={path} ctx={ctx} />
        ) : isRows(shape) ? (
          <EntryRows shape={shape.of} value={value} path={path} ctx={ctx} />
        ) : (
          <EntryCards shape={shape.of} value={value} path={path} ctx={ctx} />
        );
      }
      return <Chips value={value} path={path} ctx={ctx} />;
    case "object":
      return <Form fields={shape.fields} value={value} path={path} ctx={ctx} />;
  }
}

function Chips({ value, path, ctx }: { value: unknown; path: Path; ctx: Ctx }) {
  const items = Array.isArray(value) ? (value as unknown[]).map(String) : [];
  const [draft, setDraft] = useState("");
  return (
    <span className="flex flex-wrap items-center gap-1">
      {items.map((item, i) => (
        <span
          key={`${item}-${i}`}
          className="inline-flex items-center gap-1 rounded-full bg-paper-2 px-2 py-0.5 text-[0.75rem]"
        >
          {item}
          {ctx.edit ? (
            <button
              type="button"
              aria-label="Entfernen"
              onClick={() =>
                ctx.set(
                  path,
                  items.filter((_, j) => j !== i),
                )
              }
              className="text-ink-3 hover:text-ink"
            >
              <X className="size-3" />
            </button>
          ) : null}
        </span>
      ))}
      {ctx.edit ? (
        <input
          className="w-20 rounded-full bg-transparent px-2 py-0.5 text-[0.75rem] outline-none ring-1 ring-border-soft focus:ring-ring"
          placeholder="+"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && draft.trim()) {
              ctx.set(path, [...items, draft.trim()]);
              setDraft("");
            }
          }}
        />
      ) : null}
    </span>
  );
}

/** Flat entries: a table as in Space → Data. */
function EntryTable({
  shape,
  value,
  path,
  ctx,
}: {
  shape: Shape;
  value: unknown;
  path: Path;
  ctx: Ctx;
}) {
  if (shape.kind !== "object") {
    return null;
  }
  const rows = (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  const cols = Object.entries(shape.fields);
  return (
    <div className="overflow-x-auto rounded-lg ring-1 ring-border-soft">
      <table className="w-full border-collapse text-[0.8125rem]">
        <thead className="bg-paper-2 text-ink-2">
          <tr>
            {cols.map(([key, f]) => (
              <th key={key} className="whitespace-nowrap px-3 py-2 text-left font-medium">
                {f.label}
              </th>
            ))}
            {ctx.edit ? <th className="w-8" /> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, i) => (
            <tr key={i} className="group border-border-soft border-t">
              {cols.map(([key, f]) => (
                <td key={key} className={cn("align-top", ctx.edit ? "p-0.5" : "px-3 py-2")}>
                  <Value shape={f} value={row[key]} path={[...path, i, key]} ctx={ctx} cell />
                </td>
              ))}
              {ctx.edit ? (
                <td className="p-0.5 align-middle">
                  <RemoveButton
                    onClick={() =>
                      ctx.set(
                        path,
                        rows.filter((_, j) => j !== i),
                      )
                    }
                  />
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
      {ctx.edit ? (
        <AddButton label={shape.label} onClick={() => ctx.set(path, [...rows, {}])} />
      ) : null}
    </div>
  );
}

/** Entries with long text and no lists: numbered rows, the long text first, the rest beside it. */
function EntryRows({
  shape,
  value,
  path,
  ctx,
}: {
  shape: Shape;
  value: unknown;
  path: Path;
  ctx: Ctx;
}) {
  if (shape.kind !== "object") {
    return null;
  }
  const rows = (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  const fields = Object.entries(shape.fields);
  const main = fields.filter(([, f]) => f.kind === "text" && f.long);
  const rest = fields.filter(([, f]) => !(f.kind === "text" && f.long));
  return (
    <div className="overflow-hidden rounded-lg ring-1 ring-border-soft">
      <ol>
        {rows.map((row, i) => (
          <li
            key={i}
            className="grid grid-cols-[1.75rem_1fr_auto] items-start gap-2 border-border-soft border-t px-3 py-2 first:border-0"
          >
            <span className="pt-1.5 font-display font-semibold text-ember-strong tabular-nums">
              {i + 1}
            </span>
            <div className={cn("flex min-w-0 flex-col", !ctx.edit && "pt-1")}>
              {main.map(([key, f]) => (
                <Value key={key} shape={f} value={row[key]} path={[...path, i, key]} ctx={ctx} />
              ))}
            </div>
            <div
              className={cn(
                "flex items-center gap-2 text-[0.8125rem] text-ink-3",
                !ctx.edit && "pt-1",
              )}
            >
              {rest.map(([key, f]) => (
                <Value
                  key={key}
                  shape={f}
                  value={row[key]}
                  path={[...path, i, key]}
                  ctx={ctx}
                  cell
                />
              ))}
              {ctx.edit ? (
                <RemoveButton
                  onClick={() =>
                    ctx.set(
                      path,
                      rows.filter((_, j) => j !== i),
                    )
                  }
                />
              ) : null}
            </div>
          </li>
        ))}
      </ol>
      {ctx.edit ? (
        <AddButton label={shape.label} onClick={() => ctx.set(path, [...rows, {}])} />
      ) : null}
    </div>
  );
}

/** Entries that hold lists of their own: one card each, opened to show and edit everything. */
function EntryCards({
  shape,
  value,
  path,
  ctx,
}: {
  shape: Shape;
  value: unknown;
  path: Path;
  ctx: Ctx;
}) {
  if (shape.kind !== "object") {
    return null;
  }
  const entries = (Array.isArray(value) ? value : []) as Record<string, unknown>[];
  const fields = Object.entries(shape.fields);
  // The summary line: every short value but the title, then how many each list holds.
  const titleKey = fields.find(([, f]) => f.kind === "text" && !f.long)?.[0];
  const short = fields.filter(
    ([key, f]) =>
      key !== titleKey &&
      ((f.kind === "text" && !f.long) || f.kind === "number" || f.kind === "choice"),
  );
  const lists = fields.filter(([, f]) => f.kind === "list" && f.of.kind === "object");
  return (
    <div className="flex flex-col gap-2">
      {entries.map((entry, i) => {
        const id = typeof entry.id === "string" ? entry.id : undefined;
        return (
          <details
            key={i}
            id={id ? `entry-${id}` : undefined}
            className="group rounded-xl bg-card ring-1 ring-border-soft open:ring-ink-4/40"
          >
            <summary className="flex cursor-pointer list-none items-center gap-3 px-4 py-3 [&::-webkit-details-marker]:hidden">
              <ChevronRight className="size-4 shrink-0 text-ink-3 transition-transform group-open:rotate-90" />
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium text-[0.9375rem]">
                  {titleOf(shape.fields, entry) || `${shape.label} ${i + 1}`}
                </span>
                <span className="flex flex-wrap gap-x-2 text-[0.75rem] text-ink-3">
                  {short.map(([key, f]) =>
                    entry[key] === undefined ? null : (
                      <span key={key}>
                        {f.kind === "number" && f.unit
                          ? `${entry[key]} ${f.unit}`
                          : String(entry[key])}
                      </span>
                    ),
                  )}
                  {lists.map(([key, f]) => (
                    <span key={key}>
                      {Array.isArray(entry[key]) ? (entry[key] as unknown[]).length : 0} {f.label}
                    </span>
                  ))}
                </span>
              </span>
              {ctx.edit ? (
                <RemoveButton
                  onClick={() =>
                    ctx.set(
                      path,
                      entries.filter((_, j) => j !== i),
                    )
                  }
                />
              ) : null}
            </summary>
            <div className="border-border-soft border-t px-4 py-4">
              <Form fields={shape.fields} value={entry} path={[...path, i]} ctx={ctx} />
            </div>
          </details>
        );
      })}
      {ctx.edit ? (
        <AddButton
          label={shape.label}
          onClick={() => ctx.set(path, [...entries, { id: `n${Date.now().toString(36)}` }])}
        />
      ) : null}
    </div>
  );
}

/** An entry's fields: short ones side by side, long text and lists across the width. */
function Form({
  fields,
  value,
  path,
  ctx,
}: {
  fields: Fields;
  value: unknown;
  path: Path;
  ctx: Ctx;
}) {
  const obj = (value ?? {}) as Record<string, unknown>;
  const entries = Object.entries(fields);
  const wide = (f: Shape) =>
    f.kind === "list" || f.kind === "object" || (f.kind === "text" && Boolean(f.long));
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(10rem,1fr))] gap-x-4 gap-y-4">
      {entries.map(([key, f]) => (
        <Field
          key={key}
          title={f.label}
          wide={wide(f)}
          count={Array.isArray(obj[key]) ? (obj[key] as unknown[]).length : null}
        >
          <Value shape={f} value={obj[key]} path={[...path, key]} ctx={ctx} />
        </Field>
      ))}
    </div>
  );
}

function Field({
  title,
  wide,
  count,
  children,
}: {
  title: string;
  wide: boolean;
  count: number | null;
  children: ReactNode;
}) {
  return (
    <div className={cn("flex min-w-0 flex-col gap-1.5 text-[0.875rem]", wide && "col-span-full")}>
      <span className={label}>
        {title}
        {count !== null ? <span className="ml-1 text-ink-4">{count}</span> : null}
      </span>
      {children}
    </div>
  );
}

function RemoveButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      aria-label="Entfernen"
      onClick={(e) => {
        e.preventDefault();
        onClick();
      }}
      className="grid size-7 place-items-center rounded-md text-ink-3 hover:bg-accent hover:text-rose"
    >
      <Trash2 className="size-3.5" />
    </button>
  );
}

function AddButton({ label: what, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-1.5 border-border-soft border-t px-3 py-2 text-[0.8125rem] text-ink-3 hover:bg-accent hover:text-ink"
    >
      <Plus className="size-3.5" /> {what} hinzufügen
    </button>
  );
}

/** The data of one step: a bar to switch view, edit and JSON, the parts to jump to, then the parts. */
export function DataEditor({
  shape,
  value,
  onChange,
}: {
  shape: Shape;
  value: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const [mode, setMode] = useState<Mode>("view");
  if (shape.kind !== "object") {
    return null;
  }
  const ctx: Ctx = {
    root: { ...value, __shape: shape },
    edit: mode === "edit",
    set: (path, next) => onChange(setIn(value, path, next) as Record<string, unknown>),
    open: (id) => {
      const el = document.getElementById(`entry-${id}`) as HTMLDetailsElement | null;
      if (el) {
        el.open = true;
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    },
  };
  const parts = Object.entries(shape.fields);
  return (
    <div className="flex flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-border-soft border-b px-3 py-2">
        <div className="flex min-w-0 flex-wrap gap-1">
          {parts.map(([key, f]) => (
            <a
              key={key}
              href={`#part-${key}`}
              className="rounded-full px-2.5 py-1 text-[0.8125rem] text-ink-2 hover:bg-accent"
            >
              {f.label}
              {Array.isArray(value[key]) ? (
                <span className="ml-1 text-ink-4 tabular-nums">
                  {(value[key] as unknown[]).length}
                </span>
              ) : null}
            </a>
          ))}
        </div>
        <Tabs<Mode>
          value={mode}
          onChange={setMode}
          options={[
            { id: "view", label: "Ansicht" },
            { id: "edit", label: "Bearbeiten" },
            { id: "json", label: "JSON" },
          ]}
        />
      </div>
      {mode === "json" ? (
        <pre className="max-h-[36rem] overflow-auto p-4 font-mono text-[0.75rem] text-ink-2 leading-relaxed">
          {JSON.stringify(value, null, 2)}
        </pre>
      ) : (
        <div className="flex flex-col gap-7 p-4 sm:p-5">
          {parts.map(([key, f]) => (
            <section key={key} id={`part-${key}`} className="flex scroll-mt-4 flex-col gap-2">
              <h3 className="flex items-baseline gap-2 font-display font-semibold text-[1rem]">
                {f.label}
                {Array.isArray(value[key]) ? (
                  <span className="font-normal font-sans text-[0.8125rem] text-ink-4 tabular-nums">
                    {(value[key] as unknown[]).length}
                  </span>
                ) : null}
              </h3>
              <div className="text-[0.9375rem] leading-relaxed">
                <Value shape={f} value={value[key]} path={[key]} ctx={ctx} />
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
