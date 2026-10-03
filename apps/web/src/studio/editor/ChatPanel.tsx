import type { WizardDefinition } from "@engenty-wizards/shared/definition";
import { useQueryClient } from "@tanstack/react-query";
import { ArrowUp, Mic, Paperclip, Plug, Plus, Sparkles, Square, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Mascot } from "../../brand";
import { postStream } from "../../lib/api";
import { withBase } from "../../lib/base";
import { t } from "../../lib/i18n";
import type { WizardDetail } from "../../lib/session";
import { useDictation } from "../../lib/speech";
import { Markdown } from "../../runner/outputs";
import { cn, IconButton, Spinner } from "../../ui";

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

  /** False when nothing was sent: the composer keeps its draft and files. */
  const send = async (text: string, files: File[] = []): Promise<boolean> => {
    if (!wizard || !(text.trim() || files.length) || phase !== "idle") {
      return false;
    }
    setError(null);
    if (files.length) {
      // Files go into the wizard's workspace; the message names them.
      setPhase("thinking");
      try {
        for (const file of files) {
          const res = await fetch(
            withBase(`/api/studio/wizards/${wizard.id}/files/${encodeURIComponent(file.name)}`),
            {
              method: "PUT",
              credentials: "include",
              headers: { "content-type": file.type || "application/octet-stream" },
              body: file,
            },
          );
          if (!res.ok) {
            const body = await res.json().catch(() => ({}));
            throw new Error(body.error ?? res.statusText);
          }
        }
      } catch (err) {
        setError((err as Error).message);
        setPhase("idle");
        await qc.invalidateQueries({ queryKey: ["wizard", wizard.id] });
        return false;
      }
      const named = `${t("editor.attached")}: ${files.map((f) => f.name).join(", ")}`;
      text = text.trim() ? `${text}\n\n${named}` : named;
    }
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
    return true;
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
  const [files, setFiles] = useState<File[]>([]);
  const scroller = useRef<HTMLDivElement>(null);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const speech = useDictation(text, setText);
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on new content
  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [chat.messages, chat.phase]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the height follows the text, typed or spoken
  useEffect(() => {
    const el = area.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
    }
  }, [text]);
  const ready = (text.trim() || files.length > 0) && chat.phase === "idle";
  const submit = async () => {
    if (!ready) {
      return;
    }
    if (speech.listening) {
      speech.toggle();
    }
    const draft = { text, files };
    setText("");
    setFiles([]);
    if (!(await chat.send(draft.text.trim(), draft.files))) {
      setText(draft.text);
      setFiles(draft.files);
    }
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
                className="ml-8 self-end rounded-xl rounded-br-md bg-paper-2 px-4 py-2.5 text-[14px] leading-relaxed"
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
          <div className="mt-4 rounded-lg bg-rose-tint px-3 py-2 text-[13px] text-rose">
            {chat.error}
          </div>
        ) : null}
      </div>
      <div className="p-3">
        <div className="rounded-xl bg-card p-1.5 shadow-soft ring-1 ring-border focus-within:ring-focus">
          {files.length ? (
            <ul className="flex flex-wrap gap-1.5 px-1 pt-1 pb-1.5">
              {files.map((f, i) => (
                <li
                  key={`${f.name}-${i}`}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-paper-2 py-1 pr-1 pl-2.5 text-[12px] text-ink-2"
                >
                  <Paperclip className="size-3 shrink-0 text-ink-4" />
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    aria-label={t("editor.detach")}
                    onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-paper-3 hover:text-ink"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-end gap-1">
            <IconButton label={t("editor.attach")} onClick={() => picker.current?.click()}>
              <Plus className="size-4" />
            </IconButton>
            <input
              ref={picker}
              type="file"
              multiple
              hidden
              onChange={(e) => {
                const picked = Array.from(e.target.files ?? []);
                e.target.value = "";
                setFiles((all) => [
                  ...all.filter((f) => !picked.some((p) => p.name === f.name)),
                  ...picked,
                ]);
              }}
            />
            <textarea
              ref={area}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder={speech.listening ? t("editor.listening") : t("editor.composer")}
              className="max-h-[200px] min-h-[40px] flex-1 resize-none bg-transparent px-1.5 py-2 text-[14px] outline-none placeholder:text-ink-4"
            />
            {speech.supported ? (
              <IconButton
                label={
                  speech.processing
                    ? t("editor.transcribing")
                    : speech.listening
                      ? t("editor.voiceStop")
                      : t("editor.voice")
                }
                aria-pressed={speech.listening}
                disabled={speech.processing}
                onClick={speech.toggle}
                className={cn(
                  speech.listening && "bg-rose-tint text-rose hover:bg-rose-tint hover:text-rose",
                )}
              >
                {speech.processing ? (
                  <Spinner className="size-4" />
                ) : speech.listening ? (
                  <Square className="size-3.5 animate-pulse-dot fill-current" />
                ) : (
                  <Mic className="size-4" />
                )}
              </IconButton>
            ) : null}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!ready}
              className={cn(
                "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition",
                ready ? "bg-primary text-primary-foreground" : "bg-paper-2 text-ink-4",
              )}
              aria-label="Send"
            >
              <ArrowUp className="size-4" />
            </button>
          </div>
        </div>
        {speech.error ? (
          <p className="mt-2 px-1 text-[12px] text-rose">
            {speech.error === "denied" ? t("editor.micDenied") : speech.error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
