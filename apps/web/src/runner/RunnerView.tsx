import type { PageStep, ResultStep, ReviewStep } from "@engenty-wizards/shared/definition";
import type { RunView } from "@engenty-wizards/shared/run";
import {
  ArrowLeft,
  ArrowRight,
  Bell,
  BellRing,
  Pencil,
  RefreshCw,
  RotateCcw,
  Sparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Mascot } from "../brand";
import { t } from "../lib/i18n";
import { ShareResultButton } from "../share/ShareSheet";
import { Button, Card, cn, Spinner, Textarea } from "../ui";
import { AskPanel } from "./AskPanel";
import {
  disableNotify,
  enableNotify,
  notificationsBlocked,
  signalPerson,
  useKeyboardInset,
  useNotifyState,
  useWakeLock,
} from "./device";
import { FieldInput, type Values } from "./fields";
import { DownloadButtons, OutputView } from "./outputs";
import { ListDownloads, ListTable, StoreButton } from "./store";
import { useRun } from "./useRun";

type Run = ReturnType<typeof useRun>;

function Progress({ view }: { view: RunView }) {
  const pct = Math.round(
    (Math.min(view.progress.done, view.progress.total) / Math.max(1, view.progress.total)) * 100,
  );
  return (
    <div className="h-[3px] w-full bg-paper-2">
      <div
        className="h-full bg-ember transition-[width] duration-700 ease-out"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function StepHeading({
  title,
  description,
  kicker,
}: {
  title: string;
  description?: string;
  kicker?: string | null;
}) {
  return (
    <div className="mb-8">
      {kicker ? <p className="mb-4 text-[15px] text-ink-2 leading-relaxed">{kicker}</p> : null}
      <h1 className="font-display font-semibold text-[28px] leading-[1.15] tracking-tight sm:text-[32px]">
        {title}
      </h1>
      {description ? (
        <p className="mt-2 text-[15px] text-ink-3 leading-relaxed">{description}</p>
      ) : null}
    </div>
  );
}

function initialValues(step: PageStep, view: RunView): Values {
  const out: Values = {};
  for (const f of step.fields) {
    out[f.id] = view.values[f.id] ?? f.default ?? (f.kind === "multiselect" ? [] : undefined);
  }
  return out;
}

/** Text inputs of a page, in order — what Enter and the keyboard's action key walk through. */
function typedInputs(form: HTMLElement): HTMLElement[] {
  return Array.from(
    form.querySelectorAll<HTMLElement>(
      'input:not([type="hidden"], [type="file"], [type="checkbox"], [type="color"], [type="range"], [disabled]), textarea:not([disabled])',
    ),
  ).filter((el) => !el.closest("dialog") && el.offsetParent !== null);
}

function PageForm({ view, run, step }: { view: RunView; run: Run; step: PageStep }) {
  // Keyed by the page at the call site, so a page (or a page revisited) starts from the run's values.
  const [values, setValues] = useState<Values>(() => initialValues(step, view));
  // Fields still uploading or recording; going on now would leave their answer behind.
  const [pending, setPending] = useState<ReadonlySet<string>>(new Set());
  const form = useRef<HTMLFormElement>(null);
  const first = view.progress.done === 0;
  const submit = () => void run.submitPage(step.id, values);

  // The keyboard's action key says what it does: "next" between fields, "go" on the last one.
  useEffect(() => {
    if (!form.current) {
      return;
    }
    const inputs = typedInputs(form.current).filter((el) => el instanceof HTMLInputElement);
    for (const [i, el] of inputs.entries()) {
      if (el.dataset.hint || !el.hasAttribute("enterkeyhint")) {
        el.dataset.hint = "1";
        el.setAttribute("enterkeyhint", i === inputs.length - 1 ? "go" : "next");
      }
    }
  });

  return (
    <form
      ref={form}
      className="animate-rise"
      onSubmit={(e) => {
        e.preventDefault();
        if (!pending.size) {
          submit();
        }
      }}
      onKeyDown={(e) => {
        const el = e.target;
        if (
          e.key !== "Enter" ||
          e.defaultPrevented ||
          e.nativeEvent.isComposing ||
          !(el instanceof HTMLInputElement) ||
          el.closest("dialog")
        ) {
          return;
        }
        // Enter walks to the next field; only on the last one it sends the page.
        const inputs = typedInputs(e.currentTarget);
        const next = inputs[inputs.indexOf(el) + 1];
        if (next) {
          e.preventDefault();
          next.focus();
        }
      }}
    >
      <StepHeading
        title={step.title}
        description={step.description}
        kicker={first ? view.wizard.intro : null}
      />
      <div className="flex flex-col gap-7">
        {step.fields.map((f) => (
          <FieldInput
            key={f.id}
            field={f}
            value={values[f.id]}
            values={values}
            runId={view.id}
            view={view}
            error={run.fieldErrors[f.id]}
            onChange={(v) => setValues((prev) => ({ ...prev, [f.id]: v }))}
            onBusy={(busy) =>
              setPending((prev) => {
                if (prev.has(f.id) === busy) {
                  return prev;
                }
                const next = new Set(prev);
                if (busy) {
                  next.add(f.id);
                } else {
                  next.delete(f.id);
                }
                return next;
              })
            }
          />
        ))}
      </div>
      <Footer view={view} run={run} sticky>
        <Button type="submit" size="lg" busy={run.busy} disabled={pending.size > 0}>
          {step.cta || t("run.next")} <ArrowRight className="size-4" />
        </Button>
      </Footer>
    </form>
  );
}

function Footer({
  view,
  run,
  sticky,
  children,
}: {
  view: RunView;
  run: Run;
  /** The page's primary action: on a phone it stays in reach at the bottom of the screen. */
  sticky?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className={cn("mt-10 flex items-center justify-between gap-3", sticky && "action-bar")}>
      {view.canBack ? (
        <Button variant="ghost" onClick={() => void run.back()} disabled={run.busy}>
          <ArrowLeft className="size-4" /> {t("run.back")}
        </Button>
      ) : (
        <span />
      )}
      {children}
    </div>
  );
}

/** "Tell me when it's done": asked for with a tap, never on page load. */
function NotifyToggle() {
  const state = useNotifyState();
  const [busy, setBusy] = useState(false);
  const on = state !== "off";
  return (
    <div className="mt-6 flex flex-col items-center gap-2">
      <button
        type="button"
        aria-pressed={on}
        disabled={busy}
        onClick={async () => {
          if (on) {
            disableNotify();
            return;
          }
          setBusy(true);
          await enableNotify();
          setBusy(false);
        }}
        className={cn(
          "inline-flex h-11 items-center gap-2 rounded-full px-4 font-medium text-[14px] ring-1 transition",
          on
            ? "bg-ember-tint text-ink ring-ember"
            : "bg-card text-ink-2 ring-input hover:text-ink hover:ring-ink-4",
        )}
      >
        {on ? <BellRing className="size-4 text-ember-strong" /> : <Bell className="size-4" />}
        {t(on ? "notify.on" : "notify.ask")}
      </button>
      <p className="max-w-xs text-[12px] text-ink-4 leading-relaxed">
        {state === "off"
          ? t("notify.why")
          : state === "on"
            ? t("notify.onHint")
            : t(notificationsBlocked() ? "notify.blocked" : "notify.quiet")}
      </p>
    </div>
  );
}

function Working({
  view,
  compact,
  awake,
}: {
  view: RunView;
  compact?: boolean;
  /** The screen is kept on while the step works. */
  awake: boolean;
}) {
  const started = useMemo(() => {
    const e = [...view.events]
      .reverse()
      .find((ev) => ev.type === "step_started" && ev.stepId === view.step?.id);
    return e ? new Date(e.at).getTime() : Date.now();
  }, [view.events, view.step?.id]);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const label =
    [...view.events]
      .reverse()
      .find((ev) => ev.type === "step_started" && ev.stepId === view.step?.id)?.message ??
    view.step?.title ??
    t("run.working");
  const trail = view.events
    .filter(
      (ev) =>
        (ev.type === "tool" || ev.type === "info") && new Date(ev.at).getTime() >= started - 500,
    )
    .slice(-4);
  return (
    <div className="flex animate-rise flex-col items-center pt-6 text-center">
      <Mascot kind={view.wizard.avatar} size={compact ? 130 : 170} fluffy />
      <h2 className="mt-4 font-display font-semibold text-[22px] tracking-tight">{label}</h2>
      <div className="mt-1 text-[13px] text-ink-4 tabular-nums">
        {t("run.elapsed", { s: Math.max(0, Math.round((now - started) / 1000)) })}
      </div>
      <div className="mt-6 flex min-h-[7rem] w-full max-w-sm flex-col gap-1.5">
        {trail.map((ev, i) => (
          <div
            key={ev.id}
            className={cn(
              "flex items-center justify-center gap-2 text-[13px] transition-opacity",
              i === trail.length - 1 ? "text-ink-2" : "text-ink-4",
            )}
          >
            {i === trail.length - 1 ? (
              <Sparkles className="size-3.5 animate-breathe text-ember" />
            ) : null}
            <span className="truncate">{ev.message}</span>
          </div>
        ))}
      </div>
      {compact ? null : <NotifyToggle />}
      {awake ? <p className="mt-3 text-[12px] text-ink-4">{t("run.awake")}</p> : null}
    </div>
  );
}

/**
 * Tells the person when a step that took a while is done, or when it needs them (a sign-in, a
 * confirmation) — if they asked for it. A page in the background also marks its title.
 */
function useDoneSignal(view: RunView | null) {
  const last = useRef({ running: false, since: 0, ask: null as string | null });
  useEffect(() => {
    if (!view) {
      return;
    }
    const prev = last.current;
    const running = view.status === "running";
    const since = running ? (prev.running ? prev.since : Date.now()) : 0;
    const tell = (body: string) => {
      if (document.visibilityState !== "visible" && !document.title.startsWith("● ")) {
        document.title = `● ${document.title}`;
      }
      void signalPerson({ title: view.wizard.title, body, tag: view.id });
    };
    if (running && view.ask && view.ask.id !== prev.ask) {
      tell(t("notify.needsYou"));
    } else if (!running && prev.running && Date.now() - prev.since > 8000) {
      tell(
        view.status === "failed"
          ? t("run.failed")
          : view.status === "done"
            ? t("notify.done")
            : t("notify.next"),
      );
    }
    last.current = { running, since, ask: view.ask?.id ?? null };
  }, [view]);
  useEffect(() => {
    const seen = () => {
      if (document.visibilityState === "visible" && document.title.startsWith("● ")) {
        document.title = document.title.slice(2);
      }
    };
    document.addEventListener("visibilitychange", seen);
    return () => document.removeEventListener("visibilitychange", seen);
  }, []);
}

function Review({ view, run, step }: { view: RunView; run: Run; step: ReviewStep }) {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [editing, setEditing] = useState<Record<string, boolean>>({});
  const [noteFor, setNoteFor] = useState<string | null>(null);
  const [note, setNote] = useState("");
  return (
    <div className="animate-rise">
      <StepHeading title={step.title} description={step.description} />
      <div className="flex flex-col gap-6">
        {view.shown.map(({ step: s, output }) => {
          const editable = Boolean(step.edit) && s.type === "agent" && s.output.format !== "json";
          return (
            <section key={s.id}>
              <div className="mb-2 flex items-center justify-between gap-3">
                <h3 className="font-medium text-[13px] text-ink-3 uppercase tracking-[0.06em]">
                  {s.title}
                </h3>
                <div className="flex items-center">
                  {editable && !editing[s.id] ? (
                    <button
                      type="button"
                      onClick={() => setEditing((e) => ({ ...e, [s.id]: true }))}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-ink-2 hover:bg-accent hover:text-ink coarse:h-11"
                    >
                      <Pencil className="size-3.5" /> {t("run.edit")}
                    </button>
                  ) : null}
                  {step.regenerate ? (
                    <button
                      type="button"
                      onClick={() => {
                        setNoteFor(noteFor === s.id ? null : s.id);
                        setNote("");
                      }}
                      className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-ink-2 hover:bg-accent hover:text-ink coarse:h-11"
                    >
                      <RefreshCw className="size-3.5" /> {t("run.regenerate")}
                    </button>
                  ) : null}
                </div>
              </div>
              <OutputView
                base={`/api/runs/${view.id}`}
                step={s}
                output={output}
                editable={editable && editing[s.id]}
                draft={drafts[s.id]}
                onDraft={(text) => setDrafts((d) => ({ ...d, [s.id]: text }))}
              />
              {noteFor === s.id ? (
                <Card className="mt-3 animate-rise p-3">
                  <Textarea
                    autoFocus
                    minRows={2}
                    value={note}
                    placeholder={t("run.regenerateNote")}
                    onChange={(e) => setNote(e.target.value)}
                    className="border-0 bg-transparent shadow-none focus:ring-0"
                  />
                  <div className="flex justify-end gap-2 pt-1">
                    <Button variant="ghost" size="sm" onClick={() => setNoteFor(null)}>
                      {t("common.cancel")}
                    </Button>
                    <Button
                      size="sm"
                      busy={run.busy}
                      onClick={() => void run.regenerate(step.id, s.id, note)}
                    >
                      {t("run.regenerateGo")}
                    </Button>
                  </div>
                </Card>
              ) : null}
            </section>
          );
        })}
        {view.lists.map((list) => (
          <section key={list.def.id}>
            <h3 className="mb-2 font-medium text-[13px] text-ink-3 uppercase tracking-[0.06em]">
              {list.def.title}
            </h3>
            <ListTable runId={view.id} list={list} editable />
          </section>
        ))}
      </div>
      <Footer view={view} run={run} sticky>
        <Button
          size="lg"
          busy={run.busy}
          onClick={() => void run.accept(step.id, Object.keys(drafts).length ? drafts : undefined)}
        >
          {t("run.accept")} <ArrowRight className="size-4" />
        </Button>
      </Footer>
    </div>
  );
}

function Result({
  view,
  run,
  step,
  onRestart,
}: {
  view: RunView;
  run: Run;
  step: ResultStep;
  onRestart?: () => void;
}) {
  return (
    <div className="animate-rise">
      <div className="mb-8 flex flex-wrap items-center gap-x-4 gap-y-5">
        <Mascot kind={view.wizard.avatar} size={64} />
        {/* On a phone the title keeps the row; the share button goes below it. */}
        <div className="min-w-0 flex-1 basis-[12rem]">
          <h1 className="text-balance font-display font-semibold text-[28px] leading-tight tracking-tight sm:text-[32px]">
            {step.title}
          </h1>
          {step.message ? <p className="mt-1 text-[15px] text-ink-3">{step.message}</p> : null}
        </div>
        {view.shown.some((x) => x.output) ? (
          <div className="max-sm:basis-full">
            <ShareResultButton
              runId={view.id}
              title={`${step.title} · ${view.wizard.title}`}
              initial={view.shareUrl ? { url: view.shareUrl, expiresAt: view.expiresAt } : null}
            />
          </div>
        ) : null}
      </div>
      <div className="flex flex-col gap-6">
        {view.shown.map(({ step: s, output, formats, label }) => (
          <Card key={s.id} className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display font-semibold text-[17px]">{label ?? s.title}</h3>
              <DownloadButtons
                base={`/api/runs/${view.id}`}
                stepId={s.id}
                formats={formats}
                title={label ?? s.title}
              />
            </div>
            <OutputView base={`/api/runs/${view.id}`} step={s} output={output} />
          </Card>
        ))}
        {view.lists.map((list) => (
          <Card key={list.def.id} className="p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h3 className="font-display font-semibold text-[17px]">
                {list.label ?? list.def.title}
              </h3>
              <ListDownloads runId={view.id} list={list} />
            </div>
            <ListTable runId={view.id} list={list} editable />
          </Card>
        ))}
      </div>
      <Footer view={view} run={run}>
        {onRestart ? (
          <Button variant="secondary" onClick={onRestart}>
            <RotateCcw className="size-4" /> {t("run.again")}
          </Button>
        ) : (
          <span />
        )}
      </Footer>
    </div>
  );
}

function Failed({ view, run }: { view: RunView; run: Run }) {
  return (
    <div className="flex animate-rise flex-col items-center pt-8 text-center">
      <Mascot kind={view.wizard.avatar} size={90} />
      <h2 className="mt-4 font-display font-semibold text-[22px]">{t("run.failed")}</h2>
      <p className="mt-2 max-w-md text-[15px] text-ink-3">{view.error}</p>
      <div className="mt-8 flex gap-3">
        {view.canBack ? (
          <Button variant="ghost" onClick={() => void run.back()}>
            <ArrowLeft className="size-4" /> {t("run.back")}
          </Button>
        ) : null}
        <Button onClick={() => void run.retry()} busy={run.busy}>
          <RotateCcw className="size-4" /> {t("run.retry")}
        </Button>
      </div>
    </div>
  );
}

export function RunnerBody({
  runId,
  compact,
  onRestart,
  onView,
}: {
  runId: string;
  compact?: boolean;
  onRestart?: () => void;
  onView?: (view: RunView | null) => void;
}) {
  const run = useRun(runId);
  const { view } = run;
  useEffect(() => {
    onView?.(view);
  }, [view, onView]);
  useKeyboardInset();
  const awake = useWakeLock(view?.status === "running" && !view.ask);
  useDoneSignal(view);
  if (run.notFound) {
    return <div className="py-24 text-center text-ink-3">{t("run.notFound")}</div>;
  }
  if (!view) {
    return (
      <div className="flex justify-center py-24 text-ink-4">
        <Spinner />
      </div>
    );
  }
  const step = view.step;
  let body: React.ReactNode = null;
  if (view.status === "running" && view.ask) {
    body = <AskPanel key={view.ask.id} runId={view.id} ask={view.ask} />;
  } else if (view.status === "running") {
    body = <Working view={view} compact={compact} awake={awake} />;
  } else if (view.status === "failed") {
    body = <Failed view={view} run={run} />;
  } else if (view.status === "cancelled") {
    body = <div className="py-24 text-center text-ink-3">{t("run.cancelled")}</div>;
  } else if (step?.type === "page") {
    body = <PageForm key={step.id} view={view} run={run} step={step} />;
  } else if (step?.type === "review") {
    // A regenerated output is a fresh review: drafts and notes start over.
    const version = view.shown.map((x) => x.output?.at ?? "").join("|");
    body = <Review key={`${step.id}:${version}`} view={view} run={run} step={step} />;
  } else if (step?.type === "result") {
    body = <Result view={view} run={run} step={step} onRestart={onRestart} />;
  }
  return (
    <div className="flex min-h-full flex-col">
      <Progress view={view} />
      <div
        className={cn(
          "safe-x mx-auto w-full flex-1",
          compact ? "max-w-[620px] py-8" : "max-w-[640px] py-8 sm:py-16",
        )}
      >
        {body}
        {run.error && view.status !== "failed" ? (
          <div className="mt-4 rounded-lg bg-rose-tint px-4 py-3 text-[14px] text-rose">
            {run.error}
          </div>
        ) : null}
        {view.keeps && view.status !== "running" ? (
          <div className="mt-10 flex justify-center">
            <StoreButton runId={view.id} />
          </div>
        ) : null}
      </div>
    </div>
  );
}
