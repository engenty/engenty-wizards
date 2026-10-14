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
import { lang } from "../lib/i18n";
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
        // The title on a box around it: an SVG's own shows only over its thin strokes.
        return (
          <span key={id} role="img" aria-label={label} title={label} className="inline-flex">
            <Icon
              aria-hidden
              className={cn("size-3.5", id === first ? "text-ink-2" : "text-ink-4")}
            />
          </span>
        );
      })}
    </span>
  );
}
