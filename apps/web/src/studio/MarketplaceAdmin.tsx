import {
  INDUSTRIES,
  type Industry,
  ITEM_FORMATS,
  type ItemFormat,
  type ItemStatus,
  MARKETPLACE_LANGS,
  type MarketplaceAdminEntry,
  type MarketplaceLang,
  USE_CASES,
  type UseCase,
} from "@engenty-wizards/shared/marketplace";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Languages, Pencil, Plus, RefreshCw, Trash2 } from "lucide-react";
import { useState } from "react";
import { Mascot } from "../brand";
import { api } from "../lib/api";
import { lang, t } from "../lib/i18n";
import { useCurrentProject, useMe, type WizardSummary } from "../lib/session";
import { Button, Card, Chip, cn, Dialog, IconButton, Input, Label, Select, Textarea } from "../ui";

const STATUSES: ItemStatus[] = ["published", "unlisted", "draft"];
const LANG_NAMES: Record<MarketplaceLang, string> = { de: "Deutsch", en: "English" };

type Labels = Record<string, { de: string; en: string }>;

/** Pills to pick several of a fixed set. */
function Picks<T extends string>({
  labels,
  value,
  onChange,
}: {
  labels: Labels;
  value: T[];
  onChange: (next: T[]) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {(Object.keys(labels) as T[]).map((id) => {
        const on = value.includes(id);
        return (
          <button
            key={id}
            type="button"
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((v) => v !== id) : [...value, id])}
            className={cn(
              "h-8 rounded-full border px-3 text-[13px] transition coarse:h-10",
              on
                ? "border-ember bg-ember-tint text-ink"
                : "border-input bg-card text-ink-2 hover:border-ink-4 hover:text-ink",
            )}
          >
            {labels[id][lang]}
          </button>
        );
      })}
    </div>
  );
}

interface Listing {
  status: ItemStatus;
  title: string;
  pitch: string;
  formats: ItemFormat[];
  industries: Industry[];
  useCases: UseCase[];
  position: number;
}

function ListingFields({ value, onChange }: { value: Listing; onChange: (v: Listing) => void }) {
  return (
    <div className="flex flex-col gap-4">
      <div>
        <Label>{t("market.title")}</Label>
        <Input
          value={value.title}
          onChange={(e) => onChange({ ...value, title: e.target.value })}
        />
      </div>
      <div>
        <Label>{t("market.pitch")}</Label>
        <Textarea
          minRows={2}
          value={value.pitch}
          onChange={(e) => onChange({ ...value, pitch: e.target.value })}
        />
      </div>
      <div>
        <Label>{t("market.useCase")}</Label>
        <Picks
          labels={USE_CASES}
          value={value.useCases}
          onChange={(useCases) => onChange({ ...value, useCases })}
        />
      </div>
      <div>
        <Label>{t("market.industry")}</Label>
        <Picks
          labels={INDUSTRIES}
          value={value.industries}
          onChange={(industries) => onChange({ ...value, industries })}
        />
      </div>
      <div>
        <Label>{t("market.format")}</Label>
        <Picks
          labels={ITEM_FORMATS}
          value={value.formats}
          onChange={(formats) => onChange({ ...value, formats })}
        />
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>{t("market.status")}</Label>
          <Select
            value={value.status}
            onChange={(status) => onChange({ ...value, status: status as ItemStatus })}
            options={STATUSES.map((s) => ({ value: s, label: t(`market.status.${s}`) }))}
          />
        </div>
        <div>
          <Label>{t("market.position")}</Label>
          <Input
            type="number"
            value={value.position}
            onChange={(e) => onChange({ ...value, position: Number(e.target.value) || 0 })}
          />
        </div>
      </div>
    </div>
  );
}

const valid = (l: Listing) => Boolean(l.title.trim() && l.industries.length && l.formats.length);

function EditDialog({ entry, onClose }: { entry: MarketplaceAdminEntry; onClose: () => void }) {
  const qc = useQueryClient();
  const [value, setValue] = useState<Listing>({
    status: entry.status,
    title: entry.title,
    pitch: entry.pitch,
    formats: entry.formats,
    industries: entry.industries,
    useCases: entry.useCases,
    position: entry.position,
  });
  // Title and pitch are the entry's own words; a translation shown here is not edited.
  const own = entry.language === entry.sourceLanguage;
  const save = useMutation({
    mutationFn: () => {
      const { title, pitch, ...rest } = value;
      return api.patch(`/api/studio/marketplace/admin/${entry.id}`, {
        ...rest,
        ...(own ? { title, pitch } : {}),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["marketplace"] });
      await qc.invalidateQueries({ queryKey: ["marketplace-admin"] });
      onClose();
    },
  });
  return (
    <Dialog open onClose={onClose} title={entry.title} wide>
      <ListingFields value={value} onChange={setValue} />
      {save.error ? (
        <p className="mt-3 text-[14px] text-rose">{(save.error as Error).message}</p>
      ) : null}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button busy={save.isPending} disabled={!valid(value)} onClick={() => save.mutate()}>
          {t("market.save")}
        </Button>
      </div>
    </Dialog>
  );
}

function AddDialog({
  entries,
  onClose,
}: {
  entries: MarketplaceAdminEntry[];
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const { project } = useCurrentProject();
  const wizards = useQuery({
    queryKey: ["wizards", project?.id],
    queryFn: () => api.get<WizardSummary[]>(`/api/studio/projects/${project!.id}/wizards`),
    enabled: Boolean(project),
  });
  const [wizardId, setWizardId] = useState("");
  const [itemId, setItemId] = useState("");
  const [language, setLanguage] = useState<MarketplaceLang>(lang);
  const [value, setValue] = useState<Listing>({
    status: "draft",
    title: "",
    pitch: "",
    formats: [],
    industries: ["any"],
    useCases: [],
    position: 1000,
  });
  const pick = (id: string) => {
    setWizardId(id);
    const w = wizards.data?.find((x) => x.id === id);
    if (w && !itemId) {
      setValue((v) => ({ ...v, title: w.title, pitch: w.description }));
    }
  };
  const replace = (id: string) => {
    setItemId(id);
    const e = entries.find((x) => x.id === id);
    if (e) {
      setValue({
        status: e.status,
        title: e.title,
        pitch: e.pitch,
        formats: e.formats,
        industries: e.industries,
        useCases: e.useCases,
        position: e.position,
      });
      setLanguage(e.sourceLanguage);
    }
  };
  const add = useMutation({
    mutationFn: () => {
      // No formats picked: they follow from what the wizard hands over.
      const { formats, ...rest } = value;
      return api.post("/api/studio/marketplace/admin", {
        wizardId,
        ...(itemId ? { itemId } : {}),
        language,
        ...rest,
        ...(formats.length ? { formats } : {}),
      });
    },
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["marketplace"] });
      await qc.invalidateQueries({ queryKey: ["marketplace-admin"] });
      onClose();
    },
  });
  return (
    <Dialog open onClose={onClose} title={t("market.add")} wide>
      <p className="mb-5 text-[14px] text-ink-3">{t("market.addHint")}</p>
      <div className="mb-4 grid gap-4 sm:grid-cols-2">
        <div>
          <Label>{t("market.wizard")}</Label>
          <Select
            value={wizardId}
            onChange={pick}
            placeholder="–"
            options={(wizards.data ?? []).map((w) => ({ value: w.id, label: w.title }))}
          />
        </div>
        <div>
          <Label>{t("market.replace")}</Label>
          <Select
            value={itemId}
            onChange={replace}
            placeholder={t("market.newEntry")}
            options={entries.map((e) => ({ value: e.id, label: e.title }))}
          />
        </div>
        <div>
          <Label>{t("market.language")}</Label>
          <Select
            value={language}
            onChange={(v) => setLanguage(v as MarketplaceLang)}
            options={MARKETPLACE_LANGS.map((l) => ({ value: l, label: LANG_NAMES[l] }))}
          />
        </div>
      </div>
      <ListingFields value={value} onChange={setValue} />
      {add.error ? (
        <p className="mt-3 text-[14px] text-rose">{(add.error as Error).message}</p>
      ) : null}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          busy={add.isPending}
          disabled={!wizardId || !value.title.trim() || !value.industries.length}
          onClick={() => add.mutate()}
        >
          {t("market.save")}
        </Button>
      </div>
    </Dialog>
  );
}

function Row({ entry, onEdit }: { entry: MarketplaceAdminEntry; onEdit: () => void }) {
  const qc = useQueryClient();
  const refresh = async () => {
    await qc.invalidateQueries({ queryKey: ["marketplace"] });
    await qc.invalidateQueries({ queryKey: ["marketplace-admin"] });
  };
  const missing = MARKETPLACE_LANGS.filter((l) => !entry.languages.includes(l));
  const translate = useMutation({
    mutationFn: (language: MarketplaceLang) =>
      api.post(`/api/studio/marketplace/admin/${entry.id}/translate`, { language }),
    onSuccess: refresh,
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/api/studio/marketplace/admin/${entry.id}`),
    onSuccess: refresh,
  });
  return (
    <li className="flex flex-col gap-2 py-4 sm:flex-row sm:items-center sm:gap-4">
      <Mascot kind={entry.avatar} size={40} interactive={false} />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-display font-semibold text-[15px]">{entry.title}</span>
          <Chip tone={entry.status === "published" ? "live" : "neutral"}>
            {t(`market.status.${entry.status}`)}
          </Chip>
          {!entry.usable ? <Chip tone="warn">{t("market.needsUpdate")}</Chip> : null}
        </div>
        <div className="mt-1 text-[13px] text-ink-3">
          {[
            t(`market.origin.${entry.origin}`),
            t("market.revision", { n: entry.revision }),
            entry.languages.map((l) => l.toUpperCase()).join(" · "),
            t("market.installs", { n: entry.installs }),
            ...entry.useCases.map((u) => USE_CASES[u][lang]),
            ...entry.industries.map((i) => INDUSTRIES[i][lang]),
          ].join(" · ")}
        </div>
        {translate.error || remove.error ? (
          <p className="mt-1 text-[13px] text-rose">
            {((translate.error ?? remove.error) as Error).message}
          </p>
        ) : null}
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {missing.map((l) => (
          <Button
            key={l}
            variant="ghost"
            busy={translate.isPending && translate.variables === l}
            disabled={translate.isPending}
            onClick={() => translate.mutate(l)}
          >
            <Languages className="size-4" /> {t("market.translate", { lang: LANG_NAMES[l] })}
          </Button>
        ))}
        <IconButton label={t("market.edit")} onClick={onEdit}>
          <Pencil className="size-4" />
        </IconButton>
        <IconButton
          label={t("market.remove")}
          onClick={() => confirm(`${t("market.remove")}: ${entry.title}?`) && remove.mutate()}
        >
          <Trash2 className="size-4" />
        </IconButton>
      </div>
    </li>
  );
}

/** The marketplace as its admins keep it: every entry, listed or not, and a way to add one. */
export function MarketplaceAdmin() {
  const qc = useQueryClient();
  const me = useMe();
  const entries = useQuery({
    queryKey: ["marketplace-admin", lang],
    queryFn: () => api.get<MarketplaceAdminEntry[]>(`/api/studio/marketplace/admin?lang=${lang}`),
  });
  const [editing, setEditing] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const sync = useMutation({
    mutationFn: () => api.post("/api/studio/marketplace/admin/sync"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["marketplace-admin"] }),
  });
  const list = entries.data ?? [];
  const edited = list.find((e) => e.id === editing);
  return (
    <Card className="p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="font-display font-semibold text-lg">{t("market.admin")}</h2>
          <p className="mt-1 text-[14px] text-ink-3">{t("market.adminHint")}</p>
        </div>
        <div className="flex gap-2">
          {me.data?.mode === "local" ? (
            <Button variant="secondary" busy={sync.isPending} onClick={() => sync.mutate()}>
              <RefreshCw className="size-4" /> {t("market.sync")}
            </Button>
          ) : null}
          <Button onClick={() => setAdding(true)}>
            <Plus className="size-4" /> {t("market.add")}
          </Button>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-border-soft">
        {list.map((e) => (
          <Row key={e.id} entry={e} onEdit={() => setEditing(e.id)} />
        ))}
      </ul>
      {edited ? <EditDialog entry={edited} onClose={() => setEditing(null)} /> : null}
      {adding ? <AddDialog entries={list} onClose={() => setAdding(false)} /> : null}
    </Card>
  );
}
