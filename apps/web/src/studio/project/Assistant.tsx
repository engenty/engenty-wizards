import type { ProjectFileKind } from "@engenty-wizards/shared/projects";
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { api, postStream } from "../../lib/api";
import { t } from "../../lib/i18n";
import { cn } from "../../ui";
import { type Chat, type ChatMessage, ChatPanel } from "../editor/ChatPanel";

/** Where a file given to the assistant goes: pictures and clips are assets, the rest documents. */
function kindOf(file: File): ProjectFileKind {
  if (file.type.startsWith("image/") && /logo/i.test(file.name)) {
    return "logo";
  }
  return /^(image|video|audio)\//.test(file.type) ? "asset" : "document";
}

/**
 * The chat with the project assistant. The thread lives on this page only; what the assistant
 * finds is written into the project, and `onChanged` shows it in the sections below.
 */
function useProjectAssistant(projectId: string, onChanged: () => void): Chat {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<Chat["phase"]>("idle");
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const refreshing = useRef<Promise<void> | null>(null);

  /** Fetches the project again and shows it; changes that arrive meanwhile wait for the next one. */
  const refresh = () => {
    refreshing.current ??= (async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["projects"] }),
        qc.invalidateQueries({ queryKey: ["project-files", projectId] }),
      ]);
      onChanged();
      refreshing.current = null;
    })();
    return refreshing.current;
  };

  const send = async (text: string, files: File[] = []): Promise<boolean> => {
    if (!(text.trim() || files.length) || phase !== "idle") {
      return false;
    }
    setError(null);
    setPhase("thinking");
    if (files.length) {
      try {
        for (const file of files) {
          await api.upload(`/api/studio/projects/${projectId}/files?kind=${kindOf(file)}`, file);
        }
      } catch (err) {
        setError((err as Error).message);
        setPhase("idle");
        await refresh();
        return false;
      }
      await refresh();
      const named = `${t("editor.attached")}: ${files.map((f) => f.name).join(", ")}`;
      text = text.trim() ? `${text}\n\n${named}` : named;
    }
    const history = messages.map(({ role, content }) => ({ role, content })).slice(-12);
    const pendingId = `p-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", content: text },
      { id: pendingId, role: "assistant", content: "", pending: true },
    ]);
    setActivity(null);
    let answered = false;
    try {
      await postStream(
        `/api/studio/projects/${projectId}/assist`,
        { message: text, history },
        (event, data) => {
          if (event === "text") {
            const delta = JSON.parse(data) as string;
            setMessages((m) =>
              m.map((x) => (x.id === pendingId ? { ...x, content: x.content + delta } : x)),
            );
          } else if (event === "activity") {
            setActivity(JSON.parse(data) as string);
          } else if (event === "changed") {
            setPhase("building");
            void refresh();
          } else if (event === "done") {
            answered = true;
            const done = JSON.parse(data) as { reply: string; changed: boolean };
            setMessages((m) =>
              m.map((x) =>
                x.id === pendingId
                  ? { ...x, content: done.reply, changed: done.changed, pending: false }
                  : x,
              ),
            );
          } else if (event === "error") {
            answered = true;
            setError(JSON.parse(data).message);
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
      setMessages((m) =>
        m.filter((x) => !(x.id === pendingId && !x.content)).map((x) => ({ ...x, pending: false })),
      );
      setPhase("idle");
      await refreshing.current;
      await refresh();
      await qc.invalidateQueries({ queryKey: ["me"] });
    }
    return true;
  };

  return { messages, phase, activity, error, send };
}

/** Below the top bar: a card whose lower edge is above this line is scrolled away. */
const PAST = 72;
const DOCK_WIDTH = 720;

/**
 * The assistant's card stands at the top of the page. Scrolled away, the same card docks at the
 * lower edge of the window in a compact form, so it stays at hand next to every section.
 */
export function Assistant({ projectId, onChanged }: { projectId: string; onChanged: () => void }) {
  const chat = useProjectAssistant(projectId, onChanged);
  const slot = useRef<HTMLDivElement>(null);
  const [dock, setDock] = useState<{ left: number; width: number; height: number } | null>(null);
  useEffect(() => {
    const place = () => {
      const rect = slot.current?.getBoundingClientRect();
      if (!rect) {
        return;
      }
      setDock((prev) => {
        if (rect.bottom >= PAST) {
          return null;
        }
        const width = Math.min(rect.width, DOCK_WIDTH);
        const left = rect.left + (rect.width - width) / 2;
        // The slot keeps the height the card had, so the page does not jump when it docks.
        return prev && prev.left === left && prev.width === width
          ? prev
          : { left, width, height: prev?.height ?? rect.height };
      });
    };
    place();
    window.addEventListener("scroll", place, { passive: true });
    window.addEventListener("resize", place);
    return () => {
      window.removeEventListener("scroll", place);
      window.removeEventListener("resize", place);
    };
  }, []);
  return (
    <div ref={slot} style={dock ? { minHeight: dock.height } : undefined}>
      <div
        className={cn(
          "flex flex-col overflow-hidden bg-card",
          dock
            ? "fixed bottom-4 z-30 max-h-[70dvh] animate-dock rounded-2xl shadow-overlay ring-1 ring-border"
            : "max-h-[520px] rounded-xl shadow-soft ring-1 ring-border-soft",
        )}
        style={dock ? { left: dock.left, width: dock.width } : undefined}
      >
        <ChatPanel
          chat={chat}
          avatar="round"
          compact={Boolean(dock)}
          hello={t("project.assistantHello")}
          placeholder={t("project.assistantComposer")}
          changedLabel={t("project.assistantChanged")}
        />
      </div>
    </div>
  );
}
