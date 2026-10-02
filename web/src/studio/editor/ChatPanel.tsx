import type { WizardDefinition } from "@shared/definition";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Plug, Sparkles } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Mascot } from "../../brand";
import { postStream } from "../../lib/api";
import { t } from "../../lib/i18n";
import type { WizardDetail } from "../../lib/session";
import { Markdown } from "../../runner/outputs";
import { cn, Spinner } from "../../ui";

interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  changed?: boolean;
  pending?: boolean;
  source?: "studio" | "mcp";
  client?: string | null;
}

export function useArchitectChat(
  wizard: WizardDetail | undefined,
  onChanged: (draft: WizardDefinition, revision: number) => void,
) {
  const qc = useQueryClient();
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [phase, setPhase] = useState<"idle" | "thinking" | "building">("idle");
  const [error, setError] = useState<string | null>(null);
  const [activity, setActivity] = useState<string | null>(null);
  const loadedFor = useRef<string | null>(null);

  useEffect(() => {
    if (!wizard) {
      return;
    }
    if (loadedFor.current !== wizard.id) {
      loadedFor.current = wizard.id;
      setMessages(wizard.messages);
      return;
    }
    // Between turns the server's thread is the truth — it also carries notes an MCP client left.
    // A turn's optimistic messages stay until the server has them (it may still be refetching).
    if (phase === "idle") {
      setMessages((local) => (wizard.messages.length >= local.length ? wizard.messages : local));
    }
  }, [wizard, phase]);

  const send = async (text: string) => {
    if (!wizard || !text.trim() || phase !== "idle") {
      return;
    }
    setError(null);
    const pendingId = `p-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", content: text },
      { id: pendingId, role: "assistant", content: "", pending: true },
    ]);
    setPhase("thinking");
    setActivity(null);
    let answered = false;
    try {
      await postStream(
        `/api/studio/wizards/${wizard.id}/chat`,
        { message: text },
        (event, data) => {
          if (event === "text") {
            const delta = JSON.parse(data) as string;
            setMessages((m) =>
              m.map((x) => (x.id === pendingId ? { ...x, content: x.content + delta } : x)),
            );
          } else if (event === "activity") {
            setActivity(JSON.parse(data) as string);
          } else if (event === "building") {
            setPhase("building");
          } else if (event === "done") {
            answered = true;
            const done = JSON.parse(data) as {
              reply: string;
              changed: boolean;
              draft: WizardDefinition;
              revision: number;
            };
            setMessages((m) =>
              m.map((x) =>
                x.id === pendingId
                  ? { ...x, content: done.reply, changed: done.changed, pending: false }
                  : x,
              ),
            );
            if (done.changed) {
              onChanged(done.draft, done.revision);
            }
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
      await qc.invalidateQueries({ queryKey: ["wizard", wizard.id] });
      await qc.invalidateQueries({ queryKey: ["me"] });
    }
  };

  return { messages, phase, activity, error, send };
}

export function ChatPanel({
  chat,
  avatar,
}: {
  chat: ReturnType<typeof useArchitectChat>;
  avatar: string;
}) {
  const [text, setText] = useState("");
  const scroller = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new content
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages, chat.phase]);
  const submit = () => {
    const value = text.trim();
    if (!value) {
      return;
    }
    setText("");
    void chat.send(value);
  };
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto px-5 py-5">
        {chat.messages.length === 0 ? (
          <div className="flex items-start gap-3">
            <Mascot kind={avatar} size={32} interactive={false} />
            <p className="pt-1 text-[14px] text-ink-2 leading-relaxed">{t("editor.chatHello")}</p>
          </div>
        ) : null}
        <div className="flex flex-col gap-4">
          {chat.messages.map((m) =>
            m.role === "user" ? (
              <div
                key={m.id}
                className="ml-8 self-end rounded-2xl rounded-br-md bg-paper-2 px-4 py-2.5 text-[14px] leading-relaxed"
              >
                <span className="whitespace-pre-wrap">{m.content}</span>
              </div>
            ) : (
              <div key={m.id} className="flex items-start gap-3">
                <div className="shrink-0">
                  <Mascot kind={avatar} size={28} interactive={false} />
                </div>
                <div className="min-w-0 pt-0.5 text-[14px]">
                  {m.source === "mcp" ? (
                    <div className="mb-1 inline-flex items-center gap-1.5 text-[12px] text-ink-3">
                      <Plug className="size-3" />{" "}
                      {t("editor.viaClient", { client: m.client ?? "MCP" })}
                    </div>
                  ) : null}
                  {m.content ? <Markdown text={m.content} className="text-[14px]" /> : null}
                  {m.pending ? (
                    <div className="mt-1 inline-flex items-center gap-2 text-[13px] text-ink-3">
                      <Spinner className="size-3.5" />
                      {chat.activity ??
                        (chat.phase === "building" ? t("editor.building") : t("editor.thinking"))}
                    </div>
                  ) : null}
                  {m.changed ? (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ember-tint px-2.5 py-0.5 text-[12px] text-ember-strong">
                      <Sparkles className="size-3" /> Ablauf aktualisiert
                    </div>
                  ) : null}
                </div>
              </div>
            ),
          )}
        </div>
        {chat.error ? (
          <div className="mt-4 rounded-xl bg-rose-tint px-3 py-2 text-[13px] text-rose">
            {chat.error}
          </div>
        ) : null}
      </div>
      <div className="p-3">
        <div className="flex items-end gap-2 rounded-2xl bg-card p-1.5 shadow-soft ring-1 ring-border focus-within:ring-ember/50">
          <textarea
            ref={area}
            rows={1}
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              e.target.style.height = "auto";
              e.target.style.height = `${Math.min(e.target.scrollHeight, 200)}px`;
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit();
              }
            }}
            placeholder={t("editor.composer")}
            className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-2.5 py-2 text-[14px] outline-none placeholder:text-ink-4"
          />
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || chat.phase !== "idle"}
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition",
              text.trim() && chat.phase === "idle"
                ? "bg-primary text-primary-foreground"
                : "bg-paper-2 text-ink-4",
            )}
            aria-label="Send"
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}
