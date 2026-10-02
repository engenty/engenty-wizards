import type { AskAnswer, BrowserAct, ConfirmAsk, LoginAsk, RunAsk } from "@shared/run";
import {
  ArrowDown,
  ArrowUp,
  CornerDownLeft,
  LockKeyhole,
  PencilLine,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { Button, cn, Input, Label, Switch } from "../ui";

/** What a running step asks the person: a sign-in, or leave to change something. */
export function AskPanel({ runId, ask }: { runId: string; ask: RunAsk }) {
  return ask.kind === "confirm" ? (
    <ConfirmPanel runId={runId} ask={ask} />
  ) : (
    <LoginPanel runId={runId} ask={ask} />
  );
}

/**
 * A running step wants to change something in an account the person connected. They see what
 * and with which values, and decide.
 */
function ConfirmPanel({ runId, ask }: { runId: string; ask: ConfirmAsk }) {
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const answer = async (body: AskAnswer) => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/runs/${runId}/ask/${ask.id}`, body);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  const Icon = ask.action.destructive ? TriangleAlert : PencilLine;
  return (
    <div className="animate-rise">
      <div className="mb-5 flex items-start gap-3">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-full",
            ask.action.destructive ? "bg-rose-tint text-rose" : "bg-ember-tint text-ember-strong",
          )}
        >
          <Icon className="size-5" />
        </div>
        <div className="min-w-0">
          <p className="text-[13px] text-ink-3">{t("ask.wants", { service: ask.service })}</p>
          <h2 className="font-display font-semibold text-[20px] leading-snug tracking-tight">
            {ask.reason}
          </h2>
        </div>
      </div>
      <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded-xl bg-paper-2 p-4 text-[13px] leading-relaxed ring-1 ring-border-soft">
        {ask.input}
      </pre>
      <div className="mt-5 flex items-center gap-4">
        <Switch checked={remember} onChange={setRemember} label={t("ask.allowRest")} />
        <span className="flex-1 text-[13px] text-ink-2">{t("ask.allowRest")}</span>
      </div>
      {error ? (
        <div className="mt-3 rounded-lg bg-rose-tint px-4 py-3 text-[14px] text-rose">{error}</div>
      ) : null}
      <div className="mt-6 flex items-center justify-between gap-3">
        <Button variant="ghost" disabled={busy} onClick={() => void answer({ type: "skip" })}>
          {t("ask.deny")}
        </Button>
        <Button busy={busy} onClick={() => void answer({ type: "done", remember })}>
          {t("ask.allow")}
        </Button>
      </div>
    </div>
  );
}

/**
 * A running step asks the person to sign in on a page the wizard has open. The picture is that
 * page: they fill the form here, or click and type in the picture itself (a captcha, "continue
 * with Google"). What they enter goes into the page — the model never gets it.
 */
function LoginPanel({ runId, ask }: { runId: string; ask: LoginAsk }) {
  const [values, setValues] = useState<Record<string, string>>({});
  const [remember, setRemember] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  const [text, setText] = useState("");
  const [hidden, setHidden] = useState(false);
  const image = useRef<HTMLImageElement>(null);
  const refresh = useCallback(() => setTick((n) => n + 1), []);

  useEffect(() => {
    const id = setInterval(refresh, 2500);
    return () => clearInterval(id);
  }, [refresh]);

  const answer = async (body: AskAnswer) => {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/runs/${runId}/ask/${ask.id}`, body);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  const act = async (body: BrowserAct) => {
    setError(null);
    try {
      await api.post(`/api/runs/${runId}/browser/act`, body);
    } catch (err) {
      setError((err as Error).message);
    }
    refresh();
  };
  const click = (e: React.MouseEvent<HTMLImageElement>) => {
    const el = image.current;
    if (!el?.naturalWidth) {
      return;
    }
    const box = el.getBoundingClientRect();
    void act({
      type: "click",
      x: Math.round(((e.clientX - box.left) / box.width) * el.naturalWidth),
      y: Math.round(((e.clientY - box.top) / box.height) * el.naturalHeight),
    });
  };
  const filled = ask.fields.some((f) => values[f.id]);

  return (
    <div className="animate-rise">
      <div className="mb-5 flex items-start gap-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-ember-tint text-ember-strong">
          <LockKeyhole className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="font-display font-semibold text-[20px] leading-snug tracking-tight">
            {ask.reason}
          </h2>
          <p className="mt-0.5 truncate text-[13px] text-ink-3">
            {ask.site.host}
            {ask.site.title ? ` · ${ask.site.title}` : ""}
          </p>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl bg-paper-2 ring-1 ring-border-soft">
        <img
          ref={image}
          src={`/api/runs/${runId}/browser/screen?t=${tick}`}
          alt={ask.site.host}
          onClick={click}
          className="block w-full cursor-pointer"
        />
        <div className="flex items-center gap-1.5 border-border-soft border-t bg-card p-2">
          <Input
            type={hidden ? "password" : "text"}
            autoComplete="off"
            value={text}
            placeholder={t("ask.typeInto")}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void act({ type: "type", text }).then(() => setText(""));
              }
            }}
            className="h-9 text-[13px]"
          />
          <button
            type="button"
            onClick={() => setHidden((h) => !h)}
            className={cn(
              "h-9 shrink-0 rounded-md px-2.5 text-[12px]",
              hidden ? "bg-ember-veil text-ink" : "text-ink-3 hover:bg-paper-2",
            )}
          >
            {t("ask.hide")}
          </button>
          <ToolButton label="Enter" onClick={() => void act({ type: "key", key: "Enter" })}>
            <CornerDownLeft className="size-4" />
          </ToolButton>
          <ToolButton label={t("ask.up")} onClick={() => void act({ type: "scroll", dy: -500 })}>
            <ArrowUp className="size-4" />
          </ToolButton>
          <ToolButton label={t("ask.down")} onClick={() => void act({ type: "scroll", dy: 500 })}>
            <ArrowDown className="size-4" />
          </ToolButton>
        </div>
      </div>
      <p className="mt-2 text-[12px] text-ink-4">{t("ask.pictureHint")}</p>

      {ask.fields.length ? (
        <form
          className="mt-5 flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void answer({ type: "fill", values, remember });
          }}
        >
          {ask.fields.map((f, i) => (
            <div key={f.id}>
              <Label>{f.label}</Label>
              <Input
                autoFocus={i === 0}
                type={f.secret ? "password" : "text"}
                autoComplete="off"
                value={values[f.id] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.id]: e.target.value }))}
              />
            </div>
          ))}
          <button type="submit" hidden />
        </form>
      ) : null}

      <div className="mt-5 flex items-center justify-between gap-4">
        <Switch checked={remember} onChange={setRemember} label={t("ask.remember")} />
        <span className="flex-1 text-[13px] text-ink-2">{t("ask.remember")}</span>
      </div>
      <p className="mt-3 flex items-start gap-2 text-[13px] text-ink-3">
        <ShieldCheck className="mt-0.5 size-4 shrink-0 text-moss" /> {t("ask.private")}
      </p>
      {error ? (
        <div className="mt-3 rounded-lg bg-rose-tint px-4 py-3 text-[14px] text-rose">{error}</div>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
        <Button variant="ghost" disabled={busy} onClick={() => void answer({ type: "skip" })}>
          {t("ask.skip")}
        </Button>
        <div className="flex flex-wrap gap-2">
          {ask.fields.length ? (
            <Button
              variant="secondary"
              disabled={busy}
              onClick={() => void answer({ type: "done", remember })}
            >
              {t("ask.done")}
            </Button>
          ) : null}
          {ask.fields.length ? (
            <Button
              busy={busy}
              disabled={!filled}
              onClick={() => void answer({ type: "fill", values, remember })}
            >
              {t("ask.signIn")}
            </Button>
          ) : (
            <Button busy={busy} onClick={() => void answer({ type: "done", remember })}>
              {t("ask.done")}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function ToolButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="flex size-9 shrink-0 items-center justify-center rounded-md text-ink-3 hover:bg-paper-2 hover:text-ink"
    >
      {children}
    </button>
  );
}
