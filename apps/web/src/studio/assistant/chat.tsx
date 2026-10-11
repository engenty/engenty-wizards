import type { AssistantEvents, AssistantLayout } from "@engenty-wizards/shared/assistant";
import type { ProjectFileKind } from "@engenty-wizards/shared/projects";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useNavigate } from "react-router";
import { api, postStream } from "../../lib/api";
import { lang, t } from "../../lib/i18n";
import { useCurrentProject, useMe } from "../../lib/session";
import { useStudioPlugins } from "../../plugins/host";
import type { Chat, ChatCard, ChatMessage, ChatToolCall } from "../editor/ChatPanel";
import { previewsOf } from "../editor/ChatPanel";
import { settingsSections } from "../settings-sections";
import { type LiveChat, useLiveChat } from "./live";
import { pageChanged, pageSnapshot } from "./page";
import { bindNavigation, browserTools, runBrowserTool, setHighlight } from "./tools";

/**
 * The studio assistant's one chat, above the routes: it stays while the person moves between
 * pages, and the assistant may move them (navigate). Stored per person and team on the server.
 */

interface StoredMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  cards: { plugin: string; tool: string; data: unknown }[];
  toolCalls: ChatToolCall[];
  changed: boolean;
}

export interface EarlierChat {
  id: string;
  title: string;
  summary: string;
  startedAt: string;
  closedAt: string;
}

const asMessage = (m: StoredMessage): ChatMessage => ({
  id: m.id,
  role: m.role,
  content: m.content,
  cards: m.cards.map((c, i) => ({ ...c, id: `${m.id}-${i}` })),
  toolCalls: m.toolCalls,
  changed: m.changed,
});

/** Where a file given to the assistant goes: pictures and clips are assets, the rest documents. */
function kindOf(file: File): ProjectFileKind {
  if (file.type.startsWith("image/") && /logo/i.test(file.name)) {
    return "logo";
  }
  return /^(image|video|audio)\//.test(file.type) ? "asset" : "document";
}

/** What the panel, the sidebar and the avatar show; the chat behind all three. */
export type AssistantView = { kind: "chat" } | { kind: "earlier" } | { kind: "read"; id: string };

export interface AssistantState {
  chat: Chat;
  ready: boolean;
  /** "New chat" is summarising the one before. */
  renewing: boolean;
  newChat: () => Promise<void>;
  layout: AssistantLayout;
  setLayout: (layout: AssistantLayout) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  view: AssistantView;
  setView: (view: AssistantView) => void;
  /** The live chat: it goes on while the person, or the assistant, moves between pages. */
  live: LiveChat;
}

const Context = createContext<AssistantState | null>(null);

export function useAssistant(): AssistantState | null {
  return useContext(Context);
}

/** The studio's own addresses and the plugins' pages: what `navigate` may open. */
function useRoutes(): () => string[] {
  const plugins = useStudioPlugins();
  const me = useMe();
  const ref = useRef<string[]>([]);
  ref.current = [
    "/",
    "/new",
    "/edit/:id",
    "/space",
    "/space/:group",
    "/settings",
    ...settingsSections(me.data, plugins).map((s) => `/settings/${s.id}`),
    ...plugins.pages.map((p) => p.path),
  ];
  return useCallback(() => ref.current, []);
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const qc = useQueryClient();
  const me = useMe();
  const signedIn = Boolean(me.data);
  const { project } = useCurrentProject();
  const navigate = useNavigate();
  const routes = useRoutes();
  useEffect(() => {
    bindNavigation((to) => navigate(to), routes);
  }, [navigate, routes]);

  const stored = useQuery({
    queryKey: ["assistant-chat"],
    queryFn: () => api.get<{ id: string; messages: StoredMessage[] }>("/api/studio/assistant/chat"),
    enabled: signedIn,
    staleTime: Number.POSITIVE_INFINITY,
  });
  const savedLayout = useQuery({
    queryKey: ["assistant-layout"],
    queryFn: () => api.get<{ layout: AssistantLayout }>("/api/studio/assistant/layout"),
    enabled: signedIn,
    staleTime: Number.POSITIVE_INFINITY,
  });

  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<Chat["phase"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [renewing, setRenewing] = useState(false);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<AssistantView>({ kind: "chat" });
  const [layout, setLayoutState] = useState<AssistantLayout | null>(null);
  const loaded = useRef<string | null>(null);

  // The stored chat is the truth once, when it arrives; the turns keep the thread from then on.
  useEffect(() => {
    if (stored.data && loaded.current !== stored.data.id) {
      loaded.current = stored.data.id;
      setMessages(stored.data.messages.map(asMessage));
    }
  }, [stored.data]);

  const setLayout = useCallback(
    (next: AssistantLayout) => {
      setLayoutState(next);
      qc.setQueryData(["assistant-layout"], { layout: next });
      void api.put("/api/studio/assistant/layout", { layout: next }).catch(() => null);
    },
    [qc],
  );

  const refreshing = useRef<Promise<void> | null>(null);
  /** The space and the page read their data again; changes that arrive meanwhile wait. */
  const refresh = useCallback(() => {
    refreshing.current ??= (async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["projects"] }),
        project ? qc.invalidateQueries({ queryKey: ["project-files", project.id] }) : null,
        project ? qc.invalidateQueries({ queryKey: ["knowledge", project.id] }) : null,
      ]);
      pageChanged();
      refreshing.current = null;
    })();
    return refreshing.current;
  }, [qc, project]);

  const busy = useRef(false);
  const send = useCallback(
    async (input: string, files: File[] = []): Promise<boolean> => {
      let text = input;
      if (!(text.trim() || files.length) || busy.current) {
        return false;
      }
      busy.current = true;
      setError(null);
      setPhase("thinking");
      setStartedAt(Date.now());
      setHighlight(null);
      setView({ kind: "chat" });
      if (files.length) {
        if (!project || project.readOnly) {
          setError(t("assistant.filesNeedSpace"));
          setPhase("idle");
          setStartedAt(null);
          busy.current = false;
          return false;
        }
        try {
          for (const file of files) {
            await api.upload(`/api/studio/projects/${project.id}/files?kind=${kindOf(file)}`, file);
          }
        } catch (err) {
          setError((err as Error).message);
          setPhase("idle");
          setStartedAt(null);
          busy.current = false;
          await refresh();
          return false;
        }
        await refresh();
        const named = `${t("editor.attached")}: ${files.map((f) => f.name).join(", ")}`;
        text = text.trim() ? `${text}\n\n${named}` : named;
      }
      const pendingId = `p-${Date.now()}`;
      const mineId = `u-${Date.now()}`;
      setMessages((m) => [
        ...m,
        { id: mineId, role: "user", content: text, previews: previewsOf(files) },
        { id: pendingId, role: "assistant", content: "", pending: true },
      ]);
      setActivity(null);
      const patch = (change: (m: ChatMessage) => ChatMessage) =>
        setMessages((all) => all.map((x) => (x.id === pendingId ? change(x) : x)));
      let answered = false;
      try {
        await postStream(
          "/api/studio/assistant/turn",
          {
            message: text,
            projectId: project?.id,
            page: pageSnapshot(),
            tools: browserTools(),
            lang,
          },
          (event, raw) => {
            const data = JSON.parse(raw);
            switch (event as keyof AssistantEvents) {
              case "run_started": {
                const started = data as AssistantEvents["run_started"];
                setMessages((all) =>
                  all.map((x) => (x.id === mineId ? { ...x, id: started.messageId } : x)),
                );
                break;
              }
              case "text":
                patch((x) => ({
                  ...x,
                  content: x.content + (data as AssistantEvents["text"]).delta,
                }));
                break;
              case "activity":
                setActivity((data as AssistantEvents["activity"]).label);
                break;
              case "tool_call": {
                const call = data as AssistantEvents["tool_call"];
                patch((x) => ({ ...x, toolCalls: [...(x.toolCalls ?? []), call] }));
                void runBrowserTool(call.toolCallName, call.args).then((ran) => {
                  if (ran) {
                    void api
                      .post(`/api/studio/assistant/tool/${call.toolCallId}`, {
                        result: ran.result ?? null,
                      })
                      .catch(() => null);
                  }
                });
                break;
              }
              case "tool_result": {
                const done = data as AssistantEvents["tool_result"];
                patch((x) => ({
                  ...x,
                  toolCalls: x.toolCalls?.map((c) =>
                    c.toolCallId === done.toolCallId ? { ...c, result: done.content } : c,
                  ),
                }));
                break;
              }
              case "card": {
                const card = data as AssistantEvents["card"];
                patch((x) => ({
                  ...x,
                  cards: [
                    ...(x.cards ?? []),
                    { ...card, id: `${pendingId}-${x.cards?.length ?? 0}` } as ChatCard,
                  ],
                }));
                break;
              }
              case "changed":
                void refresh();
                break;
              case "done": {
                answered = true;
                const done = data as AssistantEvents["done"];
                patch((x) => ({
                  ...x,
                  id: done.messageId,
                  content: done.reply,
                  changed: done.changed,
                  pending: false,
                }));
                break;
              }
              case "error":
                answered = true;
                setError((data as AssistantEvents["error"]).message);
                break;
            }
          },
        );
        if (!answered) {
          setError(t("editor.chatBroken"));
        }
      } catch (err) {
        setError((err as Error).message);
      } finally {
        setActivity(null);
        setStartedAt(null);
        setMessages((m) =>
          m
            .filter((x) => !(x.pending && !x.content && !x.cards?.length && !x.toolCalls?.length))
            .map((x) => ({ ...x, pending: false })),
        );
        setPhase("idle");
        busy.current = false;
        await refreshing.current;
        await qc.invalidateQueries({ queryKey: ["me"] });
      }
      return true;
    },
    [project, refresh, qc],
  );

  const newChat = useCallback(async () => {
    if (busy.current) {
      return;
    }
    setRenewing(true);
    setError(null);
    try {
      const fresh = await api.post<{ id: string; messages: StoredMessage[] }>(
        "/api/studio/assistant/chat/new",
      );
      loaded.current = fresh.id;
      qc.setQueryData(["assistant-chat"], fresh);
      setMessages([]);
      setView({ kind: "chat" });
      await qc.invalidateQueries({ queryKey: ["assistant-chats"] });
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setRenewing(false);
    }
  }, [qc]);

  const chat = useMemo<Chat>(
    () => ({ messages, phase, activity, startedAt, error, send }),
    [messages, phase, activity, startedAt, error, send],
  );
  const live = useLiveChat(chat);
  const value = useMemo<AssistantState>(
    () => ({
      chat,
      ready: Boolean(stored.data),
      renewing,
      newChat,
      layout: layout ?? savedLayout.data?.layout ?? "bottom",
      setLayout,
      open,
      setOpen,
      view,
      setView,
      live,
    }),
    [chat, stored.data, renewing, newChat, layout, savedLayout.data, setLayout, open, view, live],
  );
  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/** The person's closed chats, for "Earlier chats". */
export function useEarlierChats(enabled: boolean) {
  return useQuery({
    queryKey: ["assistant-chats"],
    queryFn: () => api.get<{ chats: EarlierChat[] }>("/api/studio/assistant/chats"),
    enabled,
  });
}

/** One earlier chat, to read. */
export function useStoredChat(id: string | null) {
  return useQuery({
    queryKey: ["assistant-chat", id],
    queryFn: async () => {
      const chat = await api.get<EarlierChat & { messages: StoredMessage[] }>(
        `/api/studio/assistant/chats/${id}`,
      );
      return { ...chat, messages: chat.messages.map(asMessage) };
    },
    enabled: Boolean(id),
  });
}
