import type { BrandColor } from "@engenty-wizards/shared/projects";
import { PROJECT_LIMITS } from "@engenty-wizards/shared/projects";
import { ArrowUp, Plus, Trash2 } from "lucide-react";
import { useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { Button, Chip, IconButton, Input, Swatch } from "../../ui";
import { useAutosave } from "./data";
import { Section } from "./Section";

const HEX = /^#[0-9a-fA-F]{6}$/;

/** The brand's colours by name; the first one is the accent. */
export function Colors({
  colors,
  save,
}: {
  colors: BrandColor[];
  save: (colors: BrandColor[]) => Promise<unknown>;
}) {
  const next = useRef(0);
  const [rows, setRows] = useState(() => colors.map((c) => ({ ...c, id: `c${next.current++}` })));
  // A value still being typed is not a colour yet: it is saved once it is one.
  const status = useAutosave(
    rows.filter((r) => HEX.test(r.value)).map(({ name, value }) => ({ name: name.trim(), value })),
    save,
  );
  const set = (id: string, patch: Partial<BrandColor>) =>
    setRows((all) => all.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  return (
    <Section title={t("project.colors")} hint={t("project.colorsHint")} save={status}>
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
              onChange={(e) => set(row.id, { name: e.target.value })}
              className="min-w-0 flex-1"
            />
            <Input
              value={row.value}
              placeholder="#e0531b"
              spellCheck={false}
              onChange={(e) => set(row.id, { value: e.target.value.trim() })}
              className="w-28 font-mono text-[13px]"
            />
            <div className="flex w-24 shrink-0 items-center justify-end max-sm:w-auto">
              {i === 0 ? (
                <span className="mr-1 max-sm:hidden">
                  <Chip tone="ember">{t("project.colorAccent")}</Chip>
                </span>
              ) : (
                <IconButton
                  label={t("project.colorFirst")}
                  onClick={() => setRows((all) => [row, ...all.filter((r) => r.id !== row.id)])}
                >
                  <ArrowUp className="size-4" />
                </IconButton>
              )}
              <IconButton
                label={t("project.remove")}
                onClick={() => setRows((all) => all.filter((r) => r.id !== row.id))}
                className="hover:text-rose"
              >
                <Trash2 className="size-4" />
              </IconButton>
            </div>
          </div>
        ))}
      </div>
      {rows.length < PROJECT_LIMITS.colors ? (
        <Button
          variant="secondary"
          size="sm"
          className={rows.length ? "mt-3" : undefined}
          onClick={() =>
            setRows((all) => [...all, { id: `c${next.current++}`, name: "", value: "#e0531b" }])
          }
        >
          <Plus className="size-4" /> {t("project.colorAdd")}
        </Button>
      ) : null}
    </Section>
  );
}
