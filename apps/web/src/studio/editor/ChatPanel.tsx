import type { WizardDefinition } from "@engenty-wizards/shared/definition";
import { useQueryClient } from "@tanstack/react-query";
import {
  ArrowUp,
  ChevronDown,
  ChevronUp,
  Mic,
  Paperclip,
  Plug,
  Plus,
  Sparkles,
  Square,
  X,
} from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { Mascot } from "../../brand";
import { postStream } from "../../lib/api";
import { withBase } from "../../lib/base";
import { t } from "../../lib/i18n";
import type { WizardDetail } from "../../lib/session";
import { useDictation } from "../../lib/speech";
import { Markdown } from "../../runner/outputs";
import { cn, IconButton, Spinner } from "../../ui";

export interface ChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  changed?: boolean;
  pending?: boolean;
  source?: "studio" | "mcp";
  client?: string | null;
  /** Pictures sent with this message, by file name, shown before the server has them. */
  previews?: Record<string, string>;
}

const IMAGE = /\.(png|jpe?g|gif|webp|avif|svg)$/i;

/** Local URLs for the pictures among `files`, so the thread shows them right away. */
export function previewsOf(files: File[]): Record<string, string> | undefined {
  const images = files.filter((f) => f.type.startsWith("image/"));
  return images.length
    ? Object.fromEntries(images.map((f) => [f.name, URL.createObjectURL(f)]))
    : undefined;
}

/** A message's own text and the files its last line names ("Angehängt: a.png, b.pdf"). */
function attachmentsOf(content: string): { text: string; names: string[] } {
  const match = content.match(/(?:^|\n\n)(?:Angehängt|Attached): ([^\n]+)$/);
  if (!match) {
    return { text: content, names: [] };
  }
  return {
    text: content.slice(0, match.index).trim(),
    names: match[1].split(", ").filter(Boolean),
  };
}

/** A clipboard picture is always "image.png"; give each its own name so two pastes both stay. */
function pastedName(file: File, index: number): File {
  if (file.name && file.name !== "image.png") {
    return file;
  }
  const ext = file.type.split("/")[1]?.replace("jpeg", "jpg") || "png";
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:]/g, "").replace("T", "-");
  return new File([file], `paste-${stamp}${index ? `-${index + 1}` : ""}.${ext}`, {
    type: file.type,
  });
}

function Thumb({ url, label, children }: { url: string; label: string; children?: ReactNode }) {
  return (
    <div className="group relative" title={label}>
      <img
        src={url}
        alt={label}
        width={64}
        height={64}
        className="size-16 rounded-lg bg-paper-2 object-cover ring-1 ring-border"
      />
      {children}
    </div>
  );
}

/** The pictures and files a user message carries, above its bubble. */
function Attachments({
  names,
  previews,
  fileUrl,
}: {
  names: string[];
  previews?: Record<string, string>;
  fileUrl?: (name: string) => string;
}) {
  const images = names.filter((n) => previews?.[n] || (fileUrl && IMAGE.test(n)));
  const others = names.filter((n) => !images.includes(n));
  return (
    <div className="flex flex-col items-end gap-1.5">
      {images.map((name) => {
        const url = previews?.[name] ?? fileUrl?.(name) ?? "";
        return (
          <a key={name} href={url} target="_blank" rel="noreferrer" title={name}>
            <img
              src={url}
              alt={name}
              className="max-h-60 w-auto max-w-full rounded-xl bg-paper-2 object-contain ring-1 ring-border"
            />
          </a>
        );
      })}
      {others.length ? (
        <div className="flex flex-wrap justify-end gap-1.5">
          {others.map((name) => (
            <span
              key={name}
              className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-paper-2 px-2.5 py-1 text-[12px] text-ink-2"
            >
              <Paperclip className="size-3 shrink-0 text-ink-4" />
              <span className="truncate">{name}</span>
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
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
  const [thought, setThought] = useState<string | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
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
    setStartedAt(Date.now());
    setThought(null);
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
        setStartedAt(null);
        await qc.invalidateQueries({ queryKey: ["wizard", wizard.id] });
        return false;
      }
      const named = `${t("editor.attached")}: ${files.map((f) => f.name).join(", ")}`;
      text = text.trim() ? `${text}\n\n${named}` : named;
    }
    const pendingId = `p-${Date.now()}`;
    setMessages((m) => [
      ...m,
      { id: `u-${Date.now()}`, role: "user", content: text, previews: previewsOf(files) },
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
          } else if (event === "thought") {
            setThought(JSON.parse(data) as string);
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
      setThought(null);
      setStartedAt(null);
      setMessages((m) =>
        m.filter((x) => !(x.id === pendingId && !x.content)).map((x) => ({ ...x, pending: false })),
      );
      setPhase("idle");
      await qc.invalidateQueries({ queryKey: ["wizard", wizard.id] });
      await qc.invalidateQueries({ queryKey: ["me"] });
    }
    return true;
  };

  const fileUrl = (name: string) =>
    withBase(`/api/studio/wizards/${wizard?.id}/files/${encodeURIComponent(name)}`);

  return { messages, phase, activity, thought, startedAt, error, send, fileUrl };
}

/** What the panel shows and sends; the architect's chat and the project assistant both are one. */
export type Chat = Pick<
  ReturnType<typeof useArchitectChat>,
  "messages" | "phase" | "activity" | "startedAt" | "error" | "send"
> & {
  thought?: string | null;
  /** Where a file the thread names can be loaded from, once the message is the server's. */
  fileUrl?: (name: string) => string;
};

/** Seconds since `since`, counting up once a second; null while nothing runs. */
function useElapsed(since: number | null): number | null {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (since === null) {
      return;
    }
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [since]);
  return since === null ? null : Math.max(0, Math.floor((now - since) / 1000));
}

function elapsed(seconds: number): string {
  return seconds < 60
    ? `${seconds} s`
    : `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")} min`;
}

/** What a running turn does, for how long, and — with `thought` — the line it is thinking about. */
export function Working({
  chat,
  thought,
  className,
  spinner = "size-3.5",
}: {
  chat: Chat;
  thought?: boolean;
  className?: string;
  spinner?: string;
}) {
  const seconds = useElapsed(chat.startedAt);
  return (
    <div className={cn("min-w-0", className)}>
      <div className="flex min-w-0 items-center gap-2">
        <Spinner className={cn("shrink-0", spinner)} />
        <span className="min-w-0 truncate">
          {chat.activity ??
            (chat.phase === "building" ? t("editor.building") : t("editor.thinking"))}
        </span>
        {seconds === null ? null : (
          <span className="shrink-0 text-ink-4 tabular-nums">{elapsed(seconds)}</span>
        )}
      </div>
      {thought && chat.thought ? (
        <p className="mt-0.5 truncate pl-5.5 text-[12px] text-ink-4">{chat.thought}</p>
      ) : null}
    </div>
  );
}

function UserMessage({
  message,
  fileUrl,
}: {
  message: ChatMessage;
  fileUrl?: (name: string) => string;
}) {
  const { text, names } = attachmentsOf(message.content);
  return (
    <div className="ml-8 flex flex-col items-end gap-1.5 self-end">
      {names.length ? (
        <Attachments names={names} previews={message.previews} fileUrl={fileUrl} />
      ) : null}
      {text ? (
        <div className="rounded-xl rounded-br-md bg-paper-2 px-4 py-2.5 text-[14px] leading-relaxed">
          <span className="whitespace-pre-wrap">{text}</span>
        </div>
      ) : null}
    </div>
  );
}

export function ChatPanel({
  chat,
  avatar,
  hello = t("editor.chatHello"),
  placeholder = t("editor.composer"),
  changedLabel = "Ablauf aktualisiert",
  compact,
  intro,
}: {
  chat: Chat;
  avatar: string;
  hello?: string;
  placeholder?: string;
  changedLabel?: string;
  /** Only the composer and one line about the last turn; the thread opens on demand. */
  compact?: boolean;
  /** What an empty thread shows in place of the avatar with `hello`. */
  intro?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
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
  const add = (picked: File[]) =>
    setFiles((all) => [...all.filter((f) => !picked.some((p) => p.name === f.name)), ...picked]);
  const [thumbs, setThumbs] = useState<Map<File, string>>(new Map());
  useEffect(() => {
    const next = new Map(
      files.filter((f) => f.type.startsWith("image/")).map((f) => [f, URL.createObjectURL(f)]),
    );
    setThumbs(next);
    return () => {
      for (const url of next.values()) {
        URL.revokeObjectURL(url);
      }
    };
  }, [files]);
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
  const thread = !compact || open;
  const last = chat.messages.at(-1);
  return (
    <div className="flex h-full min-h-0 flex-col">
      {compact && (last || chat.error) ? (
        <button
          type="button"
          aria-expanded={open}
          aria-label={t("editor.thread")}
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-2 px-4 pt-2.5 pb-0.5 text-left text-[13px] text-ink-3 transition hover:text-ink"
        >
          {!(chat.error || open) && last?.pending ? (
            <Working chat={chat} className="flex-1" />
          ) : (
            <span className={cn("min-w-0 flex-1 truncate", chat.error && "text-rose")}>
              {chat.error ?? (open ? t("editor.thread") : last?.content)}
            </span>
          )}
          {open ? (
            <ChevronDown className="size-4 shrink-0" />
          ) : (
            <ChevronUp className="size-4 shrink-0" />
          )}
        </button>
      ) : null}
      <div
        ref={scroller}
        className={cn("min-h-0 flex-1 overflow-y-auto px-5 py-5", !thread && "hidden")}
      >
        {chat.messages.length === 0
          ? (intro ?? (
              <div className="flex items-start gap-3">
                <Mascot kind={avatar} size={32} interactive={false} />
                <p className="pt-1 text-[14px] text-ink-2 leading-relaxed">{hello}</p>
              </div>
            ))
          : null}
        <div className="flex flex-col gap-4">
          {chat.messages.map((m) =>
            m.role === "user" ? (
              <UserMessage key={m.id} message={m} fileUrl={chat.fileUrl} />
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
                    <Working chat={chat} thought className="mt-1 text-[13px] text-ink-3" />
                  ) : null}
                  {m.changed ? (
                    <div className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-ember-tint px-2.5 py-0.5 text-[12px] text-ember-strong">
                      <Sparkles className="size-3" /> {changedLabel}
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
      <div className={compact ? "p-2" : "p-3"}>
        <div className="rounded-xl bg-card p-1.5 shadow-soft ring-1 ring-border focus-within:ring-focus">
          {thumbs.size ? (
            <div className="flex flex-wrap gap-2 px-1 pt-1 pb-1.5">
              {files.map((f, i) => {
                const url = thumbs.get(f);
                return url ? (
                  <Thumb key={`${f.name}-${i}`} url={url} label={f.name}>
                    <button
                      type="button"
                      aria-label={t("editor.detach")}
                      onClick={() => setFiles((all) => all.filter((_, j) => j !== i))}
                      className="-top-1.5 -right-1.5 absolute flex size-5 items-center justify-center rounded-full bg-ink text-paper opacity-0 shadow-soft transition focus-visible:opacity-100 group-hover:opacity-100"
                    >
                      <X className="size-3" />
                    </button>
                  </Thumb>
                ) : null;
              })}
            </div>
          ) : null}
          {files.some((f) => !thumbs.has(f)) ? (
            <ul className="flex flex-wrap gap-1.5 px-1 pt-1 pb-1.5">
              {files.map((f, i) =>
                thumbs.has(f) ? null : (
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
                ),
              )}
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
                add(picked);
              }}
            />
            <textarea
              ref={area}
              rows={1}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onPaste={(e) => {
                const pasted = Array.from(e.clipboardData.files);
                if (pasted.length) {
                  e.preventDefault();
                  add(pasted.map(pastedName));
                }
              }}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              placeholder={speech.listening ? t("editor.listening") : placeholder}
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
