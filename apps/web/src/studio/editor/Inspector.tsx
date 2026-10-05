import {
  ASPECT_RATIOS,
  ENGENTY_KINDS,
  FIELD_KINDS,
  type Field,
  type Format,
  formatsFor,
  type Step,
  TOOL_IDS,
  VIDEO_RESOLUTIONS,
  type VideoResolution,
  type WizardDefinition,
} from "@engenty-wizards/shared/definition";
import type { WorkspaceFile } from "@engenty-wizards/shared/workspace";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Plus,
  Trash2,
  Wand2,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { withBase } from "@/lib/base";
import { Mascot } from "../../brand";
import { t } from "../../lib/i18n";
import { HtmlFrame } from "../../runner/outputs";
import { cn, IconButton, Input, Label, Segmented, Select, Switch, Textarea } from "../../ui";
import { ModelClassControl, StepCost, useEstimate } from "./estimate";
import { stepIcon, TYPE_TONE, toolLabel, typeLabel } from "./meta";

type Update = (next: WizardDefinition) => void;

const FIELD_KIND_LABEL: Record<string, string> = {
  text: "Kurzer Text",
  textarea: "Langer Text",
  number: "Zahl",
  select: "Auswahl",
  multiselect: "Mehrfachauswahl",
  date: "Datum",
  email: "E-Mail",
  url: "Link",
  toggle: "Ja/Nein",
  color: "Farbe",
  image: "Bild-Upload",
  file: "Datei-Upload",
  items: "Positionen (Tabelle)",
  connection: "Konto verbinden",
  list: "Gespeicherte Liste",
  location: "Standort",
  audio: "Sprachnotiz",
  signature: "Unterschrift",
};

/** A field that changes kind leaves behind what only the old kind understood. */
function withKind(field: Field, kind: Field["kind"]): Field {
  const upload = kind === "image" || kind === "file";
  return {
    ...field,
    kind,
    multiple: upload ? field.multiple : undefined,
    camera: kind === "file" ? field.camera : undefined,
    video: kind === "file" ? field.video : undefined,
    scan: kind === "text" ? field.scan : undefined,
  };
}

function Section({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <div className="border-border-soft border-t px-5 py-5 first:border-t-0">
      {title ? (
        <h4 className="mb-3 font-medium text-[12px] text-ink-3 uppercase tracking-[0.07em]">
          {title}
        </h4>
      ) : null}
      <div className="flex flex-col gap-4">{children}</div>
    </div>
  );
}

function uniqueId(def: WizardDefinition, base: string): string {
  const taken = new Set([
    ...def.steps.map((s) => s.id),
    ...def.steps.flatMap((s) => (s.type === "page" ? s.fields.map((f) => f.id) : [])),
  ]);
  let i = 1;
  let id = base;
  while (taken.has(id)) {
    i += 1;
    id = `${base}${i}`;
  }
  return id;
}

function FieldEditor({
  def,
  field,
  onChange,
  onRemove,
  onMove,
}: {
  def: WizardDefinition;
  field: Field;
  onChange: (f: Field) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-lg bg-paper ring-1 ring-border-soft">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 px-3 py-2.5 text-left"
      >
        <span className="min-w-0 flex-1 truncate text-[14px]">
          {field.label}
          {field.required ? <span className="ml-1 text-ember">*</span> : null}
        </span>
        <span className="text-[12px] text-ink-4">{FIELD_KIND_LABEL[field.kind]}</span>
        <ChevronDown className={cn("size-4 text-ink-4 transition", open && "rotate-180")} />
      </button>
      {open ? (
        <div className="flex flex-col gap-3 border-border-soft border-t px-3 py-3">
          <Input
            value={field.label}
            onChange={(e) => onChange({ ...field, label: e.target.value })}
          />
          <Select
            value={field.kind}
            onChange={(v) => onChange(withKind(field, v as Field["kind"]))}
            options={FIELD_KINDS.filter((k) => k !== "items" || field.kind === "items").map(
              (k) => ({ value: k, label: FIELD_KIND_LABEL[k] }),
            )}
          />
          {field.kind === "select" || field.kind === "multiselect" ? (
            <Input
              placeholder="Option A, Option B, Option C"
              value={(field.options ?? []).join(", ")}
              onChange={(e) =>
                onChange({
                  ...field,
                  options: e.target.value
                    .split(",")
                    .map((s) => s.trim())
                    .filter(Boolean),
                })
              }
            />
          ) : null}
          {field.kind === "connection" ? (
            <Select
              value={field.connection ?? ""}
              placeholder="Welches Konto?"
              onChange={(v) => onChange({ ...field, connection: v })}
              options={(def.connections ?? []).map((c) => ({
                value: c.id,
                label: c.title ?? c.id,
              }))}
            />
          ) : null}
          {field.kind === "list" ? (
            <Select
              value={field.list ?? ""}
              placeholder="Welche Liste?"
              onChange={(v) => onChange({ ...field, list: v })}
              options={(def.lists ?? []).map((l) => ({ value: l.id, label: l.title }))}
            />
          ) : null}
          {field.kind === "image" || field.kind === "file" ? (
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-ink-2">Mehrere Dateien</span>
              <Switch
                checked={Boolean(field.multiple)}
                onChange={(v) =>
                  onChange({
                    ...field,
                    multiple: v || undefined,
                    ...(v ? {} : { min: undefined, max: undefined }),
                  })
                }
              />
            </div>
          ) : null}
          {(field.kind === "image" || field.kind === "file") && field.multiple ? (
            <div className="flex items-center justify-between gap-2">
              <span className="text-[13px] text-ink-2">Wie viele?</span>
              <div className="flex items-center gap-1.5">
                {(["min", "max"] as const).map((key) => (
                  <Input
                    key={key}
                    type="number"
                    min={1}
                    max={30}
                    aria-label={key === "min" ? "Mindestens" : "Höchstens"}
                    placeholder={key === "min" ? "min." : "max."}
                    value={field[key] ?? ""}
                    onChange={(e) => {
                      const n = Math.round(Number(e.target.value));
                      onChange({
                        ...field,
                        [key]: e.target.value && n >= 1 ? Math.min(n, 30) : undefined,
                      });
                    }}
                    className="h-8 w-16 text-right"
                  />
                ))}
              </div>
            </div>
          ) : null}
          {field.kind === "file" ? (
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-ink-2">Auch mit der Kamera aufnehmen</span>
              <Switch
                checked={Boolean(field.camera)}
                onChange={(v) => onChange({ ...field, camera: v || undefined })}
              />
            </div>
          ) : null}
          {field.kind === "file" ? (
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-ink-2">Kamera nimmt auch kurze Videos auf</span>
              <Switch
                checked={Boolean(field.video)}
                onChange={(v) => onChange({ ...field, video: v || undefined })}
              />
            </div>
          ) : null}
          {field.kind === "text" ? (
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-ink-2">QR- oder Barcode scannen</span>
              <Switch
                checked={Boolean(field.scan)}
                onChange={(v) => onChange({ ...field, scan: v || undefined })}
              />
            </div>
          ) : null}
          {["text", "textarea", "number", "email", "url", "location"].includes(field.kind) ? (
            <Input
              placeholder="Platzhalter"
              value={field.placeholder ?? ""}
              onChange={(e) => onChange({ ...field, placeholder: e.target.value || undefined })}
            />
          ) : null}
          <Input
            placeholder="Hilfetext"
            value={field.help ?? ""}
            onChange={(e) => onChange({ ...field, help: e.target.value || undefined })}
          />
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-ink-2">{t("run.required")}</span>
            <Switch
              checked={Boolean(field.required)}
              onChange={(v) => onChange({ ...field, required: v })}
            />
          </div>
          <div className="flex items-center justify-between">
            <span className="font-mono text-[11px] text-ink-4">{`{{${field.id}}}`}</span>
            <div className="flex">
              <IconButton label={t("editor.moveUp")} onClick={() => onMove(-1)} className="size-8">
                <ArrowUp className="size-3.5" />
              </IconButton>
              <IconButton label={t("editor.moveDown")} onClick={() => onMove(1)} className="size-8">
                <ArrowDown className="size-3.5" />
              </IconButton>
              <IconButton label="Entfernen" onClick={onRemove} className="size-8 hover:text-rose">
                <Trash2 className="size-3.5" />
              </IconButton>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

const WIDGET_SIZES = [
  { label: "16:9", width: 1280, height: 720 },
  { label: "1:1", width: 1080, height: 1080 },
  { label: "4:5", width: 1080, height: 1350 },
  { label: "9:16", width: 1080, height: 1920 },
];

/** Where a widget's data can come from: earlier fields and steps. */
function dataSources(def: WizardDefinition, index: number): string[] {
  const out: string[] = [];
  for (const s of def.steps.slice(0, index)) {
    if (s.type === "page") {
      out.push(...s.fields.map((f) => f.id));
    } else if (s.type === "agent") {
      out.push(`steps.${s.id}`, ...(s.output.fields ?? []).map((f) => `steps.${s.id}.${f.id}`));
    } else if (s.type === "generate" || s.type === "widget") {
      out.push(`steps.${s.id}`);
    }
  }
  return [...out, "brand.name", "today"];
}

function WidgetBody({
  def,
  step,
  set,
  files,
  wizardId,
}: {
  def: WizardDefinition;
  step: Extract<Step, { type: "widget" }>;
  set: (s: Step) => void;
  files: WorkspaceFile[];
  wizardId: string;
}) {
  const html = files.filter((f) => f.mime === "text/html");
  const json = files.filter((f) => f.mime === "application/json");
  const size = step.size ?? WIDGET_SIZES[0];
  const sources = dataSources(def, def.steps.indexOf(step));
  const entries = Object.entries(step.data);
  const setData = (next: [string, string][]) => set({ ...step, data: Object.fromEntries(next) });
  // The preview reloads when the widget's files or its size change.
  const version = [
    files.find((f) => f.path === step.entry)?.hash.slice(0, 8),
    files.find((f) => f.path === step.sample)?.hash.slice(0, 8),
    size.width,
    size.height,
  ].join("-");
  const hasEntry = files.some((f) => f.path === step.entry);
  return (
    <>
      <Section title="Vorschau mit Beispieldaten">
        {hasEntry ? (
          <HtmlFrame
            src={withBase(
              `/api/studio/wizards/${wizardId}/widgets/${step.id}/preview?v=${version}`,
            )}
            page={size.width}
            height={size.height}
            fit
          />
        ) : (
          <p className="text-[13px] text-ink-3">
            Das Widget ist noch nicht gebaut. Bitte im Gespräch darum – oder lade eine HTML-Datei
            unter „Dateien“ hoch.
          </p>
        )}
      </Section>
      <Section title="Widget">
        <Label>HTML-Datei</Label>
        <Select
          value={step.entry}
          onChange={(v) => set({ ...step, entry: v })}
          options={(html.some((f) => f.path === step.entry)
            ? html
            : [{ path: step.entry }, ...html]
          ).map((f) => ({ value: f.path, label: f.path }))}
        />
        <Label>Beispieldaten</Label>
        <Select
          value={step.sample ?? ""}
          onChange={(v) => set({ ...step, sample: v || undefined })}
          options={[
            { value: "", label: "keine" },
            ...json.map((f) => ({ value: f.path, label: f.path })),
          ]}
        />
        <Label>Größe</Label>
        <Segmented
          value={
            WIDGET_SIZES.find((p) => p.width === size.width && p.height === size.height)?.label ??
            ""
          }
          options={WIDGET_SIZES.map((p) => p.label)}
          onChange={(v: string) => {
            const p = WIDGET_SIZES.find((x) => x.label === v);
            if (p) {
              set({ ...step, size: { width: p.width, height: p.height } });
            }
          }}
        />
      </Section>
      <Section title="Daten für das Widget">
        <datalist id={`sources-${step.id}`}>
          {sources.map((s) => (
            <option key={s} value={s} />
          ))}
        </datalist>
        {entries.map(([key, ref], i) => (
          <div key={i} className="flex items-center gap-2">
            <Input
              value={key}
              className="w-28 font-mono text-[12px]"
              onChange={(e) =>
                setData(entries.map((x, j) => (j === i ? [e.target.value, x[1]] : x)))
              }
            />
            <span className="text-ink-4">←</span>
            <Input
              value={ref}
              list={`sources-${step.id}`}
              className="flex-1 font-mono text-[12px]"
              onChange={(e) =>
                setData(entries.map((x, j) => (j === i ? [x[0], e.target.value] : x)))
              }
            />
            <IconButton
              label={t("editor.deleteStep")}
              onClick={() => setData(entries.filter((_, j) => j !== i))}
            >
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        ))}
        <button
          type="button"
          onClick={() =>
            setData([...entries, [`wert${entries.length + 1}`, sources[0] ?? "today"]])
          }
          className="inline-flex h-8 items-center gap-1 self-start rounded-full px-2.5 text-[12px] text-ink-2 hover:bg-accent"
        >
          <Plus className="size-3.5" /> Wert
        </button>
      </Section>
    </>
  );
}

function StepBody({
  def,
  step,
  set,
  mcpServers,
  files,
  wizardId,
}: {
  def: WizardDefinition;
  step: Step;
  set: (s: Step) => void;
  mcpServers: { id: string; name: string }[];
  files: WorkspaceFile[];
  wizardId: string;
}) {
  const index = def.steps.indexOf(step);
  const earlierProducers = def.steps
    .slice(0, index)
    .filter((s) => s.type === "agent" || s.type === "generate" || s.type === "widget");
  switch (step.type) {
    case "widget":
      return <WidgetBody def={def} step={step} set={set} files={files} wizardId={wizardId} />;
    case "page":
      return (
        <Section title="Fragen">
          <div className="flex flex-col gap-2">
            {step.fields.map((f, i) => (
              <FieldEditor
                key={f.id}
                def={def}
                field={f}
                onChange={(nf) =>
                  set({ ...step, fields: step.fields.map((x, j) => (j === i ? nf : x)) })
                }
                onRemove={() =>
                  step.fields.length > 1 &&
                  set({ ...step, fields: step.fields.filter((_, j) => j !== i) })
                }
                onMove={(dir) => {
                  const j = i + dir;
                  if (j < 0 || j >= step.fields.length) {
                    return;
                  }
                  const fields = [...step.fields];
                  [fields[i], fields[j]] = [fields[j], fields[i]];
                  set({ ...step, fields });
                }}
              />
            ))}
          </div>
          <button
            type="button"
            onClick={() =>
              set({
                ...step,
                fields: [
                  ...step.fields,
                  { id: uniqueId(def, "frage"), label: "Neue Frage", kind: "text" },
                ],
              })
            }
            className="inline-flex h-9 items-center gap-1.5 self-start rounded-full px-3 text-[13px] text-ink-2 hover:bg-accent"
          >
            <Plus className="size-4" /> Frage hinzufügen
          </button>
        </Section>
      );
    case "agent":
      return (
        <>
          <Section title="Auftrag">
            <Textarea
              value={step.instructions}
              minRows={6}
              maxRows={20}
              onChange={(e) => set({ ...step, instructions: e.target.value })}
              className="text-[14px]"
            />
            <p className="text-[12px] text-ink-4">
              Antworten einsetzen mit <code className="font-mono">{"{{feld}}"}</code>, frühere
              Ergebnisse mit <code className="font-mono">{"{{steps.id}}"}</code>.
            </p>
          </Section>
          <Section title="Werkzeuge">
            <Segmented
              multi
              value={step.tools}
              options={[...TOOL_IDS]}
              onChange={(v: string[]) => set({ ...step, tools: v as typeof step.tools })}
            />
            <div className="-mt-2 flex flex-wrap gap-x-3 text-[12px] text-ink-4">
              {TOOL_IDS.map((id) => (
                <span key={id}>
                  {id} = {toolLabel(id)}
                </span>
              ))}
            </div>
            {def.connections?.length ? (
              <>
                <Label hint="Konten, die die Person im Durchlauf verbindet. Der Schritt liest darin, er schreibt nie.">
                  Konten der Person
                </Label>
                <Segmented
                  multi
                  value={step.connections ?? []}
                  options={def.connections.map((c) => c.id)}
                  onChange={(v: string[]) =>
                    set({ ...step, connections: v.length ? v : undefined })
                  }
                />
              </>
            ) : null}
            {mcpServers.length ? (
              <>
                <Label hint="Nur freigegebene Systeme sind in diesem Schritt erreichbar.">
                  Verbundene Systeme
                </Label>
                <Segmented
                  multi
                  value={step.mcp ?? []}
                  options={mcpServers.map((m) => m.id)}
                  onChange={(v: string[]) => set({ ...step, mcp: v.length ? v : undefined })}
                />
              </>
            ) : null}
          </Section>
          <Section title="Ergebnis">
            <Segmented
              value={step.output.format}
              options={["text", "markdown", "json"]}
              onChange={(v: "text" | "markdown" | "json") =>
                set({ ...step, output: { ...step.output, format: v } })
              }
            />
            <ModelClassControl
              model={step.model}
              effort={step.effort}
              onChange={(next) => set({ ...step, ...next })}
            />
            <Input
              placeholder="Text während der Arbeit, z. B. „Recherchiert …“"
              value={step.working ?? ""}
              onChange={(e) => set({ ...step, working: e.target.value || undefined })}
            />
          </Section>
        </>
      );
    case "generate":
      return (
        <>
          <Section title="Was wird erzeugt?">
            <Segmented
              value={step.asset}
              options={["image", "video", "voice", "document", "dashboard"]}
              onChange={(v: typeof step.asset) => set({ ...step, asset: v })}
            />
            <Textarea
              value={step.prompt}
              minRows={5}
              maxRows={18}
              onChange={(e) => set({ ...step, prompt: e.target.value })}
              className="text-[14px]"
            />
          </Section>
          <Section title="Optionen">
            {step.asset === "document" || step.asset === "dashboard" ? (
              <ModelClassControl
                model={step.model}
                effort={step.effort}
                onChange={(next) => set({ ...step, ...next })}
              />
            ) : null}
            {step.asset === "image" || step.asset === "video" ? (
              <>
                <Label>Format</Label>
                <Segmented
                  value={step.options?.aspectRatio ?? ""}
                  options={[...ASPECT_RATIOS]}
                  onChange={(v: (typeof ASPECT_RATIOS)[number]) =>
                    set({ ...step, options: { ...step.options, aspectRatio: v } })
                  }
                />
                <Input
                  placeholder="Stil, z. B. „helle Fotografie, minimalistisch“"
                  value={step.options?.style ?? ""}
                  onChange={(e) =>
                    set({
                      ...step,
                      options: { ...step.options, style: e.target.value || undefined },
                    })
                  }
                />
              </>
            ) : null}
            {step.asset === "video" ? (
              <>
                <Label>Länge (Sekunden)</Label>
                <Segmented
                  value={String(step.options?.duration ?? 8)}
                  options={["4", "6", "8", "10"]}
                  onChange={(v: string) =>
                    set({ ...step, options: { ...step.options, duration: Number(v) } })
                  }
                />
                <Label>Auflösung</Label>
                <Segmented
                  value={step.options?.resolution ?? "720p"}
                  options={[...VIDEO_RESOLUTIONS]}
                  onChange={(v: VideoResolution) =>
                    set({ ...step, options: { ...step.options, resolution: v } })
                  }
                />
              </>
            ) : null}
            {step.asset === "document" ? (
              <>
                <Label>Vorlage</Label>
                <Select
                  value={step.options?.template ?? "free"}
                  onChange={(v) =>
                    set({ ...step, options: { ...step.options, template: v as "free" } })
                  }
                  options={["free", "invoice", "offer", "briefing", "letter", "report"].map(
                    (v) => ({ value: v, label: v }),
                  )}
                />
              </>
            ) : null}
          </Section>
        </>
      );
    case "review":
      return (
        <Section title="Was wird gezeigt?">
          <Segmented
            multi
            value={step.show}
            options={earlierProducers.map((s) => s.id)}
            onChange={(v: string[]) => v.length && set({ ...step, show: v })}
          />
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-ink-2">Text direkt bearbeitbar</span>
            <Switch checked={Boolean(step.edit)} onChange={(v) => set({ ...step, edit: v })} />
          </div>
          <div className="flex items-center justify-between">
            <span className="text-[13px] text-ink-2">Neue Variante anfordern</span>
            <Switch
              checked={Boolean(step.regenerate)}
              onChange={(v) => set({ ...step, regenerate: v })}
            />
          </div>
        </Section>
      );
    case "result":
      return (
        <>
          <Section title="Abschluss">
            <Textarea
              minRows={2}
              placeholder="Nachricht am Ende"
              value={step.message ?? ""}
              onChange={(e) => set({ ...step, message: e.target.value || undefined })}
            />
          </Section>
          <Section title="Downloads">
            {earlierProducers.map((s) => {
              const d = step.deliverables.find((x) => x.from === s.id);
              const possible = formatsFor(s);
              return (
                <div key={s.id} className="rounded-lg bg-paper p-3 ring-1 ring-border-soft">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="truncate text-[14px]">{s.title}</span>
                    <Switch
                      checked={Boolean(d)}
                      onChange={(on) =>
                        set({
                          ...step,
                          deliverables: on
                            ? [
                                ...step.deliverables,
                                { from: s.id, label: s.title, formats: [possible[0]] },
                              ]
                            : step.deliverables.filter((x) => x.from !== s.id),
                        })
                      }
                    />
                  </div>
                  {d ? (
                    <Segmented
                      multi
                      value={d.formats}
                      options={possible}
                      onChange={(v: Format[]) =>
                        v.length &&
                        set({
                          ...step,
                          deliverables: step.deliverables.map((x) =>
                            x.from === s.id ? { ...x, formats: v } : x,
                          ),
                        })
                      }
                    />
                  ) : null}
                </div>
              );
            })}
          </Section>
        </>
      );
  }
}

export function WizardSettings({ def, update }: { def: WizardDefinition; update: Update }) {
  return (
    <div>
      <Section>
        <div>
          <Label>Titel</Label>
          <Input value={def.title} onChange={(e) => update({ ...def, title: e.target.value })} />
        </div>
        <div>
          <Label>Beschreibung</Label>
          <Textarea
            minRows={2}
            value={def.description}
            onChange={(e) => update({ ...def, description: e.target.value })}
          />
        </div>
        <div>
          <Label hint="Steht über der ersten Seite.">Begrüßung</Label>
          <Textarea
            minRows={2}
            value={def.intro ?? ""}
            onChange={(e) => update({ ...def, intro: e.target.value || undefined })}
          />
        </div>
      </Section>
      <Section title="Avatar">
        <div className="grid grid-cols-5 gap-2">
          {ENGENTY_KINDS.map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => update({ ...def, avatar: k })}
              className={cn(
                "flex aspect-square items-center justify-center rounded-xl transition",
                def.avatar === k ? "bg-ember-tint ring-2 ring-ember" : "bg-paper hover:bg-paper-2",
              )}
              aria-label={k}
            >
              <Mascot kind={k} size={44} interactive={false} />
            </button>
          ))}
        </div>
      </Section>
      {def.lists?.length || def.connections?.length ? (
        <Section title="Merkt sich für jede Person">
          <p className="text-[13px] text-ink-3">
            Bleibt zwischen den Durchläufen erhalten – getrennt für jede Person, die den Wizard
            nutzt. Ändern kannst du das im Gespräch.
          </p>
          {(def.connections ?? []).map((c) => (
            <div key={c.id} className="rounded-lg bg-paper px-3 py-2.5 ring-1 ring-border-soft">
              <div className="text-[14px]">{c.title ?? c.id}</div>
              <div className="text-[12px] text-ink-4">Konto · {c.kind}</div>
            </div>
          ))}
          {(def.lists ?? []).map((l) => (
            <div key={l.id} className="rounded-lg bg-paper px-3 py-2.5 ring-1 ring-border-soft">
              <div className="text-[14px]">{l.title}</div>
              <div className="text-[12px] text-ink-4">
                Liste · {l.columns.map((c) => c.name).join(", ")}
              </div>
              <div className="mt-1 font-mono text-[11px] text-ink-4">{`{{lists.${l.id}}}`}</div>
            </div>
          ))}
        </Section>
      ) : null}
    </div>
  );
}

const NEW_STEP: Record<string, (id: string) => Step> = {
  page: (id) => ({
    id,
    type: "page",
    title: "Neue Seite",
    fields: [{ id: `${id}Text`, label: "Neue Frage", kind: "text" }],
  }),
  agent: (id) => ({
    id,
    type: "agent",
    title: "KI-Schritt",
    instructions: "Beschreibe die Aufgabe …",
    tools: [],
    output: { format: "markdown" },
  }),
  generate: (id) => ({
    id,
    type: "generate",
    title: "Bild erzeugen",
    asset: "image",
    prompt: "Beschreibe das Bild …",
  }),
  widget: (id) => ({
    id,
    type: "widget",
    title: "Widget",
    entry: `${id}/index.html`,
    data: {},
    sample: `${id}/sample.json`,
  }),
};

interface InspectorProps {
  def: WizardDefinition;
  selected: string | null;
  update: Update;
  onSelect: (id: string | null) => void;
  issues: { stepId?: string; message: string }[];
  mcpServers: { id: string; name: string }[];
  files: WorkspaceFile[];
  wizardId: string;
}

const WIZARD = "__wizard";

/**
 * The wizard's steps in a row, in run order, with the wizard's own settings first: one click or
 * the arrows (on screen or ← / → on the keyboard) move from step to step without going back to
 * the diagram.
 */
function StepNav({
  def,
  selected,
  onSelect,
  issues,
}: Pick<InspectorProps, "def" | "selected" | "onSelect" | "issues">) {
  const ids = [WIZARD, ...def.steps.map((s) => s.id)];
  const at = selected ? ids.indexOf(selected) : -1;
  const current = useRef<HTMLButtonElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the selected step is what moves into view
  useEffect(() => {
    current.current?.scrollIntoView({ block: "nearest", inline: "center", behavior: "smooth" });
  }, [selected]);
  const go = (dir: -1 | 1) => {
    // Nothing picked: forward starts at the first step, back at the last.
    const next = at === -1 ? (dir === 1 ? 1 : ids.length - 1) : at + dir;
    if (next >= 0 && next < ids.length) {
      onSelect(ids[next]);
    }
  };
  const goRef = useRef(go);
  goRef.current = go;
  // ← / → step through while this tab is open, unless the keys belong to a field or a control.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") {
        return;
      }
      if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) {
        return;
      }
      const el = e.target as HTMLElement | null;
      if (
        el?.closest(
          'input, textarea, select, [contenteditable=""], [contenteditable="true"], [role="separator"], [role="slider"], [role="dialog"], .react-flow',
        )
      ) {
        return;
      }
      e.preventDefault();
      goRef.current(e.key === "ArrowLeft" ? -1 : 1);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
  const dot = "inline-flex size-8 shrink-0 items-center justify-center rounded-full transition";
  return (
    <div className="sticky top-0 z-10 flex items-center gap-1 border-border-soft border-b bg-card/95 px-2 py-2 backdrop-blur">
      <IconButton
        label={t("editor.prevStep")}
        className="size-8 shrink-0"
        disabled={at === 0}
        onClick={() => go(-1)}
      >
        <ChevronLeft className="size-4" />
      </IconButton>
      <div className="flex min-w-0 flex-1 items-center overflow-x-auto p-1 [scrollbar-width:none]">
        <button
          ref={selected === WIZARD ? current : undefined}
          type="button"
          title={def.title}
          aria-label={def.title}
          aria-current={selected === WIZARD ? "step" : undefined}
          onClick={() => onSelect(WIZARD)}
          className={cn(
            dot,
            "bg-paper-2 text-ink-2",
            selected === WIZARD ? "ring-2 ring-ember" : "hover:ring-2 hover:ring-border-soft",
          )}
        >
          <Wand2 className="size-4" />
        </button>
        {def.steps.map((step, i) => {
          const Icon = stepIcon(step);
          const active = step.id === selected;
          const broken = issues.some((issue) => issue.stepId === step.id);
          return (
            <div key={step.id} className="flex shrink-0 items-center">
              <span className="h-px w-3 bg-border-soft" />
              <button
                ref={active ? current : undefined}
                type="button"
                title={`${i + 1}. ${step.title}`}
                aria-label={`${i + 1}. ${step.title}`}
                aria-current={active ? "step" : undefined}
                onClick={() => onSelect(step.id)}
                className={cn(
                  dot,
                  "relative",
                  TYPE_TONE[step.type],
                  active ? "ring-2 ring-ember" : "opacity-70 hover:opacity-100",
                )}
              >
                <Icon className="size-4" />
                {broken ? (
                  <span className="-top-0.5 -right-0.5 absolute size-2.5 rounded-full bg-rose ring-2 ring-card" />
                ) : null}
              </button>
            </div>
          );
        })}
      </div>
      <span className="shrink-0 px-1 text-[12px] text-ink-4 tabular-nums">
        {at > 0 ? `${at} / ${def.steps.length}` : ""}
      </span>
      <IconButton
        label={t("editor.nextStep")}
        className="size-8 shrink-0"
        disabled={at === ids.length - 1}
        onClick={() => go(1)}
      >
        <ChevronRight className="size-4" />
      </IconButton>
    </div>
  );
}

/** Nothing picked yet: the steps as a list to pick from. */
function StepList({ def, onSelect, issues }: Pick<InspectorProps, "def" | "onSelect" | "issues">) {
  return (
    <div className="flex flex-col gap-1 p-3">
      {def.steps.map((step, i) => {
        const Icon = stepIcon(step);
        const broken = issues.some((issue) => issue.stepId === step.id);
        return (
          <button
            key={step.id}
            type="button"
            onClick={() => onSelect(step.id)}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-left transition hover:bg-paper-2"
          >
            <span className="w-4 text-right text-[12px] text-ink-4 tabular-nums">{i + 1}</span>
            <span
              className={cn(
                "inline-flex size-7 shrink-0 items-center justify-center rounded-md",
                TYPE_TONE[step.type],
              )}
            >
              <Icon className="size-4" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px]">{step.title}</span>
              <span className="block text-[12px] text-ink-4">{typeLabel(step)}</span>
            </span>
            {broken ? <span className="size-2 shrink-0 rounded-full bg-rose" /> : null}
          </button>
        );
      })}
    </div>
  );
}

export function Inspector(props: InspectorProps) {
  const { def, selected, update, onSelect, issues } = props;
  const step = def.steps.find((s) => s.id === selected);
  return (
    <div>
      <StepNav def={def} selected={selected} onSelect={onSelect} issues={issues} />
      {selected === WIZARD ? (
        <WizardSettings def={def} update={update} />
      ) : step ? (
        <StepInspector {...props} step={step} />
      ) : (
        <StepList def={def} onSelect={onSelect} issues={issues} />
      )}
    </div>
  );
}

function StepInspector({
  def,
  step,
  update,
  onSelect,
  issues,
  mcpServers,
  files,
  wizardId,
}: InspectorProps & { step: Step }) {
  const index = def.steps.indexOf(step);
  const Icon = stepIcon(step);
  const set = (next: Step) =>
    update({ ...def, steps: def.steps.map((s) => (s.id === step.id ? next : s)) });
  const move = (dir: -1 | 1) => {
    const j = index + dir;
    if (
      j < 0 ||
      j >= def.steps.length - (step.type === "result" ? 0 : 1) ||
      def.steps[j].type === "result"
    ) {
      return;
    }
    const steps = [...def.steps];
    [steps[index], steps[j]] = [steps[j], steps[index]];
    update({ ...def, steps });
  };
  const insertAfter = (kind: keyof typeof NEW_STEP) => {
    const id = uniqueId(
      def,
      kind === "page"
        ? "seite"
        : kind === "agent"
          ? "ki"
          : kind === "widget"
            ? "widget"
            : "erzeugen",
    );
    const steps = [...def.steps];
    steps.splice(step.type === "result" ? index : index + 1, 0, NEW_STEP[kind](id));
    update({ ...def, steps });
    onSelect(id);
  };
  const stepIssues = issues.filter((i) => i.stepId === step.id);
  const estimate = useEstimate(wizardId, def);
  return (
    <div>
      <div className="flex items-center gap-2 px-5 py-4">
        <span
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-md",
            TYPE_TONE[step.type],
          )}
        >
          <Icon className="size-4" />
        </span>
        <span className="font-medium text-[12px] text-ink-3 uppercase tracking-[0.07em]">
          {typeLabel(step)}
        </span>
        <span className="ml-auto font-mono text-[11px] text-ink-4">{step.id}</span>
      </div>
      {stepIssues.length ? (
        <div className="mx-5 mb-4 rounded-lg bg-rose-tint px-3 py-2 text-[13px] text-rose">
          {stepIssues.map((i, k) => (
            <div key={k}>{i.message}</div>
          ))}
        </div>
      ) : null}
      <Section>
        <Input
          value={step.title}
          onChange={(e) => set({ ...step, title: e.target.value })}
          className="font-display font-semibold text-[16px]"
        />
        {step.type === "page" || step.type === "review" ? (
          <Textarea
            minRows={1}
            placeholder="Erklärung unter dem Titel (optional)"
            value={step.description ?? ""}
            onChange={(e) => set({ ...step, description: e.target.value || undefined })}
          />
        ) : null}
        <StepCost estimate={estimate.data} stepId={step.id} />
      </Section>
      <StepBody
        def={def}
        step={step}
        set={set}
        mcpServers={mcpServers}
        files={files}
        wizardId={wizardId}
      />
      <Section>
        <div className="flex flex-wrap items-center gap-1">
          {step.type !== "result" ? (
            <>
              <IconButton label={t("editor.moveUp")} onClick={() => move(-1)}>
                <ArrowUp className="size-4" />
              </IconButton>
              <IconButton label={t("editor.moveDown")} onClick={() => move(1)}>
                <ArrowDown className="size-4" />
              </IconButton>
              <IconButton
                label={t("editor.deleteStep")}
                className="hover:text-rose"
                onClick={() => {
                  update({ ...def, steps: def.steps.filter((s) => s.id !== step.id) });
                  onSelect(null);
                }}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </>
          ) : null}
          <span className="ml-auto text-[12px] text-ink-4">Danach einfügen:</span>
          {(["page", "agent", "generate", "widget"] as const).map((k) => (
            <button
              key={k}
              type="button"
              onClick={() => insertAfter(k)}
              className="inline-flex h-8 items-center gap-1 rounded-full px-2.5 text-[12px] text-ink-2 hover:bg-accent"
            >
              <Plus className="size-3.5" /> {t(`type.${k}`)}
            </button>
          ))}
        </div>
      </Section>
    </div>
  );
}
