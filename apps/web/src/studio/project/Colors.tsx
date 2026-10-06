import type { BrandColor } from "@engenty-wizards/shared/projects";
import { PROJECT_LIMITS } from "@engenty-wizards/shared/projects";
import { ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { Button, Chip, Dialog, IconButton, Input, Label, Swatch } from "../../ui";
import { useAutosave } from "./data";
import { Section } from "./Section";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** A new colour: its value and what it is for, then it joins the list. */
function AddColor({ onAdd, onClose }: { onAdd: (color: BrandColor) => void; onClose: () => void }) {
  const [value, setValue] = useState("#e0531b");
  const [name, setName] = useState("");
  const valid = HEX.test(value);
  return (
    <Dialog open onClose={onClose} title={t("project.colorAddTitle")}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (valid) {
            onAdd({ name: name.trim(), value: value.toLowerCase() });
            onClose();
          }
        }}
        className="flex flex-col gap-5"
      >
        <div>
          <Label>{t("project.colorValue")}</Label>
          <div className="flex items-center gap-2">
            <Swatch value={valid ? value : "#888888"} onChange={(e) => setValue(e.target.value)} />
            <Input
              value={value}
              placeholder="#e0531b"
              spellCheck={false}
              onChange={(e) => setValue(e.target.value.trim())}
              className="font-mono text-[0.875rem]"
            />
          </div>
        </div>
        <div>
          <Label>{t("project.colorUseLabel")}</Label>
          <Input
            autoFocus
            value={name}
            maxLength={120}
            placeholder={t("project.colorName")}
            onChange={(e) => setName(e.target.value)}
          />
          <p className="mt-1.5 text-[0.8125rem] text-ink-3">{t("project.colorUse")}</p>
        </div>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={onClose}>
            {t("common.cancel")}
          </Button>
          <Button type="submit" disabled={!valid}>
            {t("project.add")}
          </Button>
        </div>
      </form>
    </Dialog>
  );
}

/** The brand's colours by name; the first one is the accent. */
export function Colors({
  colors,
  save,
  readOnly,
}: {
  colors: BrandColor[];
  save: (colors: BrandColor[]) => Promise<unknown>;
  /** The colours are there to see: no value is changed, none added, moved or removed. */
  readOnly?: boolean;
}) {
  const next = useRef(0);
  const [rows, setRows] = useState(() => colors.map((c) => ({ ...c, id: `c${next.current++}` })));
  const [adding, setAdding] = useState(false);
  // A value still being typed is not a colour yet: it is saved once it is one.
  const status = useAutosave(
    rows.filter((r) => HEX.test(r.value)).map(({ name, value }) => ({ name: name.trim(), value })),
    save,
  );
  const set = (id: string, patch: Partial<BrandColor>) =>
    setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <Section
      title={t("project.colors")}
      hint={t("project.colorsHint")}
      save={status}
      locked={readOnly}
    >
      <div className="flex flex-col gap-2">
        {rows.map((row, i) => (
          <div key={row.id} className="flex items-center gap-2">
            <Swatch
              value={HEX.test(row.value) ? row.value : "#888888"}
              onChange={(e) => set(row.id, { value: e.target.value })}
            />
            <Input
              value={row.name}
              placeholder={t("project.colorName")}
              maxLength={120}
              onChange={(e) => set(row.id, { name: e.target.value })}
              className="min-w-0 flex-1"
            />
            <Input
              value={row.value}
              placeholder="#e0531b"
              spellCheck={false}
              onChange={(e) => set(row.id, { value: e.target.value.trim() })}
              className="w-28 font-mono text-[0.8125rem]"
            />
            <div className="flex w-24 shrink-0 items-center justify-end max-sm:w-auto">
              {i === 0 ? (
                <span className="mr-1 max-sm:hidden">
                  <Chip tone="ember">{t("project.colorAccent")}</Chip>
                </span>
              ) : readOnly ? null : (
                <IconButton
                  label={t("project.colorFirst")}
                  onClick={() => setRows((all) => [row, ...all.filter((r) => r.id !== row.id)])}
                >
                  <ArrowUp className="size-4" />
                </IconButton>
              )}
              {readOnly ? null : (
                <IconButton
                  label={t("project.remove")}
                  onClick={() => setRows((all) => all.filter((r) => r.id !== row.id))}
                  className="hover:text-rose"
                >
                  <Trash2 className="size-4" />
                </IconButton>
              )}
            </div>
          </div>
        ))}
      </div>
      {rows.length && !readOnly ? (
        <p className="mt-1.5 text-[0.8125rem] text-ink-3">{t("project.colorUse")}</p>
      ) : null}
      {rows.length < PROJECT_LIMITS.colors && !readOnly ? (
        <Button
          variant="secondary"
          size="sm"
          className={rows.length ? "mt-3" : undefined}
          onClick={() => setAdding(true)}
        >
          <Plus className="size-4" /> {t("project.colorAdd")}
        </Button>
      ) : null}
      {adding ? (
        <AddColor
          onClose={() => setAdding(false)}
          onAdd={(color) => setRows((all) => [...all, { ...color, id: `c${next.current++}` }])}
        />
      ) : null}
    </Section>
  );
}
