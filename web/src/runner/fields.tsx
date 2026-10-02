import { type Field, itemsTotals } from "@shared/definition";
import type { RunView } from "@shared/run";
import { Camera, ImagePlus, Paperclip, Plus, Trash2, X } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { cn, IconButton, Input, Label, Segmented, Select, Switch, Textarea } from "../ui";
import { CameraDialog, hasNativeCamera, shrinkImage } from "./camera";
import { ConnectionField, ListTable } from "./store";

export type Values = Record<string, unknown>;

function money(n: number, currency: string) {
  try {
    return new Intl.NumberFormat(undefined, { style: "currency", currency }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}

function ItemsField({
  field,
  value,
  values,
  onChange,
}: {
  field: Field;
  value: unknown;
  values: Values;
  onChange: (v: unknown) => void;
}) {
  const cols = field.columns ?? [];
  const rows = (Array.isArray(value) && value.length ? value : [{}]) as Record<string, unknown>[];
  const totals = itemsTotals(field, rows, values);
  const set = (i: number, col: string, v: string) => {
    const next = rows.map((r, j) => (j === i ? { ...r, [col]: v } : r));
    onChange(next);
  };
  const grid = cols
    .map((c) => (c.kind === "text" && c === cols[0] ? "minmax(0,3fr)" : "minmax(0,1fr)"))
    .join(" ");
  return (
    <div className="rounded-2xl bg-card p-2 ring-1 ring-input">
      <div
        className="hidden gap-2 px-2 pt-1 pb-2 text-[12px] text-ink-3 sm:grid"
        style={{ gridTemplateColumns: `${grid} 36px` }}
      >
        {cols.map((c) => (
          <div key={c.id} className={c.kind === "text" ? "" : "text-right"}>
            {c.label}
          </div>
        ))}
      </div>
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div
            key={i}
            className="grid gap-2 rounded-xl bg-paper p-2 sm:bg-transparent sm:p-0"
            style={{ gridTemplateColumns: `${grid} 36px` }}
          >
            {cols.map((c) => (
              <input
                key={c.id}
                aria-label={c.label}
                placeholder={c.label}
                inputMode={c.kind === "text" ? "text" : "decimal"}
                value={String(row[c.id] ?? "")}
                onChange={(e) => set(i, c.id, e.target.value)}
                className={cn(
                  "h-10 w-full min-w-0 rounded-lg border border-transparent bg-paper-2 px-2.5 text-[14px] outline-none focus:border-focus focus:bg-card",
                  c.kind !== "text" && "text-right tabular-nums",
                )}
              />
            ))}
            <IconButton
              label="Remove"
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="size-10"
            >
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap items-end justify-between gap-3 px-2 pb-1">
        <button
          type="button"
          onClick={() => onChange([...rows, {}])}
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-ink-2 hover:bg-accent"
        >
          <Plus className="size-4" /> {t("run.addRow")}
        </button>
        <div className="text-right text-[13px] tabular-nums">
          <div className="text-ink-3">
            {t("run.net")} {money(totals.net, totals.currency)}
          </div>
          {totals.vatRate ? (
            <div className="text-ink-3">
              {t("run.vat", { r: totals.vatRate })} {money(totals.vat, totals.currency)}
            </div>
          ) : null}
          <div className="font-semibold text-[15px] text-ink">
            {t("run.total")} {money(totals.gross, totals.currency)}
          </div>
        </div>
      </div>
    </div>
  );
}

function UploadField({
  field,
  value,
  runId,
  onChange,
}: {
  field: Field;
  value: unknown;
  runId: string;
  onChange: (v: unknown) => void;
}) {
  const picker = useRef<HTMLInputElement>(null);
  const nativeCamera = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<Record<string, { name: string; image: boolean }>>({});
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const image = field.kind === "image";
  const multiple = Boolean(field.multiple);
  const withCamera = image || Boolean(field.camera);
  const ids = Array.isArray(value)
    ? (value as string[])
    : typeof value === "string" && value
      ? [value]
      : [];
  // The list as it is now, not as it was when an upload started: several can finish in a row.
  const current = useRef(ids);
  current.current = ids;

  const add = async (files: File[]) => {
    if (!files.length) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const raw of multiple ? files : files.slice(0, 1)) {
        const file = await shrinkImage(raw);
        const ref = await api.upload<{ id: string; name: string; mime: string }>(
          `/api/runs/${runId}/uploads`,
          file,
        );
        setNames((n) => ({
          ...n,
          [ref.id]: { name: ref.name, image: ref.mime.startsWith("image/") },
        }));
        const next = multiple ? [...current.current, ref.id] : ref.id;
        current.current = multiple ? (next as string[]) : [ref.id];
        onChange(next);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const remove = (id: string) => {
    const left = ids.filter((x) => x !== id);
    onChange(multiple ? left : undefined);
  };

  return (
    <div>
      {ids.length ? (
        <div className="mb-2 flex flex-col gap-2">
          {ids.map((id) => {
            const known = names[id];
            return (
              <div
                key={id}
                className="flex items-center gap-3 rounded-2xl bg-card p-2 ring-1 ring-input"
              >
                {(known ? known.image : image) ? (
                  <img
                    src={`/api/runs/${runId}/assets/${id}`}
                    alt=""
                    className="size-14 rounded-xl object-cover"
                  />
                ) : (
                  <div className="flex size-12 items-center justify-center rounded-xl bg-paper-2">
                    <Paperclip className="size-5 text-ink-3" />
                  </div>
                )}
                <div className="min-w-0 flex-1 truncate text-[14px]">{known?.name ?? "✓"}</div>
                <IconButton label="Remove" onClick={() => remove(id)}>
                  <X className="size-4" />
                </IconButton>
              </div>
            );
          })}
        </div>
      ) : null}
      {multiple || !ids.length ? (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => picker.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              void add(Array.from(e.dataTransfer.files));
            }}
            className={cn(
              "flex flex-1 flex-col items-center justify-center gap-2 rounded-2xl border border-input border-dashed bg-card px-4 text-[14px] text-ink-3 transition hover:border-ember hover:text-ink",
              ids.length ? "py-4" : "py-8",
            )}
          >
            {image ? <ImagePlus className="size-6" /> : <Paperclip className="size-6" />}
            {busy ? t("run.uploading") : ids.length ? t("run.uploadMore") : t("run.upload")}
          </button>
          {withCamera ? (
            <button
              type="button"
              onClick={() => (hasNativeCamera ? nativeCamera.current?.click() : setCamera(true))}
              className={cn(
                "flex w-32 flex-col items-center justify-center gap-2 rounded-2xl border border-input border-dashed bg-card px-3 text-[14px] text-ink-3 transition hover:border-ember hover:text-ink",
                ids.length ? "py-4" : "py-8",
              )}
            >
              <Camera className="size-6" />
              {t("run.camera")}
            </button>
          ) : null}
        </div>
      ) : null}
      <input
        ref={picker}
        type="file"
        hidden
        multiple={multiple}
        accept={image ? "image/*" : undefined}
        onChange={(e) => {
          void add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <input
        ref={nativeCamera}
        type="file"
        hidden
        accept="image/*"
        capture="environment"
        onChange={(e) => {
          void add(Array.from(e.target.files ?? []));
          e.target.value = "";
        }}
      />
      <CameraDialog
        open={camera}
        multiple={multiple}
        onClose={() => setCamera(false)}
        onCapture={(file) => add([file])}
      />
      {error ? <div className="mt-2 text-[13px] text-rose">{error}</div> : null}
    </div>
  );
}

export function FieldInput({
  field,
  value,
  values,
  runId,
  view,
  onChange,
  error,
}: {
  field: Field;
  value: unknown;
  values: Values;
  runId: string;
  /** The run as the server sees it: connections and stored lists come from there. */
  view?: Pick<RunView, "connections" | "lists">;
  onChange: (v: unknown) => void;
  error?: string;
}) {
  const str = value === undefined || value === null ? "" : String(value);
  let control: React.ReactNode;
  switch (field.kind) {
    case "textarea":
      control = (
        <Textarea
          value={str}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "number":
      control = (
        <Input
          inputMode="decimal"
          value={str}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "select": {
      const options = field.options ?? [];
      control =
        options.length <= 5 && options.every((o) => o.length <= 28) ? (
          <Segmented value={str} options={options} onChange={onChange} />
        ) : (
          <Select
            value={str}
            placeholder="—"
            onChange={onChange}
            options={options.map((o) => ({ value: o, label: o }))}
          />
        );
      break;
    }
    case "multiselect":
      control = (
        <Segmented
          multi
          value={Array.isArray(value) ? (value as string[]) : []}
          options={field.options ?? []}
          onChange={onChange}
        />
      );
      break;
    case "date":
      control = (
        <Input
          type="date"
          value={str}
          onChange={(e) => onChange(e.target.value)}
          className="w-56"
        />
      );
      break;
    case "email":
      control = (
        <Input
          type="email"
          value={str}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "url":
      control = (
        <Input
          type="url"
          value={str}
          placeholder={field.placeholder ?? "https://"}
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "toggle":
      control = <Switch checked={value === true} onChange={onChange} label={field.label} />;
      break;
    case "color":
      control = (
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={str || "#e0531b"}
            onChange={(e) => onChange(e.target.value)}
            className="h-11 w-14 cursor-pointer rounded-xl border border-input bg-card p-1"
          />
          <Input
            value={str}
            placeholder="#e0531b"
            onChange={(e) => onChange(e.target.value)}
            className="w-36"
          />
        </div>
      );
      break;
    case "image":
    case "file":
      control = <UploadField field={field} value={value} runId={runId} onChange={onChange} />;
      break;
    case "items":
      control = <ItemsField field={field} value={value} values={values} onChange={onChange} />;
      break;
    case "connection":
      control = (
        <ConnectionField
          runId={runId}
          connection={view?.connections.find((c) => c.id === field.connection)}
        />
      );
      break;
    case "list": {
      const list = view?.lists.find((l) => l.def.id === field.list);
      control = list ? <ListTable runId={runId} list={list} editable /> : null;
      break;
    }
    default:
      control = (
        <Input
          value={str}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      );
  }
  return (
    <div>
      {field.kind === "toggle" ? (
        <div className="flex items-start justify-between gap-6">
          <Label hint={field.help}>{field.label}</Label>
          {control}
        </div>
      ) : (
        <>
          <Label hint={field.help} required={field.required}>
            {field.label}
          </Label>
          {control}
        </>
      )}
      {error ? <div className="mt-1.5 text-[13px] text-rose">{error}</div> : null}
    </div>
  );
}
