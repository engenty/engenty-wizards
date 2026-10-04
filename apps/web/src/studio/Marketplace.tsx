import type { StepType } from "@engenty-wizards/shared/definition";
import {
  CAPABILITIES,
  type Capability,
  COST_TIERS,
  INDUSTRIES,
  type Industry,
  ITEM_FORMATS,
  type ItemFormat,
  type MarketplaceEntry,
  USE_CASES,
  type UseCase,
} from "@engenty-wizards/shared/marketplace";
import { isSentence, rankEntries } from "@engenty-wizards/shared/marketplace-search";
import { useQuery } from "@tanstack/react-query";
import {
  AppWindow,
  AudioLines,
  Bot,
  ChartColumn,
  Check,
  ChevronDown,
  CircleDollarSign,
  CircleEuro,
  Clapperboard,
  Clock,
  Coins,
  Eye,
  FileText,
  Flag,
  Globe,
  Image as ImageIcon,
  ListChecks,
  type LucideIcon,
  Mic,
  MousePointerClick,
  PenLine,
  Plug,
  ScanText,
  Search,
  Sparkles,
  Split,
  Table2,
  Terminal,
  Type,
  Video,
  Volume2,
  Wand2,
  X,
} from "lucide-react";
import { type CSSProperties, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Mascot } from "../brand";
import type { EngentyKind } from "../engenty/colors";
import { api } from "../lib/api";
import { lang, t } from "../lib/i18n";
import { stageFill } from "../lib/theme";
import { Button, Card, Chip, cn, Dialog, Spinner } from "../ui";
import { TYPE_TONE } from "./editor/meta";

/** A step as the flow shows it: what happens there, not how. */
interface OutlineStep {
  id: string;
  type: string;
  title: string;
  /** What a generate step makes. */
  asset?: string;
  /** A widget step that cuts a film. */
  video?: boolean;
  /** Where the flow goes on instead of the next step, and when. `to` is a step's id or `end`. */
  branches?: { to: string; when: string }[];
}

/** One entry with what the gallery shows of its wizard. */
interface EntryDetail extends MarketplaceEntry {
  description: string;
  outline: OutlineStep[];
  /** What a person takes along at the end: each thing by name, with the files it comes as. */
  results: { title: string; kind: ItemFormat; formats: string[] }[];
  files: string[];
}

interface Filters {
  useCase: UseCase | "";
  industry: Industry | "";
  format: ItemFormat | "";
}
const NO_FILTERS: Filters = { useCase: "", industry: "", format: "" };

type Labels = Record<string, { de: string; en: string }>;
const label = (labels: Labels, id: string) => labels[id]?.[lang] ?? id;

/** An estimate as one says it: one significant digit — 111 is "about 100", 27 "about 30". */
function roughly(credits: number): number {
  if (credits < 1) {
    return 1;
  }
  const unit = 10 ** Math.floor(Math.log10(credits));
  return Math.round(credits / unit) * unit;
}

function costLine(e: MarketplaceEntry): string {
  return e.credits
    ? t("market.credits", { n: roughly(e.credits.credits) })
    : COST_TIERS[e.costTier][lang];
}

const FORMAT_ICONS: Record<ItemFormat, LucideIcon> = {
  text: Type,
  document: FileText,
  table: Table2,
  image: ImageIcon,
  video: Video,
  audio: AudioLines,
  dashboard: ChartColumn,
};

/** A format as its icon; the name is there for a pointer and a screen reader. */
function FormatIcon({ format, className }: { format: ItemFormat; className?: string }) {
  const Icon = FORMAT_ICONS[format];
  const name = label(ITEM_FORMATS, format);
  return (
    <span title={name} className="inline-flex">
      <Icon className={className} aria-label={name} role="img" />
    </span>
  );
}

const TIERS = ["low", "medium", "high"] as const;

/** One, two or three coins for a cheap, a medium and an expensive run. */
function CostCoins({ entry }: { entry: MarketplaceEntry }) {
  const coins = TIERS.indexOf(entry.costTier) + 1;
  // A euro where the app speaks German, a dollar where it speaks English.
  const Coin = lang === "de" ? CircleEuro : CircleDollarSign;
  return (
    <span title={costLine(entry)} className="inline-flex items-center gap-1">
      <span aria-hidden="true" className="inline-flex shrink-0">
        {TIERS.slice(0, coins).map((tier, i) => (
          // Each coin lies half over the one before it.
          <span
            key={tier}
            className={cn("rounded-full bg-(--coin-bg,var(--color-card))", i > 0 && "-ml-1.5")}
          >
            <Coin className="size-4" />
          </span>
        ))}
      </span>
      {COST_TIERS[entry.costTier][lang]}
    </span>
  );
}

export function useMarketplace(source: "studio" | "public") {
  return useQuery({
    queryKey: ["marketplace", source, lang],
    queryFn: () =>
      api.get<MarketplaceEntry[]>(
        `${source === "studio" ? "/api/studio/marketplace" : "/api/public/marketplace"}?lang=${lang}`,
      ),
  });
}

function EntryCard({ entry, onOpen }: { entry: MarketplaceEntry; onOpen: () => void }) {
  return (
    <Card
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onOpen();
        }
      }}
      className={cn(
        "relative flex min-h-[124px] cursor-pointer flex-col gap-5 p-4 text-left transition sm:min-h-[136px] sm:p-5 hover:shadow-elevated focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        !entry.usable && "opacity-60",
      )}
    >
      {/* engenty sits on the card's corner, a little over its edge. */}
      <span className="-top-4 pointer-events-none absolute right-4">
        <Mascot kind={entry.avatar} size={68} interactive={false} />
      </span>
      <div className="min-w-0 pr-20">
        <div className="font-display font-semibold text-[15px]">{entry.title}</div>
        <div className="mt-0.5 text-[13px] text-ink-3 leading-snug">{entry.pitch}</div>
      </div>
      <div className="mt-auto flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[12px] text-ink-3">
        {entry.usable ? (
          <>
            <span className="inline-flex items-center gap-1">
              <Clock className="size-3.5" /> {t("market.minutes", { n: entry.effort.minutes })}
            </span>
            <CostCoins entry={entry} />
            <span className="ml-auto inline-flex items-center gap-1.5">
              {entry.formats.map((f) => (
                <FormatIcon key={f} format={f} className="size-4" />
              ))}
            </span>
          </>
        ) : (
          <Chip tone="warn">{t("market.needsUpdate")}</Chip>
        )}
      </div>
    </Card>
  );
}

function Fact({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div>
      <div className="mb-1.5 font-medium text-[12px] text-ink-3 uppercase tracking-[0.06em]">
        {title}
      </div>
      {children}
    </div>
  );
}

const CAPABILITY_ICONS: Record<Capability, LucideIcon> = {
  text: PenLine,
  web: Globe,
  browser: MousePointerClick,
  documents: ScanText,
  image: ImageIcon,
  video: Video,
  speech: Volume2,
  listening: Mic,
  code: Terminal,
  connectors: Plug,
};

/** A step of the flow as its icon: what the person or the wizard does there. */
function stepIcon(step: OutlineStep): LucideIcon {
  switch (step.type) {
    case "page":
      return ListChecks;
    case "agent":
      return Bot;
    case "generate":
      return step.asset === "image"
        ? ImageIcon
        : step.asset === "video"
          ? Video
          : step.asset === "voice"
            ? Volume2
            : step.asset === "dashboard"
              ? ChartColumn
              : FileText;
    case "widget":
      return step.video ? Clapperboard : AppWindow;
    case "review":
      return Eye;
    case "result":
      return Flag;
  }
  return Wand2;
}

/** The steps a branch jumps over: they only run when the branch is not taken. */
function skippable(steps: OutlineStep[]): Set<string> {
  const skipped = new Set<string>();
  for (const [from, step] of steps.entries()) {
    for (const branch of step.branches ?? []) {
      const to = branch.to === "end" ? steps.length : steps.findIndex((s) => s.id === branch.to);
      for (let i = from + 1; i < to; i++) {
        skipped.add(steps[i].id);
      }
    }
  }
  return skipped;
}

function Flow({ steps }: { steps: OutlineStep[] }) {
  const optional = skippable(steps);
  return (
    <ol className="flex flex-col">
      {steps.map((s, i) => {
        const Icon = stepIcon(s);
        const last = i === steps.length - 1;
        return (
          <li key={s.id} className="relative flex gap-3 pb-3 last:pb-0">
            {/* The line to the next step; dashed where the step may be jumped over. */}
            {last ? null : (
              <span
                aria-hidden="true"
                className={cn(
                  "absolute top-7 bottom-0 left-3.5 border-border border-l",
                  optional.has(steps[i + 1].id) && "border-dashed",
                )}
              />
            )}
            <span
              className={cn(
                "relative flex size-7 shrink-0 items-center justify-center rounded-full",
                TYPE_TONE[s.type as StepType] ?? "bg-paper-2 text-ink-2",
                optional.has(s.id) && "outline-dashed outline-1 outline-ink-4 outline-offset-2",
              )}
            >
              <Icon className="size-3.5" />
            </span>
            <div className="min-w-0 pt-1">
              <div className="flex flex-wrap items-center gap-x-2 text-[14px] text-ink leading-snug">
                {s.title}
                {optional.has(s.id) ? (
                  <span className="text-[12px] text-ink-3">{t("market.optional")}</span>
                ) : null}
              </div>
              {(s.branches ?? []).map((b) => (
                <div
                  key={`${b.to}:${b.when}`}
                  className="mt-1 flex items-start gap-1.5 text-[12px] text-ink-3 leading-snug"
                >
                  <Split className="mt-0.5 size-3.5 shrink-0 rotate-90 text-ember" />
                  <span>
                    <span className="font-medium text-ink-2">{b.when}</span>
                    {" → "}
                    {steps.find((x) => x.id === b.to)?.title ?? t("market.end")}
                  </span>
                </div>
              ))}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** One of the header's three values; a thin line parts it from the one before. */
function HeaderFact({ title, children }: { title: string; children: ReactNode }) {
  return (
    <span
      title={title}
      className="inline-flex items-center gap-2 border-white/20 border-l px-4 first:border-l-0 first:pl-0"
    >
      {children}
    </span>
  );
}

/** A line of the main area's facts: an icon, what it is, and a second line that says more. */
function Detail({
  icon,
  children,
  more,
}: {
  icon: ReactNode;
  children: ReactNode;
  more?: ReactNode;
}) {
  return (
    <div className="flex gap-2.5">
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">
        <div className="text-[14px] text-ink leading-snug">{children}</div>
        {more ? <div className="text-[12px] text-ink-3 leading-snug">{more}</div> : null}
      </div>
    </div>
  );
}

/**
 * A column that scrolls when it is clipped, and fades out at the edge more of it lies behind.
 */
function FadeScroll({ className, children }: { className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [more, setMore] = useState({ above: false, below: false });
  useEffect(() => {
    const el = ref.current;
    if (!el) {
      return;
    }
    const measure = () => {
      const above = el.scrollTop > 1;
      const below = el.scrollTop + el.clientHeight < el.scrollHeight - 1;
      setMore((m) => (m.above === above && m.below === below ? m : { above, below }));
    };
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (el.firstElementChild) {
      observer.observe(el.firstElementChild);
    }
    return () => {
      el.removeEventListener("scroll", measure);
      observer.disconnect();
    };
  }, []);
  const mask = `linear-gradient(to bottom, ${more.above ? "transparent" : "black"} 0, black 28px, black calc(100% - 44px), ${more.below ? "transparent" : "black"} 100%)`;
  return (
    <div ref={ref} className={className} style={{ maskImage: mask, WebkitMaskImage: mask }}>
      <div>{children}</div>
    </div>
  );
}

function EntryDialog({
  entry,
  onClose,
  onUse,
  busy,
}: {
  entry: MarketplaceEntry | null;
  onClose: () => void;
  onUse: (entry: MarketplaceEntry) => void;
  busy?: boolean;
}) {
  const detail = useQuery({
    queryKey: ["marketplace-entry", entry?.id, entry?.revision, lang],
    queryFn: () => api.get<EntryDetail>(`/api/public/marketplace/${entry!.id}?lang=${lang}`),
    enabled: Boolean(entry?.usable),
    retry: false,
  });
  // The stage the entry's engenty stands on: its own colour, deep.
  const stage = stageFill((entry?.avatar || "round") as EngentyKind);
  return (
    <Dialog open={Boolean(entry)} onClose={onClose} wide bare>
      {entry ? (
        // As high as the window allows: the header and the buttons stay, the flow scrolls.
        // On a phone the panel is the whole screen.
        <div className="relative flex max-h-[calc(100dvh-48px)] flex-col rounded-2xl bg-card shadow-overlay max-sm:h-dvh max-sm:max-h-none max-sm:rounded-none">
          <button
            type="button"
            aria-label={t("common.close")}
            onClick={onClose}
            className="sm:-top-3.5 sm:-right-3.5 absolute top-3 right-3 z-20 flex size-9 items-center justify-center rounded-full bg-card text-ink-2 shadow-elevated ring-1 ring-border-soft transition hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus"
          >
            <X className="size-4" />
          </button>
          <header
            className="relative shrink-0 px-5 pt-5 pb-4 text-white sm:rounded-t-2xl sm:px-7"
            style={{ background: stage, "--coin-bg": stage } as CSSProperties}
          >
            {/* Soft spotlights, as on the landing page: light from the top right, a glow low left. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 overflow-hidden sm:rounded-t-2xl"
            >
              <span className="-top-24 -right-16 absolute size-72 rounded-full bg-white opacity-20 blur-3xl" />
              <span className="-bottom-32 -left-20 absolute size-72 rounded-full bg-white opacity-10 blur-3xl" />
            </span>
            {/* The engenty stands on the header's lower edge, a little over it. */}
            <div className="-bottom-5 absolute right-9 z-10 max-sm:hidden">
              <Mascot kind={entry.avatar} size={104} />
            </div>
            <div className="relative sm:pr-36">
              <h2 className="font-display font-semibold text-[22px] leading-tight tracking-tight max-sm:pr-10">
                {entry.title}
              </h2>
              <p className="mt-1 text-[14px] text-white/85 leading-snug">
                {detail.data?.description || entry.pitch}
              </p>
            </div>
            {entry.usable ? (
              <div className="-mx-5 sm:-mx-7 relative mt-3.5 flex flex-wrap items-center gap-y-2 border-white/20 border-t px-5 pt-3 font-medium text-[14px] sm:px-7 sm:pr-40">
                <HeaderFact title={t("market.duration")}>
                  <Clock className="size-4 text-white/75" />
                  {t("market.minutes", { n: entry.effort.minutes })}
                </HeaderFact>
                <HeaderFact title={t("market.cost")}>
                  <CostCoins entry={entry} />
                </HeaderFact>
                <HeaderFact title={t("market.result")}>
                  {entry.formats.map((f) => (
                    <FormatIcon key={f} format={f} className="size-4" />
                  ))}
                </HeaderFact>
              </div>
            ) : null}
          </header>
          {entry.usable ? (
            <div className="grid min-h-0 flex-1 gap-x-7 gap-y-6 px-5 pt-6 max-sm:overflow-y-auto max-sm:pb-4 sm:grid-cols-[230px_minmax(0,1fr)] sm:grid-rows-[minmax(0,1fr)] sm:px-7">
              <div className="flex flex-col gap-5 sm:min-h-0 sm:overflow-y-auto">
                <Fact title={t("market.duration")}>
                  <Detail
                    icon={<Clock className="size-4 text-moss" />}
                    more={t("market.durationHint", { n: entry.effort.fields })}
                  >
                    {t("market.minutes", { n: entry.effort.minutes })}
                  </Detail>
                </Fact>
                <Fact title={t("market.cost")}>
                  <Detail
                    icon={<Coins className="size-4 text-amber" />}
                    more={entry.credits ? t("market.creditsHint") : undefined}
                  >
                    <span className="flex flex-wrap items-center gap-x-2">
                      <CostCoins entry={entry} />
                      {entry.credits ? (
                        <span className="text-ink-2">
                          {t("market.creditsRange", {
                            n: roughly(entry.credits.credits),
                          })}
                        </span>
                      ) : null}
                    </span>
                  </Detail>
                </Fact>
                <Fact title={t("market.result")}>
                  <div className="flex flex-col gap-2">
                    {(detail.data?.results ?? []).map((r) => (
                      <Detail
                        key={r.title}
                        icon={<FormatIcon format={r.kind} className="size-4 text-ember-strong" />}
                        more={r.formats.map((f) => f.toUpperCase()).join(" · ")}
                      >
                        {r.title}
                      </Detail>
                    ))}
                  </div>
                </Fact>
                <Fact title={t("market.needs")}>
                  <ul className="flex flex-col gap-2">
                    {entry.capabilities.map((c) => {
                      const Icon = CAPABILITY_ICONS[c];
                      return (
                        <li key={c} className="flex items-center gap-2.5 text-[14px] text-ink-2">
                          <Icon className="size-4 shrink-0 text-cobalt" />
                          {label(CAPABILITIES, c)}
                        </li>
                      );
                    })}
                  </ul>
                </Fact>
              </div>
              <div className="flex flex-col sm:min-h-0">
                <div className="mb-1.5 shrink-0 font-medium text-[12px] text-ink-3 uppercase tracking-[0.06em]">
                  {t("market.steps")}
                </div>
                <FadeScroll className="-mr-2 overscroll-contain pt-1 pr-2 pl-1 sm:min-h-0 sm:flex-1 sm:overflow-y-auto">
                  {detail.isLoading ? (
                    <Spinner className="size-5 text-ink-3" />
                  ) : (
                    <Flow steps={detail.data?.outline ?? []} />
                  )}
                </FadeScroll>
              </div>
            </div>
          ) : (
            <div className="flex-1 px-5 pt-6 sm:px-7">
              <p className="rounded-lg bg-amber-tint p-3 text-[14px] text-ink-2">
                {t("market.needsUpdateHint")}
              </p>
            </div>
          )}
          <div className="flex shrink-0 justify-end gap-2 px-5 pt-4 pb-5 max-sm:border-border-soft max-sm:border-t sm:px-7 sm:pb-6">
            <Button variant="secondary" onClick={onClose}>
              {t("common.close")}
            </Button>
            <Button disabled={!entry.usable} busy={busy} onClick={() => onUse(entry)}>
              {t("market.use")}
            </Button>
          </div>
        </div>
      ) : null}
    </Dialog>
  );
}

interface FilterOption {
  value: string;
  label: string;
  /** Entries the option would leave, with the other filters as they are. */
  count: number;
  icon?: ReactNode;
}

/** A filter as a pill: its name, or its pick with a way to drop it; the options open below. */
function FilterMenu({
  name,
  value,
  options,
  onChange,
}: {
  name: string;
  value: string;
  options: FilterOption[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onEscape = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", onEscape);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", onEscape);
    };
  }, [open]);
  const picked = options.find((o) => o.value === value);
  return (
    <div ref={ref} className="relative">
      <div
        className={cn(
          "flex h-8 items-center rounded-full text-[13px] transition",
          picked ? "bg-ember-tint text-ink" : "text-ink-2 hover:bg-paper-2 hover:text-ink",
          open && !picked && "bg-paper-2 text-ink",
        )}
      >
        <button
          type="button"
          aria-haspopup="listbox"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
          className={cn(
            "flex h-full items-center gap-1.5 rounded-full pl-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
            picked ? "pr-1" : "pr-2.5",
          )}
        >
          {picked ? (
            <>
              <span className="text-ink-3">{name}</span>
              <span className="font-medium">{picked.label}</span>
            </>
          ) : (
            <>
              {name}
              <ChevronDown className={cn("size-3.5 transition", open && "rotate-180")} />
            </>
          )}
        </button>
        {picked ? (
          <button
            type="button"
            aria-label={`${name}: ${t("market.reset")}`}
            onClick={() => onChange("")}
            className="mr-1 flex size-6 items-center justify-center rounded-full text-ink-3 hover:bg-card hover:text-ink"
          >
            <X className="size-3.5" />
          </button>
        ) : null}
      </div>
      {open ? (
        <div
          role="listbox"
          aria-label={name}
          className="absolute top-full left-0 z-30 mt-1.5 max-h-80 min-w-60 overflow-y-auto rounded-xl bg-card p-1.5 shadow-overlay ring-1 ring-border-soft"
        >
          {options.map((o) => (
            <button
              key={o.value}
              type="button"
              role="option"
              aria-selected={o.value === value}
              disabled={!o.count}
              onClick={() => {
                onChange(o.value === value ? "" : o.value);
                setOpen(false);
              }}
              className={cn(
                "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] transition coarse:py-2.5",
                o.count ? "text-ink-2 hover:bg-paper-2 hover:text-ink" : "text-ink-4",
                o.value === value && "font-medium text-ink",
              )}
            >
              {o.icon}
              <span className="flex-1 whitespace-nowrap">{o.label}</span>
              {o.value === value ? (
                <Check className="size-4 text-ember" />
              ) : (
                <span className="text-[12px] text-ink-4 tabular-nums">{o.count}</span>
              )}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** `found`: the entries the search left, or null without a search. */
function matches(e: MarketplaceEntry, f: Filters, found: Set<string> | null): boolean {
  return (
    (!found || found.has(e.id)) &&
    (!f.useCase || e.useCases.includes(f.useCase)) &&
    (!f.industry ||
      e.industries.includes(f.industry) ||
      (f.industry !== "any" && e.industries.includes("any"))) &&
    (!f.format || e.formats.includes(f.format))
  );
}

/** A value once it has stopped changing for a moment: what is typed, when the typing pauses. */
function useSettled<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms);
    return () => clearTimeout(timer);
  }, [value, ms]);
  return settled;
}

/**
 * The marketplace as a person browses it: search, the four ways to narrow the list, and a card
 * per entry that opens with what the wizard makes, needs and costs.
 */
export function MarketplaceBrowser({
  source,
  onUse,
  busy,
  open: opened,
  front,
}: {
  source: "studio" | "public";
  onUse: (entry: MarketplaceEntry) => void;
  busy?: boolean;
  /** An entry to open at once (a link from the gallery). */
  open?: string | null;
  /** The gallery: the search is a field to write a sentence into, and everything starts left. */
  front?: boolean;
}) {
  const entries = useMarketplace(source);
  const [query, setQuery] = useState("");
  const [filters, setFilters] = useState<Filters>(NO_FILTERS);
  const [picked, setPicked] = useState<string | null>(opened ?? null);
  const all = entries.data ?? [];
  const q = query.trim();
  const asked = useSettled(q, 450);

  // Every keystroke is answered by words at once; a sentence is also read by a model, which
  // sorts the entries and drops what does not fit.
  const judged = useQuery({
    queryKey: ["marketplace-search", source, lang, asked],
    queryFn: () =>
      api.post<{ ids: string[]; judged: boolean }>(
        `${source === "studio" ? "/api/studio/marketplace" : "/api/public/marketplace"}/search`,
        { q: asked, lang },
      ),
    enabled: isSentence(asked),
    staleTime: Number.POSITIVE_INFINITY,
    retry: false,
  });
  const byModel = asked === q && judged.data?.judged ? judged.data.ids : null;
  const thinking = isSentence(q) && (asked !== q || judged.isFetching);

  const ordered = useMemo(() => {
    if (!q) {
      return all;
    }
    if (byModel) {
      return byModel.flatMap((id) => all.find((e) => e.id === id) ?? []);
    }
    return rankEntries(all, q);
  }, [all, q, byModel]);
  const found = useMemo(() => (q ? new Set(ordered.map((e) => e.id)) : null), [q, ordered]);
  const shown = useMemo(
    () => ordered.filter((e) => matches(e, filters, found)),
    [ordered, filters, found],
  );

  /** The options of one filter, each with what it would leave of the list. */
  const options = (key: keyof Filters, labels: Labels, icon?: (id: string) => ReactNode) =>
    Object.keys(labels)
      // An option no entry has at all is not offered.
      .filter((id) => all.some((e) => matches(e, { ...NO_FILTERS, [key]: id }, null)))
      .map((id) => ({
        value: id,
        label: label(labels, id),
        icon: icon?.(id),
        count: all.filter((e) => matches(e, { ...filters, [key]: id }, found)).length,
      }));

  const useCases = options("useCase", USE_CASES);
  const menus: { key: keyof Filters; name: string; options: FilterOption[] }[] = [
    { key: "industry", name: t("market.industry"), options: options("industry", INDUSTRIES) },
    {
      key: "format",
      name: t("market.format"),
      options: options("format", ITEM_FORMATS, (id) => (
        <FormatIcon format={id as ItemFormat} className="size-4 text-ink-3" />
      )),
    },
  ];
  const narrowed = Boolean(q) || Object.values(filters).some(Boolean);
  const reset = () => {
    setFilters(NO_FILTERS);
    setQuery("");
  };

  if (entries.isLoading) {
    return (
      <div className="flex justify-center py-10">
        <Spinner className="size-6 text-ink-3" />
      </div>
    );
  }
  if (!all.length) {
    return null;
  }
  /** What the search is doing: looking by words, waiting for the model, or sorted by it. */
  const status = thinking ? (
    <Spinner className="size-4 shrink-0 text-ink-3" />
  ) : byModel ? (
    <span title={t("market.judged")} className="flex shrink-0">
      <Sparkles className="size-4 text-ember-strong" />
    </span>
  ) : (
    <Search className="size-4 shrink-0 text-ink-3" />
  );
  const clear = query ? (
    <button
      type="button"
      aria-label={t("market.reset")}
      onClick={() => setQuery("")}
      className="-mr-1.5 flex size-7 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-paper-2 hover:text-ink"
    >
      <X className="size-4" />
    </button>
  ) : null;

  return (
    <div>
      {front ? (
        // The gallery's field: written into like a chat, two lines for a whole sentence.
        <label className="relative flex items-start gap-3 rounded-2xl bg-card px-4 py-3.5 shadow-soft ring-1 ring-border-soft transition focus-within:ring-2 focus-within:ring-focus">
          <span className="mt-[5px] flex shrink-0">{status}</span>
          <textarea
            rows={2}
            value={query}
            onChange={(e) => setQuery(e.target.value.replace(/\n/g, " "))}
            placeholder={t("market.describe")}
            aria-label={t("market.search")}
            className="min-w-0 flex-1 resize-none bg-transparent text-[15px] leading-relaxed outline-none placeholder:text-ink-4"
          />
          {clear}
        </label>
      ) : (
        <label className="relative mx-auto flex h-10 max-w-md items-center gap-2.5 rounded-full bg-card px-4 shadow-soft ring-1 ring-border-soft transition focus-within:ring-2 focus-within:ring-focus sm:h-11">
          {status}
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={t("market.search")}
            aria-label={t("market.search")}
            className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-ink-4 [&::-webkit-search-cancel-button]:hidden"
          />
          {clear}
        </label>
      )}
      {/* On a phone the chips are one row to swipe, not four rows to scroll past. */}
      <div
        className={cn(
          "max-sm:-mx-4 flex gap-1 max-sm:overflow-x-auto max-sm:px-4 max-sm:[scrollbar-width:none] sm:flex-wrap max-sm:[&::-webkit-scrollbar]:hidden",
          front ? "sm:-ml-2.5 mt-3" : "mt-4 sm:justify-center",
        )}
      >
        {[{ value: "", label: t("market.all") }, ...useCases].map((u) => (
          <button
            key={u.value}
            type="button"
            aria-pressed={filters.useCase === u.value}
            onClick={() => setFilters({ ...filters, useCase: u.value as UseCase | "" })}
            className={cn(
              "h-7 shrink-0 whitespace-nowrap rounded-full px-2.5 text-[12.5px] transition",
              filters.useCase === u.value
                ? "bg-card font-medium text-ink shadow-soft ring-1 ring-border-soft"
                : "text-ink-3 hover:bg-card/60 hover:text-ink",
            )}
          >
            {u.label}
          </button>
        ))}
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-x-1 gap-y-2 sm:mt-6">
        {menus.map((m) => (
          <FilterMenu
            key={m.key}
            name={m.name}
            value={filters[m.key]}
            options={m.options}
            onChange={(v) => setFilters({ ...filters, [m.key]: v })}
          />
        ))}
        {/* Reset stands before the count, so the count never moves. */}
        <span className="ml-auto flex items-center gap-3 whitespace-nowrap pl-2 text-[13px] text-ink-3">
          {narrowed ? (
            <button
              type="button"
              onClick={reset}
              className="inline-flex items-center gap-1 text-ember-strong underline-offset-2 hover:underline"
            >
              <X className="size-3.5 max-sm:size-4" />
              {/* On a phone the cross alone: the row has no room for the word. */}
              <span className="max-sm:sr-only">{t("market.resetShort")}</span>
            </button>
          ) : null}
          {/* A phone has no room for the noun beside the reset link. */}
          {narrowed ? (
            <span className="tabular-nums sm:hidden">
              {t("market.countOfShort", { n: shown.length, all: all.length })}
            </span>
          ) : null}
          <span className={cn("tabular-nums", narrowed && "max-sm:hidden")}>
            {narrowed
              ? t("market.countOf", { n: shown.length, all: all.length })
              : t("market.count", { n: all.length })}
          </span>
        </span>
      </div>
      {shown.length ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((e) => (
            <EntryCard key={e.id} entry={e} onOpen={() => setPicked(e.id)} />
          ))}
        </div>
      ) : (
        <div className="py-10 text-center text-[14px] text-ink-3">
          <p>{t("market.none")}</p>
          <Button variant="ghost" className="mt-2" onClick={reset}>
            {t("market.reset")}
          </Button>
        </div>
      )}
      <EntryDialog
        entry={all.find((e) => e.id === picked) ?? null}
        onClose={() => setPicked(null)}
        onUse={onUse}
        busy={busy}
      />
    </div>
  );
}
