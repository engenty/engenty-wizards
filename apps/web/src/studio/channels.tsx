import { useQuery } from "@tanstack/react-query";
import {
  type LucideIcon,
  MessageCircle,
  MessageCircleMore,
  MessageSquareText,
  Mic,
  PhoneCall,
  Puzzle,
  Rows3,
  Video,
} from "lucide-react";
import { api } from "../lib/api";
import { lang, t } from "../lib/i18n";
import type { WizardSummary } from "../lib/session";
import { cn } from "../ui";

/**
 * The channels a wizard runs through, on the studio's home: an icon per channel that is on,
 * and a row of pills that narrows the cards to one channel. The runners come from the runtime;
 * the icons are the studio's, one per known runner, a puzzle piece for any other plugin's.
 */

export interface Runner {
  id: string;
  label: { de: string; en: string };
  kind: "page" | "channel";
  builtIn?: boolean;
  plugin?: string;
  problem?: string | null;
}

const ICONS: Record<string, LucideIcon> = {
  steps: Rows3,
  chat: MessageCircle,
  talk: Mic,
  whatsapp: MessageCircleMore,
  sms: MessageSquareText,
  call: PhoneCall,
  video: Video,
};

export const runnerIcon = (id: string): LucideIcon => ICONS[id] ?? Puzzle;

/** Steps and chat, until the owner says otherwise: the runtime's default. */
const DEFAULT_ENABLED = ["steps", "chat"];

export function useRunners() {
  return useQuery({
    queryKey: ["runners"],
    queryFn: () => api.get<Runner[]>("/api/studio/runners"),
    staleTime: 60_000,
  });
}

/** The channels switched on for a wizard, of the ones the tenant has, the link's first. */
export function channelsOf(w: WizardSummary, runners: Runner[]): string[] {
  const ids = new Set(runners.map((r) => r.id));
  const enabled = (w.runners?.enabled ?? DEFAULT_ENABLED).filter((id) => ids.has(id));
  const first = w.runners?.default ?? "steps";
  return [...enabled].sort((a, b) => (a === first ? -1 : b === first ? 1 : 0));
}

/** The channels that are on, as icons; the one the link opens drawn darker. */
export function ChannelIcons({ w, runners }: { w: WizardSummary; runners: Runner[] }) {
  const on = channelsOf(w, runners);
  const first = w.runners?.default ?? "steps";
  return (
    <span className="inline-flex items-center gap-1.5">
      {on.map((id) => {
        const Icon = runnerIcon(id);
        const label = runners.find((r) => r.id === id)?.label[lang] ?? id;
        return (
          <Icon
            key={id}
            aria-label={label}
            className={cn("size-3.5", id === first ? "text-ink-2" : "text-ink-4")}
          >
            <title>{label}</title>
          </Icon>
        );
      })}
    </span>
  );
}

/**
 * A row of pills, one per channel any wizard here is on: all, or one of them. Drawn only where
 * channels are in play: a wizard beyond steps and chat, or a door a plugin brought.
 */
export function ChannelFilter({
  wizards,
  runners,
  value,
  onChange,
}: {
  wizards: WizardSummary[];
  runners: Runner[];
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  const counts = new Map<string, number>();
  for (const w of wizards) {
    for (const id of channelsOf(w, runners)) {
      counts.set(id, (counts.get(id) ?? 0) + 1);
    }
  }
  const beyondDefault =
    [...counts.keys()].some((id) => !DEFAULT_ENABLED.includes(id)) ||
    runners.some((r) => !DEFAULT_ENABLED.includes(r.id) && !r.problem);
  if (!beyondDefault) {
    return null;
  }
  const pill = (on: boolean) =>
    cn(
      "inline-flex h-8 items-center gap-1.5 rounded-full px-3 font-medium text-[0.8125rem] transition",
      on ? "bg-paper-2 text-ink" : "text-ink-3 hover:text-ink",
    );
  return (
    <div className="mt-5 flex flex-wrap items-center gap-1">
      <button type="button" className={pill(value === null)} onClick={() => onChange(null)}>
        {t("home.allChannels")}
      </button>
      {runners
        .filter((r) => counts.has(r.id))
        .map((r) => {
          const Icon = runnerIcon(r.id);
          return (
            <button
              key={r.id}
              type="button"
              aria-pressed={value === r.id}
              className={pill(value === r.id)}
              onClick={() => onChange(value === r.id ? null : r.id)}
            >
              <Icon className="size-3.5" />
              {r.label[lang]}
              <span className="text-[0.75rem] text-ink-4">{counts.get(r.id)}</span>
            </button>
          );
        })}
    </div>
  );
}
