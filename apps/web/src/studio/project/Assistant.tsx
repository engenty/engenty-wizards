import type { ProjectFileKind } from "@engenty-wizards/shared/projects";
import { useQueryClient } from "@tanstack/react-query";
import { Sparkles } from "lucide-react";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Mascot } from "../../brand";
import { api, postStream } from "../../lib/api";
import { t } from "../../lib/i18n";
import { PluginFrame, useStudioPlugins } from "../../plugins/host";
import { cn } from "../../ui";
import {
  type Chat,
  type ChatCard,
  type ChatMessage,
  ChatPanel,
  previewsOf,
} from "../editor/ChatPanel";

/** Where a file given to the assistant goes: pictures and clips are assets, the rest documents. */
function kindOf(file: File): ProjectFileKind {
  if (file.type.startsWith("image/") && /logo/i.test(file.name)) {
    return "logo";
  }
  return /^(image|video|audio)\//.test(file.type) ? "asset" : "document";
}

/** A thread with the assistant: the messages, what runs, what it says it does right now. */
interface Thread {
  messages: ChatMessage[];
  phase: Chat["phase"];
  activity: string | null;
  startedAt: number | null;
  error: string | null;
}

/**
 * One thread per space, part and plugin page, kept outside the page: a running turn goes on when
 * the person moves to another page of the studio and is found again, still running, on the way
 * back. A reload starts afresh.
 */
interface Entry {
  state: Thread;
  listeners: Set<() => void>;
  /** The page that shows the thread now: told when the assistant changed the space. */
  onChanged: () => void;
  refreshing: Promise<void> | null;
}

const threads = new Map<string, Entry>();

function threadOf(key: string): Entry {
  let entry = threads.get(key);
  if (!entry) {
    entry = {
      state: { messages: [], phase: "idle", activity: null, startedAt: null, error: null },
      listeners: new Set(),
      onChanged: () => {},
      refreshing: null,
    };
    threads.set(key, entry);
  }
  return entry;
}

function update(entry: Entry, patch: Partial<Thread> | ((prev: Thread) => Partial<Thread>)) {
  entry.state = { ...entry.state, ...(typeof patch === "function" ? patch(entry.state) : patch) };
  for (const listener of entry.listeners) {
    listener();
  }
}

/**
 * The chat with the project assistant. What the assistant finds is written into the project,
 * and `onChanged` shows it in the sections below.
 */
function useProjectAssistant(
  projectId: string,
  part: AssistantPart,
  onChanged: () => void,
  plugin?: string,
): Chat {
  const qc = useQueryClient();
  const entry = threadOf(`${projectId}:${part}:${plugin ?? ""}`);
  const state = useSyncExternalStore(
    useCallback(
      (listener: () => void) => {
        entry.listeners.add(listener);
        return () => entry.listeners.delete(listener);
      },
      [entry],
    ),
    () => entry.state,
  );
  useEffect(() => {
    entry.onChanged = onChanged;
    return () => {
      if (entry.onChanged === onChanged) {
        entry.onChanged = () => {};
      }
    };
  }, [entry, onChanged]);

  /** Fetches the project again and shows it; changes that arrive meanwhile wait for the next one. */
  const refresh = () => {
    entry.refreshing ??= (async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["projects"] }),
        qc.invalidateQueries({ queryKey: ["project-files", projectId] }),
        qc.invalidateQueries({ queryKey: ["knowledge", projectId] }),
      ]);
      entry.onChanged();
      entry.refreshing = null;
    })();
    return entry.refreshing;
  };

  const send = async (text: string, files: File[] = []): Promise<boolean> => {
    if (!(text.trim() || files.length) || entry.state.phase !== "idle") {
      return false;
    }
    update(entry, { error: null, phase: "thinking", startedAt: Date.now() });
    if (files.length) {
      try {
        for (const file of files) {
          await api.upload(`/api/studio/projects/${projectId}/files?kind=${kindOf(file)}`, file);
        }
      } catch (err) {
        update(entry, { error: (err as Error).message, phase: "idle", startedAt: null });
        await refresh();
        return false;
      }
      await refresh();
      const named = `${t("editor.attached")}: ${files.map((f) => f.name).join(", ")}`;
      text = text.trim() ? `${text}\n\n${named}` : named;
    }
    const history = entry.state.messages.map(({ role, content }) => ({ role, content })).slice(-12);
    const pendingId = `p-${Date.now()}`;
    update(entry, (prev) => ({
      messages: [
        ...prev.messages,
        { id: `u-${Date.now()}`, role: "user", content: text, previews: previewsOf(files) },
        { id: pendingId, role: "assistant", content: "", pending: true },
      ],
      activity: null,
    }));
    const patchPending = (fn: (x: ChatMessage) => ChatMessage) =>
      update(entry, (prev) => ({
        messages: prev.messages.map((x) => (x.id === pendingId ? fn(x) : x)),
      }));
    let answered = false;
    try {
      await postStream(
        `/api/studio/projects/${projectId}/assist`,
        { message: text, history, part, ...(plugin ? { plugin } : {}) },
        (event, data) => {
          if (event === "text") {
            const delta = JSON.parse(data) as string;
            patchPending((x) => ({ ...x, content: x.content + delta }));
          } else if (event === "activity") {
            update(entry, { activity: JSON.parse(data) as string });
          } else if (event === "card") {
            const card = JSON.parse(data) as Omit<ChatCard, "id">;
            patchPending((x) => ({
              ...x,
              cards: [...(x.cards ?? []), { ...card, id: `${pendingId}-${x.cards?.length ?? 0}` }],
            }));
          } else if (event === "changed") {
            update(entry, { phase: "building" });
            void refresh();
          } else if (event === "done") {
            answered = true;
            const done = JSON.parse(data) as { reply: string; changed: boolean };
            patchPending((x) => ({
              ...x,
              content: done.reply,
              changed: done.changed,
              pending: false,
            }));
          } else if (event === "error") {
            answered = true;
            update(entry, { error: JSON.parse(data).message });
          }
        },
      );
      if (!answered) {
        update(entry, { error: t("editor.chatBroken") });
      }
    } catch (err) {
      update(entry, { error: (err as Error).message });
    } finally {
      update(entry, (prev) => ({
        activity: null,
        startedAt: null,
        phase: "idle",
        messages: prev.messages
          .filter((x) => !(x.id === pendingId && !x.content && !x.cards?.length))
          .map((x) => ({ ...x, pending: false })),
      }));
      await entry.refreshing;
      await refresh();
      await qc.invalidateQueries({ queryKey: ["me"] });
    }
    return true;
  };

  return { ...state, send };
}

/** A plugin's card for what its tool returned, drawn by the plugin's studio half. */
function PluginCard({ card, send }: { card: ChatCard; send: Chat["send"] }) {
  const plugins = useStudioPlugins();
  const found = plugins.cards.find((c) => c.plugin === card.plugin && c.tool === card.tool);
  if (!found) {
    return null;
  }
  return (
    <PluginFrame of={found}>
      <found.component data={card.data} send={(message: string) => void send(message)} />
    </PluginFrame>
  );
}

/** The part of the space page the assistant stands on: what it says it does there. */
export type AssistantPart = "info" | "knowledge";

/** What the assistant's card says before the first message; the engenty stands at its right. */
function Intro({ part, own }: { part: AssistantPart; own?: { title?: string; hello?: string } }) {
  return (
    <div className="sm:pr-36">
      <h2 className="font-display font-semibold text-[1.25rem] leading-tight tracking-tight">
        {own?.title ??
          (part === "knowledge"
            ? t("project.assistantTitleKnowledge")
            : t("project.assistantTitle"))}
      </h2>
      <p className="mt-1.5 max-w-2xl text-[0.9375rem] text-ink-2 leading-relaxed">
        {own?.hello ??
          (part === "knowledge"
            ? t("project.assistantHelloKnowledge")
            : t("project.assistantHello"))}
      </p>
    </div>
  );
}

/** Below the top bar: a card whose lower edge is above this line is scrolled away. */
const PAST = 72;
const DOCK_WIDTH = 720;

/**
 * The assistant's card stands at the top of the page. Scrolled away, the same card docks at the
 * lower edge of the window in a compact form, so it stays at hand next to every section.
 */
export function Assistant({
  projectId,
  part,
  docked = false,
  onChanged,
  plugin,
  title,
  hello,
  placeholder,
}: {
  projectId: string;
  part: AssistantPart;
  /** Docked at the lower edge from the start: a page of its own stands where the card would. */
  docked?: boolean;
  onChanged: () => void;
  /** Talking from a plugin's own page: the assistant is told what that page holds. */
  plugin?: string;
  title?: string;
  hello?: string;
  placeholder?: string;
}) {
  const chat = useProjectAssistant(projectId, part, onChanged, plugin);
  const slot = useRef<HTMLDivElement>(null);
  const [dock, setDock] = useState<{
    left: number;
    width: number;
    height: number;
    /** The page column the blurred band below the composer spans. */
    band: { left: number; width: number };
  } | null>(null);
  useEffect(() => {
    const place = () => {
      const rect = slot.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setDock((prev) => {
        if (!docked && rect.bottom >= PAST) {
          return null;
        }
        const width = Math.min(rect.width, DOCK_WIDTH);
        const left = rect.left + (rect.width - width) / 2;
        // The slot keeps the height the card had, so the page does not jump when it docks.
        return prev && prev.left === left && prev.width === width
          ? prev
          : {
              left,
              width,
              height: prev?.height ?? rect.height,
              band: { left: rect.left, width: rect.width },
            };
      });
    };
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, [docked]);
  return (
    <div
      ref={slot}
      style={dock && !docked ? { minHeight: dock.height } : undefined}
      // Docked from the start it takes no room: the page's own gap after it goes too.
      className={docked ? "-mb-9 h-0" : undefined}
    >
      {docked ? null : (
        <div className="mb-2 flex items-center gap-1.5 px-1 font-medium text-[0.75rem] text-ember-strong uppercase tracking-[0.07em]">
          <Sparkles className="size-3.5" /> {t("project.assistant")}
        </div>
      )}
      <div className="relative">
        {/* Before the first message the engenty stands on the card's upper edge. */}
        {!dock && chat.messages.length === 0 ? (
          <div className="absolute -top-14 right-10 z-10 max-sm:hidden">
            <Mascot kind="round" size={104} />
          </div>
        ) : null}
        {/* One tree docked or not, so the draft and the open thread stay when it docks. Docked,
            the composer floats over a blurred band at the window's lower edge, clear of a phone's
            home bar; only the composer and the thread above it take the pointer. */}
        <div
          className={dock ? "pointer-events-none fixed bottom-0 z-30 animate-dock" : undefined}
          style={dock ? { left: dock.band.left, width: dock.band.width } : undefined}
        >
          {dock ? (
            <div
              aria-hidden
              className="absolute inset-x-0 -top-12 bottom-0 bg-linear-to-t from-paper/85 via-paper/55 to-paper/0 backdrop-blur-xl [mask-image:linear-gradient(to_top,black_45%,transparent)]"
            />
          ) : null}
          <div
            className={cn(
              "flex flex-col",
              dock
                ? "pointer-events-auto relative max-h-[70dvh] px-5 pt-5 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+0.75rem))]"
                : "max-h-[520px] overflow-hidden rounded-xl bg-card bg-linear-to-br from-ember-tint via-card to-card shadow-soft ring-1 ring-ember-veil",
            )}
            style={dock ? { marginLeft: dock.left - dock.band.left, width: dock.width } : undefined}
          >
            <ChatPanel
              chat={chat}
              avatar="round"
              compact={Boolean(dock)}
              intro={<Intro part={part} own={{ title, hello }} />}
              placeholder={
                placeholder ??
                (part === "knowledge"
                  ? t("project.assistantComposerKnowledge")
                  : t("project.assistantComposer"))
              }
              changedLabel={t("project.assistantChanged")}
              card={(card) => <PluginCard card={card} send={chat.send} />}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
