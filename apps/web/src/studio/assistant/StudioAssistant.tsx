import {
  ArrowLeft,
  AudioLines,
  ChevronDown,
  History,
  Mic,
  MicOff,
  Minimize2,
  PanelBottom,
  PanelRight,
  PhoneOff,
  SquarePen,
  Volume2,
  X,
} from "lucide-react";
import {
  type ReactNode,
  type RefObject,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createPortal } from "react-dom";
import { Mascot } from "../../brand";
import { t } from "../../lib/i18n";
import { spokenText } from "../../lib/read-aloud";
import { PluginFrame, useStudioPlugins } from "../../plugins/host";
import { Composer, type ComposerHandle, cn, IconButton, Spinner } from "../../ui";
import { useDismiss, useTrail } from "../AppFrame";
import { type ChatCard, type ChatToolCall, Messages, Working } from "../editor/ChatPanel";
import { type AssistantState, useAssistant, useEarlierChats, useStoredChat } from "./chat";
import { canLive } from "./live";
import { type AssistantSuggestion, usePageAssistant } from "./page";
import { openStudioLink, setHighlight, useHighlight } from "./tools";

/**
 * The studio assistant on every page but the editor: docked at the bottom (the default), as a
 * sidebar on a window wide enough, or small at the lower right. Opened at the bottom, the chat
 * rises above the bar; empty, it greets with the page's words and three suggestions.
 */

/** The content keeps its 760 px beside a 400 px sidebar. */
const SIDEBAR_FROM = 1520;
const PHONE_BELOW = 768;
const DOCK_WIDTH = 720;

function useWindowWidth(): number {
  return useSyncExternalStore(
    (listener) => {
      window.addEventListener("resize", listener);
      return () => window.removeEventListener("resize", listener);
    },
    () => window.innerWidth,
  );
}

/** Where the assistant stands now: the person's choice, as far as the window allows it. */
function useWhere(state: AssistantState) {
  const width = useWindowWidth();
  const page = usePageAssistant();
  const wide = width >= SIDEBAR_FROM;
  const phone = width < PHONE_BELOW;
  let where = state.layout;
  if (where === "sidebar" && (!wide || phone)) {
    where = "bottom";
  }
  // A page of full-height tables keeps the assistant small, at the lower right.
  const compact = where === "bottom" && Boolean(page.compact);
  if (compact) {
    where = "avatar";
  }
  return { where, wide: wide && !phone, phone, compact };
}

// --- what the thread shows -------------------------------------------------------------------

const QUIET = new Set(["scroll_to"]);

function callLabel(call: ChatToolCall): string | null {
  const args = (call.args ?? {}) as Record<string, unknown>;
  let result: Record<string, unknown> = {};
  try {
    result = call.result ? JSON.parse(call.result) : {};
  } catch {
    // a result cut short says nothing more
  }
  // A ref of look_at_page ("e19") says nothing to the person.
  const target = /^e\d+$/.test(String(args.target ?? "")) ? "" : String(args.target ?? "");
  const what = String(result.shown || result.filled || result.area || target);
  switch (call.toolCallName) {
    case "navigate":
      return t("assistant.tool.navigate", { where: String(args.to ?? "") });
    case "highlight":
      return t("assistant.tool.highlight", { what });
    case "look_at_page":
      return t("assistant.tool.look");
    case "read_section":
      return t("assistant.tool.read", { what });
    case "fill_field":
      return t("assistant.tool.fill", { what });
    case "docs_search":
    case "docs_read":
    case "authoring_guide":
      return t("assistant.tool.docs");
    case "gallery_search":
    case "gallery_detail":
      return t("assistant.tool.gallery");
    case "plans":
    case "account":
    case "usage":
      return t("assistant.tool.account");
    case "chats_search":
    case "chat_read":
      return t("assistant.tool.chats");
    case "wizards":
    case "runs":
      return t("assistant.tool.space");
    case "models":
      return t("assistant.tool.models");
    default:
      return null;
  }
}

function Calls({ calls }: { calls?: ChatToolCall[] }) {
  const labels = [
    ...new Set(
      (calls ?? [])
        .filter((c) => !QUIET.has(c.toolCallName))
        .map(callLabel)
        .filter((l): l is string => Boolean(l)),
    ),
  ];
  if (!labels.length) {
    return null;
  }
  return (
    <div className="mb-1.5 flex flex-wrap gap-1.5">
      {labels.map((label) => (
        <span
          key={label}
          className="inline-flex max-w-full items-center rounded-full bg-paper-2 px-2.5 py-0.5 text-[0.75rem] text-ink-3"
        >
          <span className="truncate">{label}</span>
        </span>
      ))}
    </div>
  );
}

/** A plugin's card for what its tool returned, drawn by the plugin's studio half. */
function PluginCard({ card, send }: { card: ChatCard; send: (message: string) => void }) {
  const plugins = useStudioPlugins();
  const found = plugins.cards.find((c) => c.plugin === card.plugin && c.tool === card.tool);
  if (!found) {
    return null;
  }
  return (
    <PluginFrame of={found}>
      <found.component data={card.data} send={send} />
    </PluginFrame>
  );
}

function defaultSuggestions(): AssistantSuggestion[] {
  return [
    { label: t("assistant.suggest.what") },
    { label: t("assistant.suggest.models") },
    { label: t("assistant.suggest.credits") },
  ];
}

function Hello({
  state,
  composer,
}: {
  state: AssistantState;
  composer: RefObject<ComposerHandle | null>;
}) {
  const page = usePageAssistant();
  const suggestions = (page.suggestions?.length ? page.suggestions : defaultSuggestions()).slice(
    0,
    3,
  );
  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-start gap-3">
        <div className="shrink-0">
          <Mascot kind="round" size={44} goggles interactive={false} />
        </div>
        <div className="min-w-0 pt-0.5">
          <h2 className="font-display font-semibold text-[1.0625rem] leading-tight tracking-tight">
            {page.title ?? t("assistant.helloTitle")}
          </h2>
          <p className="mt-1 text-[0.875rem] text-ink-2 leading-relaxed">
            {page.hello ?? t("assistant.hello")}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s.label}
            type="button"
            disabled={state.chat.phase !== "idle"}
            onClick={() => {
              const message = s.message ?? s.label;
              if (s.fill) {
                composer.current?.fill(message);
              } else {
                void state.chat.send(message);
              }
            }}
            className="flex items-center gap-2 rounded-xl bg-paper-2 px-3.5 py-2.5 text-left text-[0.875rem] text-ink-2 transition hover:bg-paper-3 hover:text-ink disabled:opacity-60"
          >
            <span className="min-w-0 flex-1">{s.label}</span>
            {s.fill ? <SquarePen className="size-3.5 shrink-0 text-ink-4" /> : null}
          </button>
        ))}
      </div>
    </div>
  );
}

function Earlier({ state }: { state: AssistantState }) {
  const chats = useEarlierChats(true);
  if (chats.isLoading) {
    return <Spinner className="m-4 size-4" />;
  }
  const list = chats.data?.chats ?? [];
  if (!list.length) {
    return <p className="text-[0.875rem] text-ink-3">{t("assistant.noEarlier")}</p>;
  }
  return (
    <ul className="flex flex-col gap-1">
      {list.map((c) => (
        <li key={c.id}>
          <button
            type="button"
            onClick={() => state.setView({ kind: "read", id: c.id })}
            className="flex w-full flex-col gap-0.5 rounded-lg px-3 py-2.5 text-left transition hover:bg-accent"
          >
            <span className="flex items-baseline gap-2">
              <span className="min-w-0 flex-1 truncate font-medium text-[0.875rem]">
                {c.title || t("assistant.untitled")}
              </span>
              <span className="shrink-0 text-[0.75rem] text-ink-4 tabular-nums">
                {new Date(c.closedAt).toLocaleDateString()}
              </span>
            </span>
            <span className="line-clamp-1 text-[0.8125rem] text-ink-3">
              {c.summary.split("\n")[0]}
            </span>
          </button>
        </li>
      ))}
    </ul>
  );
}

function ReadChat({ id }: { id: string }) {
  const chat = useStoredChat(id);
  if (!chat.data) {
    return <Spinner className="m-4 size-4" />;
  }
  return (
    <div className="flex flex-col gap-4">
      <div className="rounded-xl bg-paper-2 px-4 py-3 text-[0.8125rem] text-ink-2 leading-relaxed">
        <div className="font-medium text-ink">{chat.data.title || t("assistant.untitled")}</div>
        <p className="mt-1 whitespace-pre-line">{chat.data.summary}</p>
      </div>
      <Messages
        chat={{
          messages: chat.data.messages,
          phase: "idle",
          activity: null,
          startedAt: null,
          error: null,
          send: async () => false,
        }}
        avatar="round"
        changedLabel={t("project.assistantChanged")}
        // Its cards show again with what their tools returned; nothing is sent from here.
        card={(card) => <PluginCard card={card} send={() => undefined} />}
        calls={(m) => <Calls calls={m.toolCalls} />}
      />
    </div>
  );
}

function Thread({
  state,
  composer,
}: {
  state: AssistantState;
  composer: RefObject<ComposerHandle | null>;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const { chat, view } = state;
  // A studio page an answer links to opens in the app, the chat beside it; others in a new tab.
  useEffect(() => {
    const el = scroller.current;
    const onClick = (e: MouseEvent) => {
      const href = (e.target as HTMLElement).closest("a")?.getAttribute("href");
      if (!href || e.metaKey || e.ctrlKey || e.shiftKey) {
        return;
      }
      if (openStudioLink(href)) {
        e.preventDefault();
      } else if (/^https?:\/\//.test(href)) {
        // The guides and other sites open beside the studio, not in its place.
        e.preventDefault();
        window.open(href, "_blank", "noopener,noreferrer");
      }
    };
    el?.addEventListener("click", onClick);
    return () => el?.removeEventListener("click", onClick);
  }, []);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new content
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages, chat.phase, view]);
  return (
    <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5">
      {view.kind === "earlier" ? (
        <Earlier state={state} />
      ) : view.kind === "read" ? (
        <ReadChat id={view.id} />
      ) : state.renewing ? (
        <div className="flex items-center gap-2 text-[0.8125rem] text-ink-3">
          <Spinner className="size-3.5" /> {t("assistant.summarising")}
        </div>
      ) : chat.messages.length ? (
        <Messages
          chat={chat}
          avatar="round"
          changedLabel={t("project.assistantChanged")}
          card={(card) => <PluginCard card={card} send={(message) => void chat.send(message)} />}
          calls={(m) => <Calls calls={m.toolCalls} />}
        />
      ) : (
        <Hello state={state} composer={composer} />
      )}
      {chat.error && view.kind === "chat" ? (
        <div className="mt-4 rounded-lg bg-rose-tint px-3 py-2 text-[0.8125rem] text-rose">
          {chat.error}
        </div>
      ) : null}
    </div>
  );
}

// --- the header ----------------------------------------------------------------------------

function ChatMenu({ state }: { state: AssistantState }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const item =
    "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[0.875rem] text-ink-2 hover:bg-accent hover:text-ink disabled:opacity-50";
  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={t("assistant.menu")}
        onClick={() => setOpen((o) => !o)}
        className="-ml-1 flex items-center gap-1 rounded-lg px-1.5 py-0.5 font-display font-semibold text-[0.9375rem] transition hover:bg-accent"
      >
        {t("assistant.name")}
        <ChevronDown className="size-3.5 text-ink-4" />
      </button>
      {open ? (
        <div
          role="menu"
          className="absolute top-8 left-0 z-50 w-56 animate-rise rounded-xl bg-card p-1.5 shadow-overlay ring-1 ring-border-soft"
        >
          <button
            type="button"
            role="menuitem"
            className={item}
            disabled={state.chat.phase !== "idle" || state.renewing}
            onClick={() => {
              setOpen(false);
              void state.newChat();
            }}
          >
            <SquarePen className="size-4" /> {t("assistant.newChat")}
          </button>
          <button
            type="button"
            role="menuitem"
            className={item}
            onClick={() => {
              setOpen(false);
              state.setView({ kind: "earlier" });
            }}
          >
            <History className="size-4" /> {t("assistant.earlier")}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function Header({
  state,
  where,
  wide,
  phone,
  compact,
}: {
  state: AssistantState;
  where: "bottom" | "sidebar" | "avatar";
  wide: boolean;
  phone: boolean;
  /** The page keeps it small: no docking at the bottom here. */
  compact?: boolean;
}) {
  const live = state.live;
  const sees = useTrail()
    .map((c) => c.label)
    .join(" · ");
  return (
    <div className="flex items-center gap-2 border-border-soft border-b px-3 py-2 sm:px-4">
      {state.view.kind !== "chat" ? (
        <IconButton
          label={t("assistant.back")}
          onClick={() => state.setView({ kind: state.view.kind === "read" ? "earlier" : "chat" })}
          className="size-8"
        >
          <ArrowLeft className="size-4" />
        </IconButton>
      ) : (
        <Mascot kind="round" size={26} goggles interactive={false} />
      )}
      <div className="min-w-0 flex-1">
        {state.view.kind === "chat" ? (
          <ChatMenu state={state} />
        ) : (
          <span className="font-display font-semibold text-[0.9375rem]">
            {t("assistant.earlier")}
          </span>
        )}
        {live.state !== "off" ? (
          <div className="flex items-center gap-1.5 text-[0.75rem] text-ember-strong">
            <span className="size-1.5 animate-pulse-dot rounded-full bg-ember" />
            {t("assistant.live")} · <Clock since={live.since} />
          </div>
        ) : sees ? (
          <div className="truncate text-[0.75rem] text-ink-4">
            {t("assistant.sees", { page: sees })}
          </div>
        ) : null}
      </div>
      {where !== "sidebar" && wide ? (
        <IconButton
          label={t("assistant.layoutSidebar")}
          onClick={() => state.setLayout("sidebar")}
          className="size-8"
        >
          <PanelRight className="size-4" />
        </IconButton>
      ) : null}
      {where === "sidebar" || (where === "avatar" && !phone && !compact) ? (
        <IconButton
          label={t("assistant.layoutBottom")}
          onClick={() => {
            state.setLayout("bottom");
            state.setOpen(true);
          }}
          className="size-8"
        >
          <PanelBottom className="size-4" />
        </IconButton>
      ) : null}
      {where !== "avatar" ? (
        <IconButton
          label={t("assistant.minimize")}
          onClick={() => {
            state.setLayout("avatar");
            state.setOpen(false);
          }}
          className="size-8"
        >
          <Minimize2 className="size-4" />
        </IconButton>
      ) : null}
      {where !== "sidebar" ? (
        <IconButton
          label={t("assistant.close")}
          onClick={() => state.setOpen(false)}
          className="size-8"
        >
          {where === "bottom" ? <ChevronDown className="size-4" /> : <X className="size-4" />}
        </IconButton>
      ) : null}
    </div>
  );
}

function Clock({ since }: { since: number | null }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const seconds = since ? Math.max(0, Math.floor((now - since) / 1000)) : 0;
  return (
    <span className="tabular-nums">
      {String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}
    </span>
  );
}

// --- the composer or the call --------------------------------------------------------------

function CallStrip({ state }: { state: AssistantState }) {
  const live = state.live;
  const label =
    live.state === "thinking"
      ? t("assistant.liveThinking")
      : live.state === "speaking"
        ? t("assistant.liveSpeaking")
        : live.muted
          ? t("assistant.liveMuted")
          : t("assistant.liveListening");
  return (
    <div className="flex items-center gap-2 rounded-full bg-card p-1 pl-4 shadow-overlay ring-1 ring-ember-veil">
      <span className="size-2 shrink-0 animate-pulse-dot rounded-full bg-ember" />
      <span aria-hidden className="flex h-5 shrink-0 items-center gap-0.5">
        {[0.5, 0.8, 1, 0.75, 0.45].map((f, i) => (
          <span
            key={i}
            className="w-1 rounded-full bg-ember transition-[height] duration-100"
            style={{ height: `${Math.max(3, Math.round(live.level * f * 20))}px` }}
          />
        ))}
      </span>
      <span className="min-w-0 flex-1 truncate text-[0.8125rem] text-ink-2">
        {live.heard ? (
          <span className="text-ink">{live.heard}</span>
        ) : live.state === "thinking" ? (
          <Working chat={state.chat} className="text-ink-3" />
        ) : (
          <>
            {label} · <Clock since={live.since} />
          </>
        )}
      </span>
      {live.voice && live.voice.way !== "none" ? (
        <IconButton
          label={t("assistant.naturalVoice")}
          aria-pressed={live.voice.natural}
          onClick={() => live.setNatural(!live.voice?.natural)}
          className={cn(live.voice.natural && "bg-ember-tint text-ember-strong")}
        >
          <Volume2 className="size-4" />
        </IconButton>
      ) : null}
      <IconButton
        label={live.muted ? t("assistant.unmute") : t("assistant.mute")}
        aria-pressed={live.muted}
        onClick={live.toggleMute}
      >
        {live.muted ? <MicOff className="size-4" /> : <Mic className="size-4" />}
      </IconButton>
      <button
        type="button"
        onClick={live.end}
        className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full bg-rose px-3.5 font-medium text-[0.8125rem] text-white coarse:h-11"
      >
        <PhoneOff className="size-4" /> {t("assistant.end")}
      </button>
    </div>
  );
}

function Bottom({
  state,
  composer,
  floating,
}: {
  state: AssistantState;
  composer: RefObject<ComposerHandle | null>;
  floating?: boolean;
}) {
  const page = usePageAssistant();
  const live = state.live;
  if (state.view.kind === "earlier") {
    return null;
  }
  if (state.view.kind === "read") {
    return (
      <p className="m-3 rounded-xl bg-paper-2 px-4 py-3 text-[0.8125rem] text-ink-2 leading-relaxed">
        {t("assistant.readOnly")}
      </p>
    );
  }
  return (
    <div className={floating ? undefined : "p-3"}>
      {live.state !== "off" ? (
        <CallStrip state={state} />
      ) : (
        <Composer
          ref={composer}
          floating={floating}
          placeholder={page.placeholder ?? t("assistant.composer")}
          disabled={state.chat.phase !== "idle"}
          onSend={(text, files) => {
            state.setOpen(true);
            return state.chat.send(text, files);
          }}
          onTalk={
            canLive
              ? () => {
                  state.setOpen(true);
                  void live.start();
                }
              : undefined
          }
        />
      )}
      {live.error ? (
        <p className="mt-2 px-3 text-[0.75rem] text-rose">
          {live.error === "denied" ? t("editor.micDenied") : live.error}
        </p>
      ) : null}
    </div>
  );
}

/** Files dropped anywhere on the assistant go with the next message. */
function DropZone({
  composer,
  children,
  className,
}: {
  composer: RefObject<ComposerHandle | null>;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-assistant-ui
      className={className}
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) {
          e.preventDefault();
        }
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.files.length) {
          return;
        }
        e.preventDefault();
        composer.current?.add(Array.from(e.dataTransfer.files));
        composer.current?.focus();
      }}
    >
      {children}
    </div>
  );
}

// --- the three places ----------------------------------------------------------------------

/**
 * At the bottom of the page and small at its lower right: drawn over the page's column. The
 * height of what stays at rest is written to `--assistant-dock` on the column, so the page's
 * last section stays clear of it.
 */
export function AssistantDock({ column }: { column: RefObject<HTMLDivElement | null> }) {
  const state = useAssistant();
  // Above the highlight's dimming: the conversation stays readable beside what it points at.
  const lifted = Boolean(useHighlight());
  const composer = useRef<ComposerHandle>(null);
  const rest = useRef<HTMLDivElement>(null);
  const where = useWhereOrNull(state);
  const visible = state && where && where.where !== "sidebar";
  useLayoutEffect(() => {
    const el = rest.current;
    const host = column.current;
    if (!(el && host && visible)) {
      host?.style.setProperty("--assistant-dock", "0px");
      return;
    }
    const observer = new ResizeObserver(() => {
      host.style.setProperty("--assistant-dock", `${Math.ceil(el.offsetHeight) + 8}px`);
    });
    observer.observe(el);
    return () => {
      observer.disconnect();
      host.style.setProperty("--assistant-dock", "0px");
    };
  }, [column, visible]);
  // Escape folds the opened chat away.
  useEffect(() => {
    if (!state?.open) {
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !document.querySelector("[role=dialog]")) {
        state.setOpen(false);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state]);
  if (!(state && where && visible)) {
    return null;
  }
  const { open } = state;
  if (where.where === "avatar") {
    return (
      <DropZone
        composer={composer}
        className={cn("pointer-events-none absolute inset-0", lifted ? "z-[61]" : "z-30")}
      >
        {open ? (
          <div className="pointer-events-auto absolute right-3 bottom-3 flex h-[min(640px,calc(100%-1.5rem))] w-[min(420px,calc(100%-1.5rem))] animate-rise flex-col overflow-hidden rounded-2xl bg-card shadow-overlay ring-1 ring-border">
            <Header
              state={state}
              where="avatar"
              wide={where.wide}
              phone={where.phone}
              compact={where.compact}
            />
            <Thread state={state} composer={composer} />
            <Bottom state={state} composer={composer} />
          </div>
        ) : (
          <div
            ref={rest}
            className="pointer-events-auto absolute right-3 bottom-3 sm:right-4 sm:bottom-4"
          >
            <div className="flex items-center gap-1 rounded-full bg-card p-1 pr-1.5 shadow-overlay ring-1 ring-border">
              <button
                type="button"
                onClick={() => state.setOpen(true)}
                className="flex items-center gap-2 rounded-full py-0.5 pr-2 pl-0.5 text-[0.875rem] text-ink-2 transition hover:text-ink"
              >
                <span className="relative">
                  <Mascot kind="round" size={36} goggles interactive={false} />
                  {state.chat.phase !== "idle" || state.live.state !== "off" ? (
                    <span className="absolute top-0 right-0 size-2.5 animate-pulse-dot rounded-full bg-ember ring-2 ring-card" />
                  ) : null}
                </span>
                <span className="max-sm:hidden">{t("assistant.ask")}</span>
              </button>
              {canLive ? (
                <IconButton
                  label={t("assistant.talk")}
                  onClick={() => {
                    state.setOpen(true);
                    void state.live.start();
                  }}
                  className="size-8 bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground"
                >
                  <AudioLines className="size-4" />
                </IconButton>
              ) : null}
            </div>
          </div>
        )}
      </DropZone>
    );
  }
  return (
    <DropZone
      composer={composer}
      className={cn(
        "pointer-events-none absolute inset-x-0 bottom-0 flex flex-col items-center",
        lifted ? "z-[61]" : "z-30",
      )}
    >
      {open ? (
        <div
          className="pointer-events-auto mx-3 mb-2 flex max-h-[min(70dvh,calc(100%-7rem))] min-h-0 w-[calc(100%-1.5rem)] animate-rise flex-col overflow-hidden rounded-2xl bg-card shadow-overlay ring-1 ring-border"
          style={{ maxWidth: DOCK_WIDTH }}
        >
          <Header state={state} where="bottom" wide={where.wide} phone={where.phone} />
          <Thread state={state} composer={composer} />
        </div>
      ) : state.chat.messages.length || state.chat.error ? (
        <LastTurn state={state} />
      ) : null}
      <div
        ref={rest}
        className="relative w-full px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:px-5"
      >
        <div
          aria-hidden
          className="absolute inset-x-0 -top-8 bottom-0 bg-linear-to-t from-paper/85 via-paper/55 to-paper/0 backdrop-blur-xl [mask-image:linear-gradient(to_top,black_45%,transparent)]"
        />
        <div
          className="pointer-events-auto relative mx-auto flex items-end gap-2"
          style={{ maxWidth: DOCK_WIDTH }}
        >
          {open || state.live.state !== "off" ? null : (
            <button
              type="button"
              aria-label={t("assistant.open")}
              title={t("assistant.open")}
              onClick={() => state.setOpen(true)}
              className="mb-0.5 shrink-0 max-sm:hidden"
            >
              <Mascot kind="round" size={40} goggles interactive={false} />
            </button>
          )}
          <div className="min-w-0 flex-1">
            <Bottom state={state} composer={composer} floating />
          </div>
        </div>
      </div>
    </DropZone>
  );
}

/** Folded, one line about the last turn stands above the bar; it opens the chat. */
function LastTurn({ state }: { state: AssistantState }) {
  const last = state.chat.messages.at(-1);
  return (
    <button
      type="button"
      onClick={() => state.setOpen(true)}
      className="pointer-events-auto mx-3 mb-2 flex w-[calc(100%-1.5rem)] items-center gap-2 rounded-2xl bg-card px-4 py-2 text-left text-[0.8125rem] text-ink-3 shadow-overlay ring-1 ring-border transition hover:text-ink"
      style={{ maxWidth: DOCK_WIDTH }}
    >
      {last?.pending ? (
        <Working chat={state.chat} className="flex-1" />
      ) : (
        <span className={cn("min-w-0 flex-1 truncate", state.chat.error && "text-rose")}>
          {state.chat.error ?? spokenText(last?.content ?? "")}
        </span>
      )}
      <ChevronDown className="size-4 shrink-0 rotate-180" />
    </button>
  );
}

function useWhereOrNull(state: AssistantState | null) {
  // Hooks run alike with and without an assistant: a stand-in state keeps their order.
  const where = useWhere(state ?? STAND_IN);
  return state ? where : null;
}

const STAND_IN = {
  layout: "bottom",
  open: false,
  chat: { messages: [] },
} as unknown as AssistantState;

/** The sidebar, beside the page, on a window wide enough. */
export function AssistantSidebar() {
  const state = useAssistant();
  const lifted = Boolean(useHighlight());
  const composer = useRef<ComposerHandle>(null);
  const where = useWhereOrNull(state);
  if (!(state && where && where.where === "sidebar")) {
    return null;
  }
  return (
    <DropZone
      composer={composer}
      className={cn(
        "flex w-[400px] shrink-0 flex-col border-border-soft border-l bg-card",
        lifted && "relative z-[61]",
      )}
    >
      <Header state={state} where="sidebar" wide={where.wide} phone={where.phone} />
      <Thread state={state} composer={composer} />
      <Bottom state={state} composer={composer} />
    </DropZone>
  );
}

// --- the highlight -------------------------------------------------------------------------

/** Dims the page except the element the assistant points at, or rings it, with its card. */
export function HighlightLayer() {
  const highlight = useHighlight();
  const state = useAssistant();
  const [rect, setRect] = useState<DOMRect | null>(null);
  useEffect(() => {
    if (!highlight) {
      setRect(null);
      return;
    }
    let frame = 0;
    const follow = () => {
      if (!highlight.el.isConnected) {
        setHighlight(null);
        return;
      }
      setRect(highlight.el.getBoundingClientRect());
      frame = requestAnimationFrame(follow);
    };
    follow();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setHighlight(null);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      cancelAnimationFrame(frame);
      document.removeEventListener("keydown", onKey);
    };
  }, [highlight]);
  if (!(highlight && rect)) {
    return null;
  }
  const pad = 6;
  const box = {
    left: rect.left - pad,
    top: rect.top - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
  const below = box.top + box.height + 220 < window.innerHeight;
  const cardTop = below ? box.top + box.height + 10 : Math.max(10, box.top - 10);
  const cardLeft = Math.min(Math.max(10, box.left), window.innerWidth - 330);
  const answer = (text: string) => {
    setHighlight(null);
    void state?.chat.send(text);
  };
  return createPortal(
    <div data-assistant-ui className="pointer-events-none fixed inset-0 z-[60]">
      {highlight.mode === "spotlight" ? (
        <div
          className="pointer-events-auto absolute rounded-xl transition-all duration-200"
          style={{ ...box, boxShadow: "0 0 0 100vmax oklch(0.2 0.01 60 / 0.45)" }}
          onClick={() => setHighlight(null)}
          onKeyDown={undefined}
          role="presentation"
        />
      ) : null}
      <div
        className="absolute rounded-xl ring-2 ring-ember ring-offset-2 ring-offset-transparent transition-all duration-200"
        style={box}
      />
      {highlight.title || highlight.text || highlight.buttons.length ? (
        <div
          className="pointer-events-auto absolute w-80 max-w-[calc(100vw-20px)] animate-rise rounded-xl bg-card p-3.5 shadow-overlay ring-1 ring-border"
          style={{
            left: cardLeft,
            ...(below ? { top: cardTop } : { bottom: window.innerHeight - cardTop }),
          }}
        >
          <div className="flex items-start gap-2.5">
            <Mascot kind="round" size={28} goggles interactive={false} />
            <div className="min-w-0 flex-1">
              {highlight.title ? (
                <div className="font-medium text-[0.875rem]">{highlight.title}</div>
              ) : null}
              {highlight.text ? (
                <p className="mt-0.5 text-[0.8125rem] text-ink-2 leading-relaxed">
                  {highlight.text}
                </p>
              ) : null}
            </div>
          </div>
          <div className="mt-3 flex flex-wrap justify-end gap-1.5">
            {highlight.buttons.map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => answer(b)}
                className="rounded-full bg-paper-2 px-3 py-1.5 text-[0.8125rem] text-ink-2 transition hover:bg-paper-3 hover:text-ink"
              >
                {b}
              </button>
            ))}
            <button
              type="button"
              onClick={() => setHighlight(null)}
              className="rounded-full bg-primary px-3 py-1.5 font-medium text-[0.8125rem] text-primary-foreground"
            >
              {t("assistant.gotIt")}
            </button>
          </div>
        </div>
      ) : null}
    </div>,
    document.body,
  );
}
