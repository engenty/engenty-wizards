import { ArrowUp, Check, ChevronDown, Mic, Paperclip, Plus, Square, X } from "lucide-react";
import { type ReactNode, type Ref, useEffect, useImperativeHandle, useRef, useState } from "react";
import { t } from "../lib/i18n";
import { useDictation, useDictationSettings, useMicrophones } from "../lib/speech";
import { cn, IconButton, Spinner, Switch } from "./index";

/** A clipboard picture is always "image.png"; give each its own name so two pastes both stay. */
export function pastedName(file: File, index: number): File {
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

/** What a conversation around the composer can do with it: files dropped on it go in here. */
export interface ComposerHandle {
  add: (files: File[]) => void;
  focus: () => void;
}

/** Taller than this the field scrolls. */
const MAX_HEIGHT = 200;

/**
 * The field a message is written in: text (typed or spoken), files (picked, pasted or handed in
 * through `ref`), and the send button. One line, it is a pill; the buttons stay level with the
 * text, and on the last line once it grows. `floating` lifts it off the page for a composer that
 * stands at the lower edge of the window.
 */
export function Composer({
  placeholder,
  disabled,
  onSend,
  attach = true,
  floating,
  autoFocus,
  className,
  ref,
}: {
  placeholder?: string;
  /** Typing goes on; sending waits, e.g. while the answer to the last message comes in. */
  disabled?: boolean;
  /** False keeps the draft, e.g. when sending failed. */
  onSend: (text: string, files: File[]) => boolean | Promise<boolean>;
  attach?: boolean;
  floating?: boolean;
  autoFocus?: boolean;
  className?: string;
  ref?: Ref<ComposerHandle>;
}) {
  const [text, setText] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [tall, setTall] = useState(false);
  const area = useRef<HTMLTextAreaElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const [prefs] = useDictationSettings();
  const speech = useDictation(text, setText, { deviceId: prefs.deviceId });
  const add = (picked: File[]) =>
    setFiles((all) => [...all.filter((f) => !picked.some((p) => p.name === f.name)), ...picked]);
  useImperativeHandle(ref, () => ({ add, focus: () => area.current?.focus() }));

  // The height follows the text, typed or spoken, and the field's width. Empty, the field is one
  // line; a placeholder that wraps does not make it taller.
  useEffect(() => {
    const el = area.current;
    if (!el) {
      return;
    }
    const fit = () => {
      el.style.height = "auto";
      const one = Number.parseFloat(getComputedStyle(el).minHeight) || 0;
      el.style.height = text ? `${Math.min(el.scrollHeight, MAX_HEIGHT)}px` : "";
      setTall(Boolean(text) && el.scrollHeight > one + 1);
    };
    fit();
    let width = el.clientWidth;
    const observer = new ResizeObserver(() => {
      // Only a new width: the height this sets would call it again.
      if (el.clientWidth !== width) {
        width = el.clientWidth;
        fit();
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [text]);

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

  const ready = Boolean(text.trim() || files.length > 0) && !disabled;
  const submit = async () => {
    if (!ready) {
      return;
    }
    if (speech.listening) {
      speech.stop();
    }
    const draft = { text, files };
    setText("");
    setFiles([]);
    if (!(await onSend(draft.text.trim(), draft.files))) {
      setText(draft.text);
      setFiles(draft.files);
    }
  };
  const detach = (i: number) => setFiles((all) => all.filter((_, j) => j !== i));

  return (
    <div className={className}>
      <div
        className={cn(
          "bg-card p-1 ring-1 ring-border focus-within:ring-focus",
          tall || files.length ? "rounded-[1.375rem]" : "rounded-full",
          floating ? "shadow-overlay" : "shadow-soft",
        )}
      >
        {thumbs.size ? (
          <div className="flex flex-wrap gap-2 px-2 pt-2 pb-1">
            {files.map((f, i) => {
              const url = thumbs.get(f);
              return url ? (
                <Thumb key={`${f.name}-${i}`} url={url} label={f.name}>
                  <button
                    type="button"
                    aria-label={t("editor.detach")}
                    onClick={() => detach(i)}
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
          <ul className="flex flex-wrap gap-1.5 px-2 pt-2 pb-1">
            {files.map((f, i) =>
              thumbs.has(f) ? null : (
                <li
                  key={`${f.name}-${i}`}
                  className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-paper-2 py-1 pr-1 pl-2.5 text-[0.75rem] text-ink-2"
                >
                  <Paperclip className="size-3 shrink-0 text-ink-4" />
                  <span className="truncate">{f.name}</span>
                  <button
                    type="button"
                    aria-label={t("editor.detach")}
                    onClick={() => detach(i)}
                    className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-ink-3 hover:bg-paper-3 hover:text-ink"
                  >
                    <X className="size-3" />
                  </button>
                </li>
              ),
            )}
          </ul>
        ) : null}
        {/* The field is as high as a button on one line, so text and buttons share a middle. */}
        <div className="flex items-end gap-0.5">
          {attach ? (
            <>
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
            </>
          ) : null}
          <textarea
            ref={area}
            rows={1}
            value={text}
            autoFocus={autoFocus}
            onChange={(e) => setText(e.target.value)}
            onPaste={(e) => {
              const pasted = Array.from(e.clipboardData.files);
              if (attach && pasted.length) {
                e.preventDefault();
                add(pasted.map(pastedName));
              }
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void submit();
              }
            }}
            placeholder={speech.listening ? t("editor.listening") : placeholder}
            className={cn(
              "max-h-[200px] min-h-9 flex-1 resize-none bg-transparent py-2 text-[0.875rem] leading-5 outline-none placeholder:truncate placeholder:text-ink-4 coarse:min-h-11 coarse:py-3",
              attach ? "px-1" : "px-3",
            )}
          />
          {speech.supported ? <DictationButton speech={speech} /> : null}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={!ready}
            className={cn(
              "inline-flex size-9 shrink-0 items-center justify-center rounded-full transition coarse:size-11",
              ready ? "bg-primary text-primary-foreground" : "bg-paper-2 text-ink-4",
            )}
            aria-label={t("composer.send")}
          >
            <ArrowUp className="size-4" />
          </button>
        </div>
      </div>
      {speech.error ? (
        <p className="mt-2 px-3 text-[0.75rem] text-rose">
          {speech.error === "denied" ? t("editor.micDenied") : speech.error}
        </p>
      ) : null}
    </div>
  );
}

type Speech = ReturnType<typeof useDictation>;

/**
 * The mic button and, beside it, its menu: which microphone, and whether the button records while
 * it is held (push to talk) or on and off with a click.
 */
function DictationButton({ speech }: { speech: Speech }) {
  const [prefs, setPrefs] = useDictationSettings();
  const mics = useMicrophones();
  const [menu, setMenu] = useState<{ bottom: number; right: number } | null>(null);
  const opener = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!menu) {
      return;
    }
    void mics.refresh();
    const away = (e: PointerEvent) => {
      const target = e.target as Node;
      if (!(panel.current?.contains(target) || opener.current?.contains(target))) {
        setMenu(null);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setMenu(null);
        opener.current?.focus();
      }
    };
    const close = () => setMenu(null);
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", onKey);
    window.addEventListener("resize", close);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", onKey);
      window.removeEventListener("resize", close);
    };
  }, [menu, mics.refresh]);
  const open = () => {
    const rect = opener.current?.getBoundingClientRect();
    if (rect) {
      // Fixed to the window: a card around the composer that clips its content does not cut it.
      setMenu({ bottom: window.innerHeight - rect.top + 8, right: window.innerWidth - rect.right });
    }
  };

  const label = speech.processing
    ? t("editor.transcribing")
    : speech.listening
      ? t("editor.voiceStop")
      : prefs.hold
        ? t("dictation.holdToTalk")
        : t("editor.voice");
  // Held: down starts, up (wherever the pointer is then) stops; Space or Enter the same way.
  const hold = prefs.hold
    ? {
        onPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => {
          if (e.button !== 0) {
            return;
          }
          e.preventDefault();
          e.currentTarget.setPointerCapture(e.pointerId);
          speech.start();
        },
        onPointerUp: () => speech.stop(),
        onPointerCancel: () => speech.stop(),
        onKeyDown: (e: React.KeyboardEvent) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            speech.start();
          }
        },
        onKeyUp: (e: React.KeyboardEvent) => {
          if (e.key === " " || e.key === "Enter") {
            speech.stop();
          }
        },
      }
    : { onClick: speech.toggle };
  const choices = [
    { deviceId: "", label: t("dictation.default") },
    ...mics.devices.map((d, i) => ({
      deviceId: d.deviceId,
      label: d.label || t("dictation.mic", { n: i + 1 }),
    })),
  ];
  // A chosen microphone that is gone falls back to the default one.
  const chosen = choices.some((c) => c.deviceId === prefs.deviceId) ? prefs.deviceId : "";

  return (
    <div className="flex shrink-0 items-center">
      <IconButton
        label={label}
        aria-pressed={speech.listening}
        disabled={speech.processing}
        {...hold}
        className={cn(
          "touch-none",
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
      <button
        ref={opener}
        type="button"
        aria-label={t("dictation.settings")}
        title={t("dictation.settings")}
        aria-haspopup="menu"
        aria-expanded={Boolean(menu)}
        onClick={() => (menu ? setMenu(null) : open())}
        className={cn(
          "-ml-1.5 inline-flex h-9 w-5 shrink-0 items-center justify-center rounded-full text-ink-4 transition hover:text-ink coarse:h-11",
          menu && "text-ink",
        )}
      >
        <ChevronDown className={cn("size-3.5 transition-transform", menu && "rotate-180")} />
      </button>
      {menu ? (
        <div
          ref={panel}
          role="menu"
          aria-label={t("dictation.settings")}
          className="fixed z-50 w-72 max-w-[calc(100vw-2rem)] animate-rise rounded-xl bg-card p-1.5 text-[0.875rem] shadow-overlay ring-1 ring-border-soft"
          style={{ bottom: menu.bottom, right: Math.max(16, menu.right - 8) }}
        >
          <p className="px-2.5 pt-1.5 pb-1 text-[0.75rem] text-ink-3">
            {t("dictation.microphone")}
          </p>
          {choices.map((c) => (
            <button
              key={c.deviceId || "default"}
              type="button"
              role="menuitemradio"
              aria-checked={c.deviceId === chosen}
              onClick={() => {
                setPrefs({ deviceId: c.deviceId });
                setMenu(null);
              }}
              className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left hover:bg-paper-2"
            >
              <span className="min-w-0 flex-1 truncate">{c.label}</span>
              {c.deviceId === chosen ? (
                <Check className="size-4 shrink-0 text-ember-strong" />
              ) : null}
            </button>
          ))}
          {mics.named ? null : (
            <button
              type="button"
              role="menuitem"
              onClick={() => void mics.allow()}
              className="flex w-full rounded-lg px-2.5 py-2 text-left text-ink-3 hover:bg-paper-2 hover:text-ink"
            >
              {t("dictation.showMics")}
            </button>
          )}
          <div className="my-1.5 h-px bg-border-soft" />
          <div className="flex items-center justify-between gap-3 px-2.5 py-1.5">
            <span>{t("dictation.hold")}</span>
            <Switch
              checked={prefs.hold}
              label={t("dictation.hold")}
              onChange={(next) => setPrefs({ hold: next })}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}
