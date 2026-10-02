import { type Field, itemsTotals } from "@engenty-wizards/shared/definition";
import type { RunView } from "@engenty-wizards/shared/run";
import { Camera, Film, ImagePlus, Paperclip, Plus, ScanLine, Trash2, Video, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { cn, IconButton, Input, Label, Segmented, Select, Swatch, Switch, Textarea } from "../ui";
import { CameraDialog, canRecordClips, shrinkImage } from "./camera";
import { canUseMedia, isTouch } from "./device";
import { LocationField } from "./location";
import { ScanDialog } from "./scan";
import { SignatureField } from "./signature";
import { ConnectionField, ListTable } from "./store";
import { VoiceField } from "./voice";

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
    <div className="rounded-xl bg-card p-2 ring-1 ring-input">
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
          // A phone shows each row as a card: the first column across, the rest side by side
          // under their labels. From tablet width up it is one table row.
          <div
            key={i}
            className="grid grid-cols-6 gap-2 rounded-lg bg-paper p-2 sm:bg-transparent sm:p-0 sm:[grid-template-columns:var(--cols)]"
            style={{ "--cols": `${grid} 36px` } as React.CSSProperties}
          >
            {cols.map((c, ci) => (
              <label
                key={c.id}
                className={cn(
                  "flex min-w-0 flex-col gap-1 sm:col-span-1",
                  ci === 0 ? "col-span-5" : cols.length - 1 <= 2 ? "col-span-3" : "col-span-2",
                )}
              >
                <span className="px-0.5 text-[11px] text-ink-3 sm:hidden">{c.label}</span>
                <input
                  aria-label={c.label}
                  placeholder={c.label}
                  inputMode={c.kind === "text" ? "text" : "decimal"}
                  autoComplete="off"
                  value={String(row[c.id] ?? "")}
                  onChange={(e) => set(i, c.id, e.target.value)}
                  className={cn(
                    "h-11 w-full min-w-0 rounded-md border border-transparent bg-paper-2 px-2.5 text-[14px] outline-none placeholder:text-transparent focus:border-focus focus:bg-card sm:placeholder:text-ink-4",
                    c.kind !== "text" && "text-right tabular-nums",
                  )}
                />
              </label>
            ))}
            <IconButton
              label={t("list.delete")}
              onClick={() => onChange(rows.filter((_, j) => j !== i))}
              className="order-first col-start-6 row-start-1 size-11 justify-self-end self-end sm:order-none sm:col-start-auto sm:row-start-auto"
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
          className="inline-flex h-9 items-center gap-1.5 rounded-full px-3 text-[13px] text-ink-2 hover:bg-accent coarse:h-11"
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

/** Whether a paste belongs to typing somewhere rather than to an upload field. */
function typingTarget(el: Element | null): boolean {
  return Boolean(el?.closest("input, textarea, [contenteditable='true']"));
}

function UploadField({
  field,
  value,
  runId,
  onChange,
  onBusy,
}: {
  field: Field;
  value: unknown;
  runId: string;
  onChange: (v: unknown) => void;
  onBusy?: (busy: boolean) => void;
}) {
  const root = useRef<HTMLDivElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const nativeCamera = useRef<HTMLInputElement>(null);
  const nativeVideo = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [names, setNames] = useState<Record<string, { name: string; mime: string }>>({});
  const [error, setError] = useState<string | null>(null);
  const [camera, setCamera] = useState(false);
  const [over, setOver] = useState(false);
  const image = field.kind === "image";
  const multiple = Boolean(field.multiple);
  const withCamera = image || Boolean(field.camera) || Boolean(field.video);
  const clips = !image && Boolean(field.video);
  const ids = Array.isArray(value)
    ? (value as string[])
    : typeof value === "string" && value
      ? [value]
      : [];
  // The list as it is now, not as it was when an upload started: several can finish in a row.
  const current = useRef(ids);
  current.current = ids;
  const room = multiple || !ids.length;

  const add = async (files: File[]) => {
    const wanted = image ? files.filter((f) => f.type.startsWith("image/")) : files;
    if (!wanted.length) {
      return;
    }
    setBusy(true);
    onBusy?.(true);
    setError(null);
    try {
      for (const raw of multiple ? wanted : wanted.slice(0, 1)) {
        const file = await shrinkImage(raw);
        const ref = await api.upload<{ id: string; name: string; mime: string }>(
          `/api/runs/${runId}/uploads`,
          file,
        );
        setNames((n) => ({ ...n, [ref.id]: { name: ref.name, mime: ref.mime } }));
        const next = multiple ? [...current.current, ref.id] : ref.id;
        current.current = multiple ? (next as string[]) : [ref.id];
        onChange(next);
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      onBusy?.(false);
    }
  };
  const adding = useRef(add);
  adding.current = add;
  const remove = (id: string) => {
    const left = ids.filter((x) => x !== id);
    onChange(multiple ? left : undefined);
  };

  // A screenshot or a copied picture is pasted straight in: into the field the pointer is on,
  // or the page's only upload field. Typing in a text field keeps its own paste.
  useEffect(() => {
    if (!room) {
      return;
    }
    const onPaste = (e: ClipboardEvent) => {
      const files = Array.from(e.clipboardData?.files ?? []);
      const el = root.current;
      if (!files.length || !el || typingTarget(document.activeElement)) {
        return;
      }
      const fields = document.querySelectorAll("[data-upload-field]");
      if (el.matches(":hover") || el.contains(document.activeElement) || fields.length === 1) {
        e.preventDefault();
        void adding.current(files);
      }
    };
    document.addEventListener("paste", onPaste);
    return () => document.removeEventListener("paste", onPaste);
  }, [room]);

  const tile = cn(
    "flex flex-col items-center justify-center gap-2 rounded-xl border border-input border-dashed bg-card px-3 text-[14px] text-ink-3 transition hover:border-ember hover:text-ink",
    ids.length ? "py-4" : "py-8",
  );
  return (
    <div
      ref={root}
      data-upload-field=""
      onDragOver={(e) => {
        if (room) {
          e.preventDefault();
          setOver(true);
        }
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        setOver(false);
        if (room) {
          e.preventDefault();
          void add(Array.from(e.dataTransfer.files));
        }
      }}
    >
      {ids.length ? (
        <div className="mb-2 flex flex-col gap-2">
          {ids.map((id) => {
            const known = names[id];
            const mime = known?.mime ?? (image ? "image/" : "");
            return (
              <div
                key={id}
                className="flex items-center gap-3 rounded-xl bg-card p-2 ring-1 ring-input"
              >
                {mime.startsWith("image/") ? (
                  <img
                    src={`/api/runs/${runId}/assets/${id}`}
                    alt=""
                    className="size-14 rounded-lg object-cover"
                  />
                ) : (
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-lg bg-paper-2">
                    {mime.startsWith("video/") ? (
                      <Film className="size-5 text-ink-3" />
                    ) : (
                      <Paperclip className="size-5 text-ink-3" />
                    )}
                  </div>
                )}
                <div className="min-w-0 flex-1 truncate text-[14px]">{known?.name ?? "✓"}</div>
                <IconButton label={t("run.removeFile")} onClick={() => remove(id)}>
                  <X className="size-4" />
                </IconButton>
              </div>
            );
          })}
        </div>
      ) : null}
      {room ? (
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => picker.current?.click()}
            className={cn(tile, "min-w-[9rem] flex-1 px-4", over && "border-ember text-ink")}
          >
            {image ? <ImagePlus className="size-6" /> : <Paperclip className="size-6" />}
            {busy
              ? t("run.uploading")
              : ids.length
                ? t("run.uploadMore")
                : t(isTouch ? "run.uploadTouch" : "run.upload")}
          </button>
          {withCamera ? (
            <button
              type="button"
              onClick={() => (canUseMedia ? setCamera(true) : nativeCamera.current?.click())}
              className={cn(tile, "w-28")}
            >
              <Camera className="size-6" />
              {t("run.camera")}
            </button>
          ) : null}
          {/* Where the browser cannot record a clip itself, the phone's camera app does. */}
          {clips && !(canUseMedia && canRecordClips) ? (
            <button
              type="button"
              onClick={() => nativeVideo.current?.click()}
              className={cn(tile, "w-28")}
            >
              <Video className="size-6" />
              {t("camera.video")}
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
      {clips ? (
        <input
          ref={nativeVideo}
          type="file"
          hidden
          accept="video/*"
          capture="environment"
          onChange={(e) => {
            void add(Array.from(e.target.files ?? []));
            e.target.value = "";
          }}
        />
      ) : null}
      <CameraDialog
        open={camera}
        multiple={multiple}
        video={clips}
        onClose={() => setCamera(false)}
        onCapture={(file) => add([file])}
        onNative={() => nativeCamera.current?.click()}
      />
      {error ? <div className="mt-2 text-[13px] text-rose">{error}</div> : null}
    </div>
  );
}

/**
 * What the keyboard should offer for a short text: a label that asks for a phone number gets the
 * number pad, a name gets the person's own from autofill. Guessed from the field's id and label.
 */
function textHints(field: Field): React.InputHTMLAttributes<HTMLInputElement> {
  const key = `${field.id} ${field.label}`.toLowerCase();
  if (/telefon|phone|handy|mobil(?!it)|\btel\b|rückruf/.test(key)) {
    return { type: "tel", inputMode: "tel", autoComplete: "tel" };
  }
  if (/\bplz\b|postleitzahl|postal|zip/.test(key)) {
    return { inputMode: "numeric", autoComplete: "postal-code" };
  }
  if (/iban/.test(key)) {
    return { autoCapitalize: "characters", autoCorrect: "off", spellCheck: false };
  }
  if (/vorname|first.?name/.test(key)) {
    return { autoComplete: "given-name", autoCapitalize: "words" };
  }
  if (/nachname|last.?name|surname/.test(key)) {
    return { autoComplete: "family-name", autoCapitalize: "words" };
  }
  if (/firma|unternehmen|company|organi[sz]ation/.test(key)) {
    return { autoComplete: "organization", autoCapitalize: "words" };
  }
  if (/straße|strasse|street|anschrift|adresse|address/.test(key)) {
    return { autoComplete: "street-address", autoCapitalize: "words" };
  }
  if (/\b(ort|stadt|city|town)\b/.test(key)) {
    return { autoComplete: "address-level2", autoCapitalize: "words" };
  }
  if (/\bname\b|ansprechp/.test(key)) {
    return { autoComplete: "name", autoCapitalize: "words" };
  }
  return { autoCapitalize: "sentences" };
}

/** A short text that can also be filled by pointing the camera at a QR code or barcode. */
function ScanInput({
  field,
  value,
  onChange,
}: {
  field: Field;
  value: string;
  onChange: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="flex gap-2">
      <Input
        value={value}
        placeholder={field.placeholder}
        autoCapitalize="off"
        autoCorrect="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value)}
      />
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex h-11 shrink-0 items-center gap-2 rounded-lg border border-input bg-card px-3.5 font-medium text-[14px] text-ink-2 transition hover:border-ember hover:text-ink"
      >
        <ScanLine className="size-4" /> {t("scan.button")}
      </button>
      <ScanDialog open={open} onClose={() => setOpen(false)} onResult={onChange} />
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
  onBusy,
  error,
}: {
  field: Field;
  value: unknown;
  values: Values;
  runId: string;
  /** The run as the server sees it: connections and stored lists come from there. */
  view?: Pick<RunView, "connections" | "lists">;
  onChange: (v: unknown) => void;
  /** The field is uploading or recording: the page waits with going on. */
  onBusy?: (busy: boolean) => void;
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
          autoCapitalize="sentences"
          enterKeyHint="enter"
          onChange={(e) => onChange(e.target.value)}
        />
      );
      break;
    case "number":
      control = (
        <Input
          inputMode="decimal"
          autoComplete="off"
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
          className="w-full sm:w-56"
        />
      );
      break;
    case "email":
      control = (
        <Input
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
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
          inputMode="url"
          autoComplete="url"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
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
          <Swatch value={str || "#e0531b"} onChange={(e) => onChange(e.target.value)} />
          <Input
            value={str}
            placeholder="#e0531b"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            onChange={(e) => onChange(e.target.value)}
            className="w-36"
          />
        </div>
      );
      break;
    case "image":
    case "file":
      control = (
        <UploadField
          field={field}
          value={value}
          runId={runId}
          onChange={onChange}
          onBusy={onBusy}
        />
      );
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
    case "location":
      control = (
        <LocationField
          value={value}
          runId={runId}
          placeholder={field.placeholder}
          onChange={onChange}
          onBusy={onBusy}
        />
      );
      break;
    case "audio":
      control = <VoiceField value={value} runId={runId} onChange={onChange} onBusy={onBusy} />;
      break;
    case "signature":
      control = (
        <SignatureField label={field.label} value={value} runId={runId} onChange={onChange} />
      );
      break;
    default:
      control = field.scan ? (
        <ScanInput field={field} value={str} onChange={onChange} />
      ) : (
        <Input
          {...textHints(field)}
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
