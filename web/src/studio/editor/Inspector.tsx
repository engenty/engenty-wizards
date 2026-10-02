import {
  ASPECT_RATIOS,
  ENGENTY_KINDS,
  FIELD_KINDS,
  type Field,
  type Format,
  formatsFor,
  type Step,
  TOOL_IDS,
  type WizardDefinition,
} from "@shared/definition";
import { ArrowDown, ArrowUp, ChevronDown, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { Mascot } from "../../brand";
import { t } from "../../lib/i18n";
import { cn, IconButton, Input, Label, Segmented, Select, Switch, Textarea } from "../../ui";
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
};

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
  field,
  onChange,
  onRemove,
  onMove,
}: {
  field: Field;
  onChange: (f: Field) => void;
  onRemove: () => void;
  onMove: (dir: -1 | 1) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-xl bg-paper ring-1 ring-border-soft">
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
            onChange={(v) => onChange({ ...field, kind: v as Field["kind"] })}
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
          {["text", "textarea", "number", "email", "url"].includes(field.kind) ? (
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

function StepBody({
  def,
  step,
  set,
  mcpServers,
}: {
  def: WizardDefinition;
  step: Step;
  set: (s: Step) => void;
  mcpServers: { id: string; name: string }[];
}) {
  const index = def.steps.indexOf(step);
  const earlierProducers = def.steps
    .slice(0, index)
    .filter((s) => s.type === "agent" || s.type === "generate");
  switch (step.type) {
    case "page":
      return (
        <Section title="Fragen">
          <div className="flex flex-col gap-2">
            {step.fields.map((f, i) => (
              <FieldEditor
                key={f.id}
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
            <div className="flex items-center justify-between">
              <span className="text-[13px] text-ink-2">Stärkeres Modell</span>
              <Switch
                checked={step.model !== "fast"}
                onChange={(v) => set({ ...step, model: v ? "smart" : "fast" })}
              />
            </div>
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
              options={["image", "video", "document", "dashboard"]}
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
                <div key={s.id} className="rounded-xl bg-paper p-3 ring-1 ring-border-soft">
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
                "flex aspect-square items-center justify-center rounded-2xl transition",
                def.avatar === k ? "bg-ember-tint ring-2 ring-ember" : "bg-paper hover:bg-paper-2",
              )}
              aria-label={k}
            >
              <Mascot kind={k} size={44} interactive={false} />
            </button>
          ))}
        </div>
      </Section>
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
};

export function Inspector({
  def,
  selected,
  update,
  onSelect,
  issues,
  mcpServers,
}: {
  def: WizardDefinition;
  selected: string | null;
  update: Update;
  onSelect: (id: string | null) => void;
  issues: { stepId?: string; message: string }[];
  mcpServers: { id: string; name: string }[];
}) {
  if (selected === "__wizard") {
    return <WizardSettings def={def} update={update} />;
  }
  const step = def.steps.find((s) => s.id === selected);
  if (!step) {
    return (
      <div className="px-6 py-10 text-center text-[14px] text-ink-3">{t("editor.selectStep")}</div>
    );
  }
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
    const id = uniqueId(def, kind === "page" ? "seite" : kind === "agent" ? "ki" : "erzeugen");
    const steps = [...def.steps];
    steps.splice(step.type === "result" ? index : index + 1, 0, NEW_STEP[kind](id));
    update({ ...def, steps });
    onSelect(id);
  };
  const stepIssues = issues.filter((i) => i.stepId === step.id);
  return (
    <div>
      <div className="flex items-center gap-2 px-5 pt-5">
        <span
          className={cn(
            "inline-flex size-7 items-center justify-center rounded-lg",
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
        <div className="mx-5 mt-3 rounded-xl bg-rose-tint px-3 py-2 text-[13px] text-rose">
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
      </Section>
      <StepBody def={def} step={step} set={set} mcpServers={mcpServers} />
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
          {(["page", "agent", "generate"] as const).map((k) => (
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
