import { type ModelClass, TEXT_CLASSES } from "@engenty-wizards/shared/definition";
import type { MissingModel, RunView } from "@engenty-wizards/shared/run";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Lock, Play, Share2 } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { withBase } from "@/lib/base";
import { api } from "../lib/api";
import { features } from "../lib/features";
import { type Key, t } from "../lib/i18n";
import {
  type PublishResult,
  useCloud,
  useMe,
  useProjects,
  type WizardDetail,
} from "../lib/session";
import { RunnerBody } from "../runner/RunnerView";
import { Button, Chip, cn, IconButton, LinkedText, Spinner } from "../ui";
import { CreditsPill, UserMenu } from "./AppFrame";
import { ChatPanel, useArchitectChat, Working } from "./editor/ChatPanel";
import { FilesPanel } from "./editor/FilesPanel";
import { FlowDiagram } from "./editor/FlowDiagram";
import { Inspector } from "./editor/Inspector";
import { RunsPanel } from "./editor/RunsPanel";
import { ShareDialog } from "./editor/ShareDialog";
import { LiveChip, useLiveDraft } from "./live";
import { RunDrawer } from "./RunDrawer";
import { WhereChip, whereItRuns } from "./where";

type Tab = "chat" | "step" | "files" | "runs";

/** The model classes an account's credits run: text, images, videos. */
const CREDIT_CLASSES: readonly ModelClass[] = [...TEXT_CLASSES, "image", "video"];

const TAB_LABEL: Record<Tab, string> = {
  chat: "editor.chat",
  step: "editor.step",
  files: "editor.files",
  runs: "editor.runs",
};

const PANE_KEY = "wizards.editor.pane";
const PANE_DEFAULT = 420;
const PANE_MIN = 340;

/** Room the diagram keeps next to the pane. */
const paneMax = () => Math.max(PANE_MIN, window.innerWidth - 480);

function storedPane(): number {
  try {
    const n = Number(localStorage.getItem(PANE_KEY));
    return n ? Math.min(Math.max(n, PANE_MIN), paneMax()) : PANE_DEFAULT;
  } catch {
    return PANE_DEFAULT;
  }
}

/** The side pane's width on wide screens, dragged at its left edge; remembered per browser. */
function usePaneWidth() {
  const [width, setWidth] = useState(storedPane);
  const set = useCallback((next: number) => {
    const w = Math.round(Math.min(Math.max(next, PANE_MIN), paneMax()));
    setWidth(w);
    try {
      localStorage.setItem(PANE_KEY, String(w));
    } catch {
      // the width only lasts this page then
    }
  }, []);
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startW = width;
    const move = (ev: PointerEvent) => set(startW + startX - ev.clientX);
    const up = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
    };
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 64 : 16;
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      set(width + step);
    } else if (e.key === "ArrowRight") {
      e.preventDefault();
      set(width - step);
    }
  };
  return { width, onPointerDown, onKeyDown, reset: () => set(PANE_DEFAULT) };
}

const SHEET_KEY = "wizards.editor.sheet";
/** Percent of the room below the header. */
const SHEET_DEFAULT = 55;
/** The folded sheet: its handle and tabs. */
const SHEET_MIN = 76;
/** Room the diagram keeps above the sheet. */
const SHEET_ROOM = 96;
/** Pixels a touch moves before it drags instead of tapping. */
const SHEET_SLOP = 6;

function storedSheet(): number {
  try {
    const raw = localStorage.getItem(SHEET_KEY);
    const n = raw === null ? Number.NaN : Number(raw);
    return Number.isFinite(n) ? Math.min(Math.max(n, 0), 100) : SHEET_DEFAULT;
  } catch {
    return SHEET_DEFAULT;
  }
}

/**
 * The pane as a bottom sheet on small screens: its height in percent of the room below the
 * header, dragged at its handle, 0 when folded to its tabs. A tap on the handle folds and unfolds
 * it. Remembered per browser.
 */
function useSheetHeight() {
  const [percent, setPercent] = useState(storedSheet);
  const [dragging, setDragging] = useState(false);
  const ref = useRef<HTMLElement>(null);
  /** The last open height, for unfolding. */
  const opened = useRef(percent || SHEET_DEFAULT);
  /** Sets the height; `settled` false while a drag passes through heights on its way. */
  const set = useCallback((next: number, settled = true) => {
    const p = Math.round(Math.min(Math.max(next, 0), 100) * 10) / 10;
    if (p > 0 && settled) {
      opened.current = p;
    }
    setPercent(p);
    try {
      localStorage.setItem(SHEET_KEY, String(p));
    } catch {
      // the height only lasts this page then
    }
  }, []);
  const folded = percent === 0;
  const toggle = () => set(folded ? opened.current : 0);
  const unfold = () => {
    if (folded) {
      set(opened.current);
    }
  };
  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    const sheet = ref.current;
    const room = sheet?.parentElement;
    if (!(sheet && room) || e.button !== 0) {
      return;
    }
    e.preventDefault();
    const startY = e.clientY;
    const startH = sheet.getBoundingClientRect().height;
    const roomH = room.getBoundingClientRect().height;
    let moved = false;
    let last = percent;
    const move = (ev: PointerEvent) => {
      if (!moved && Math.abs(ev.clientY - startY) < SHEET_SLOP) {
        return;
      }
      if (!moved) {
        moved = true;
        setDragging(true);
      }
      const h = Math.min(startH + startY - ev.clientY, roomH - SHEET_ROOM);
      last = h < SHEET_MIN + 16 ? 0 : (h / roomH) * 100;
      set(last, false);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      document.body.style.removeProperty("cursor");
      document.body.style.removeProperty("user-select");
      setDragging(false);
      if (moved) {
        set(last);
      } else if (ev.type === "pointerup") {
        toggle();
      }
    };
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  };
  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const step = e.shiftKey ? 25 : 10;
    if (e.key === "ArrowUp") {
      e.preventDefault();
      set(percent + step);
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      set(percent - step < 15 ? 0 : percent - step);
    } else if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      toggle();
    }
  };
  /** The sheet's height, kept between folded and the room the diagram keeps. */
  const height = `clamp(${SHEET_MIN}px, ${percent}%, calc(100% - ${SHEET_ROOM}px))`;
  return { ref, percent, height, folded, dragging, unfold, onPointerDown, onKeyDown };
}

export function EditorPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const me = useMe();
  const [params, setParams] = useSearchParams();
  const wizard = useQuery({
    queryKey: ["wizard", id],
    queryFn: () => api.get<WizardDetail>(`/api/studio/wizards/${id}`),
    // The live stream keeps it fresh; a refetch on focus would only race unsaved edits.
    refetchOnWindowFocus: false,
  });
  const [selected, setSelected] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("chat");
  const pane = usePaneWidth();
  const sheet = useSheetHeight();
  const [shareOpen, setShareOpen] = useState(false);
  const [drawerRun, setDrawerRun] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const [decisions, setDecisions] = useState<RunView["decisions"]>();
  const [branchFocus, setBranchFocus] = useState(0);
  const onRunView = useCallback((view: RunView | null) => {
    setActiveStep(view && view.status !== "done" ? (view.step?.id ?? null) : null);
    // Kept when the drawer closes: the step panel it covered shows the last test run's decisions.
    if (view) {
      setDecisions(view.decisions);
    }
  }, []);
  const { save, saving, remote, merged, refused } = useLiveDraft(id);
  const projects = useProjects();

  const chat = useArchitectChat(wizard.data, (draft, revision) => {
    qc.setQueryData<WizardDetail>(["wizard", id], (old) =>
      old ? { ...old, draft, revision, title: draft.title, blank: false } : old,
    );
  });

  // A wizard created from the start page arrives with its first prompt.
  const sentPrompt = useRef(false);
  useEffect(() => {
    const prompt = params.get("prompt");
    if (prompt && wizard.data && !sentPrompt.current) {
      sentPrompt.current = true;
      setParams({}, { replace: true });
      void chat.send(prompt);
    }
  }, [params, wizard.data, chat, setParams]);

  // Models the draft needs that this runtime cannot serve: a step on every path blocks the test.
  const models = useQuery({
    queryKey: ["wizard-models", id, wizard.data?.revision],
    queryFn: () => api.get<{ missing: MissingModel[] }>(`/api/studio/wizards/${id}/models`),
    enabled: Boolean(wizard.data),
  });
  const missing = models.data?.missing ?? [];
  // A local install with an account sends what it publishes on to the account's cloud.
  const cloudLinked = me.data?.mode === "local" && Boolean(me.data.account);
  const cloud = useCloud(id ?? "", Boolean(id) && cloudLinked);
  const blocked = missing.some((m) => m.blocking);
  const testRun = useMutation({
    mutationFn: () => api.post<{ runId: string }>(`/api/studio/wizards/${id}/test-runs`),
    onSuccess: ({ runId }) => setDrawerRun(runId),
  });
  const publish = useMutation({
    mutationFn: () => api.post<PublishResult>(`/api/studio/wizards/${id}/publish`),
    onSuccess: async ({ cloud }) => {
      // With an account linked the version went on to its cloud. How that went comes along: the
      // share dialog opens with it, and says first when the cloud did not take the version.
      if (cloud) {
        qc.setQueryData(["cloud", id], { linked: true, ...cloud });
      }
      await Promise.all([
        qc.invalidateQueries({ queryKey: ["wizard", id] }),
        qc.invalidateQueries({ queryKey: ["cloud", id] }),
        qc.invalidateQueries({ queryKey: ["wizards"] }),
      ]);
      setShareOpen(true);
    },
  });

  const issueSteps = useMemo(
    () => new Set((wizard.data?.issues ?? []).map((i) => i.stepId).filter(Boolean) as string[]),
    [wizard.data?.issues],
  );

  if (wizard.isLoading || !me.data) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-4">
        <Spinner />
      </div>
    );
  }
  if (!wizard.data) {
    return <div className="p-10 text-center text-ink-3">{t("run.notFound")}</div>;
  }
  const w = wizard.data;
  const def = w.draft;
  const building = chat.phase !== "idle" && w.blank;
  const hasIssues = w.issues.length > 0;
  // Read-only for one of two reasons: the wizard is a local install's, or nothing is built here.
  // Its project says which. A project that is not in the list was made here by a tenant that
  // builds nothing here any more.
  const project = projects.data?.find((p) => p.id === w.projectId);
  const fromLocal = project
    ? project.origin === "local"
    : me.data.limits.build || projects.isLoading;
  const readOnlyNote = w.readOnly ? t(fromLocal ? "readonly.wizard" : "readonly.server") : null;
  /**
   * What the account's credits would do for the models that are missing — text, images, videos:
   * `connect` without an account, `use` with one whose credits the models do not run on yet.
   */
  const credits =
    me.data.mode === "local" &&
    features.account &&
    missing.some((m) => CREDIT_CLASSES.includes(m.cls))
      ? !me.data.account
        ? "connect"
        : me.data.models?.source !== "account"
          ? "use"
          : null
      : null;
  /** A write the server refused, in its own words. */
  const failed = refused ?? (publish.error ? (publish.error as Error).message : null);

  const select = (sid: string | null) => {
    setSelected(sid);
    if (sid) {
      setTab("step");
      sheet.unfold();
    }
  };

  return (
    <div className="flex h-dvh flex-col">
      {readOnlyNote ? (
        <div className="flex shrink-0 items-center gap-3 border-border-soft border-b bg-paper-2 px-4 py-2 text-[0.8125rem] text-ink-2 sm:px-6">
          <Lock className="size-4 shrink-0 text-ink-3" />
          <p className="min-w-0 flex-1">{readOnlyNote}</p>
        </div>
      ) : null}
      {failed ? (
        <div className="shrink-0 bg-rose-tint px-4 py-2 text-[0.8125rem] text-rose sm:px-6">
          {failed}
        </div>
      ) : null}
      <header className="flex h-16 shrink-0 items-center gap-2 px-3 sm:px-4">
        <IconButton label="Zurück" onClick={() => navigate("/")}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <button
          type="button"
          onClick={() => select("__wizard")}
          className="min-w-0 truncate rounded-md px-2 py-1 text-left hover:bg-accent"
        >
          <span className="font-display font-semibold text-[1.0625rem] tracking-tight">
            {def.title}
          </span>
        </button>
        <span className="hidden sm:inline-flex">
          {w.published ? (
            w.dirty ? (
              <Chip tone="warn">{t("editor.unpublishedChanges")}</Chip>
            ) : (
              <WhereChip
                where={whereItRuns(w, me.data, cloudLinked ? cloud.data : null)}
                me={me.data}
                version={w.publishedVersion}
              />
            )
          ) : (
            <Chip>{t("editor.notPublished")}</Chip>
          )}
        </span>
        {saving ? <Spinner className="size-4 text-ink-4" /> : null}
        <span className="hidden md:inline-flex">
          <LiveChip remote={remote} merged={merged} />
        </span>
        <div className="ml-auto flex items-center gap-2">
          {/* The wizard as a file: definition and workspace, to keep or to import elsewhere. */}
          <a
            href={withBase(`/api/studio/wizards/${w.id}/export`)}
            download
            aria-label={t("editor.export")}
            title={t("editor.export")}
            className="hidden size-9 shrink-0 items-center justify-center rounded-full text-ink-3 transition hover:bg-accent hover:text-ink sm:inline-flex"
          >
            <Download className="size-4" />
          </a>
          <Button
            variant="secondary"
            size="sm"
            disabled={hasIssues || building || blocked}
            busy={testRun.isPending}
            onClick={() => testRun.mutate()}
          >
            <Play className="size-3.5" /> {t("editor.test")}
          </Button>
          {w.published && (!w.dirty || w.readOnly) ? (
            <Button size="sm" onClick={() => setShareOpen(true)}>
              <Share2 className="size-3.5" /> {t("editor.share")}
            </Button>
          ) : w.readOnly ? null : (
            <>
              {/* What the cloud would lack for the draft is said in the share dialog: with an
                  account linked it stays at hand while there is something to publish. */}
              {cloudLinked ? (
                <IconButton
                  label={t("editor.share")}
                  className="max-sm:hidden"
                  onClick={() => setShareOpen(true)}
                >
                  <Share2 className="size-4" />
                </IconButton>
              ) : null}
              <Button
                size="sm"
                disabled={hasIssues || building}
                busy={publish.isPending}
                onClick={() => publish.mutate()}
              >
                {t("editor.publish")}
              </Button>
            </>
          )}
          <span className="ml-2 hidden md:inline-flex">
            <CreditsPill me={me.data} />
          </span>
          <span className="hidden sm:inline-flex">
            <UserMenu me={me.data} />
          </span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <section className="relative min-h-0 flex-1 overflow-hidden">
          {hasIssues && !building ? (
            <div className="absolute top-3 right-3 left-3 z-10 mx-auto max-w-xl animate-rise rounded-xl bg-card p-4 shadow-elevated ring-1 ring-rose/30">
              <p className="text-[0.875rem]">{t("editor.issues")}</p>
              <ul className="mt-2 list-disc pl-5 text-[0.8125rem] text-ink-2">
                {w.issues.slice(0, 4).map((i, k) => (
                  <li key={k}>{i.message}</li>
                ))}
              </ul>
              {w.readOnly ? null : (
                <Button
                  size="sm"
                  variant="quiet"
                  className="mt-3"
                  disabled={chat.phase !== "idle"}
                  onClick={() => {
                    setTab("chat");
                    void chat.send(
                      `Bitte behebe diese Probleme im Wizard:\n${w.issues.map((i) => `- ${i.message}`).join("\n")}`,
                    );
                  }}
                >
                  {t("editor.fixWithChat")}
                </Button>
              )}
            </div>
          ) : null}
          {!hasIssues && !building && missing.length ? (
            <div
              className={cn(
                "absolute top-3 right-3 left-3 z-10 mx-auto max-w-xl animate-rise rounded-xl bg-card p-4 shadow-elevated ring-1",
                blocked ? "ring-rose/30" : "ring-amber/30",
              )}
            >
              <p className="text-[0.875rem]">
                {t(blocked ? "editor.models.blocking" : "editor.models.optional")}
              </p>
              <ul className="mt-2 list-disc pl-5 text-[0.8125rem] text-ink-2">
                {missing.map((m) => (
                  <li key={m.cls}>
                    <span className="text-ink">{t(`class.${m.cls}` as Key)}</span> (
                    {m.steps.map((s) => `„${s.title}“`).join(", ")}):{" "}
                    <LinkedText text={m.problem} />
                  </li>
                ))}
              </ul>
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                <Button size="sm" variant="quiet" onClick={() => navigate("/settings/models")}>
                  {t("editor.models.settings")}
                </Button>
                {credits === "connect" ? (
                  <p className="text-[0.8125rem] text-ink-3">
                    {t("teaser.models")}{" "}
                    <button
                      type="button"
                      className="font-medium text-ink underline underline-offset-2"
                      onClick={() => navigate("/settings/account")}
                    >
                      {t("teaser.connect")}
                    </button>
                  </p>
                ) : credits === "use" ? (
                  <p className="text-[0.8125rem] text-ink-3">{t("teaser.modelsLinked")}</p>
                ) : null}
              </div>
            </div>
          ) : null}
          {building ? (
            <div className="flex h-full items-center justify-center px-6 text-[0.875rem] text-ink-3">
              <Working chat={chat} spinner="size-4 text-ember" />
            </div>
          ) : (
            <FlowDiagram
              def={def}
              selected={selected}
              onSelect={select}
              issueSteps={issueSteps}
              activeStep={drawerRun ? activeStep : null}
              pulse={remote?.steps}
              wizardId={w.id}
              decisions={decisions}
              onBranch={(sid) => {
                select(sid);
                setBranchFocus((n) => n + 1);
              }}
            />
          )}
        </section>

        <aside
          ref={sheet.ref}
          className={cn(
            "relative flex h-(--sheet) min-h-0 w-full shrink-0 flex-col rounded-t-3xl bg-card shadow-[0_0_0_1px_var(--border-soft)] lg:h-auto lg:w-(--pane) lg:rounded-tr-none",
            !sheet.dragging &&
              "max-lg:motion-safe:transition-[height] max-lg:motion-safe:duration-200",
          )}
          style={{ "--pane": `${pane.width}px`, "--sheet": sheet.height } as React.CSSProperties}
        >
          {/* On small screens the pane is a sheet over the bottom: its handle drags its height, a
              tap folds it to its tabs. The handle reaches a little above the sheet for fingers. */}
          {/* biome-ignore lint/a11y/useSemanticElements: a draggable splitter has no element of its own */}
          <div
            role="separator"
            aria-orientation="horizontal"
            aria-label={t("editor.resizeSheet")}
            aria-valuenow={sheet.percent}
            aria-valuemin={0}
            aria-valuemax={100}
            tabIndex={0}
            title={t("editor.resizeSheet")}
            onPointerDown={sheet.onPointerDown}
            onKeyDown={sheet.onKeyDown}
            className="group before:-top-4 relative z-10 flex h-7 shrink-0 cursor-row-resize touch-none select-none items-center justify-center outline-none before:absolute before:inset-x-0 before:h-4 lg:hidden"
          >
            <span className="h-1.5 w-10 rounded-full bg-ink-4/40 transition-all group-hover:bg-ember/70 group-focus-visible:bg-ember group-active:w-14 group-active:bg-ember" />
          </div>
          {/* biome-ignore lint/a11y/useSemanticElements: a draggable splitter has no element of its own */}
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label={t("editor.resize")}
            aria-valuenow={pane.width}
            tabIndex={0}
            title={t("editor.resize")}
            onPointerDown={pane.onPointerDown}
            onKeyDown={pane.onKeyDown}
            onDoubleClick={pane.reset}
            className="group -left-1.5 absolute inset-y-0 z-10 hidden w-5 cursor-col-resize outline-none lg:block"
          >
            <span className="-translate-y-1/2 absolute top-1/2 left-[9px] h-12 w-1.5 rounded-full bg-ink-4/40 transition group-hover:bg-ember/70 group-focus-visible:bg-ember group-active:h-16 group-active:bg-ember" />
          </div>
          <nav className="flex shrink-0 gap-1 px-3 lg:pt-3">
            {(["chat", "step", "files", "runs"] as Tab[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => {
                  setTab(k);
                  sheet.unfold();
                }}
                className={cn(
                  "h-9 rounded-full px-4 font-medium text-[0.8125rem] transition",
                  tab === k ? "bg-paper-2 text-ink" : "text-ink-3 hover:text-ink",
                )}
              >
                {t(TAB_LABEL[k] as "editor.chat")}
              </button>
            ))}
          </nav>
          <div className={cn("min-h-0 flex-1 overflow-y-auto", sheet.folded && "max-lg:hidden")}>
            {tab === "chat" ? (
              <ChatPanel chat={chat} avatar={def.avatar} closed={readOnlyNote ?? undefined} />
            ) : tab === "step" ? (
              <Inspector
                def={def}
                selected={selected}
                update={save}
                onSelect={select}
                issues={w.issues}
                mcpServers={w.mcpServers}
                files={w.files}
                wizardId={w.id}
                readOnly={w.readOnly}
                decisions={decisions}
                branchFocus={branchFocus}
              />
            ) : tab === "files" ? (
              <FilesPanel wizardId={w.id} files={w.files} readOnly={w.readOnly} />
            ) : (
              <RunsPanel wizardId={w.id} onOpen={setDrawerRun} />
            )}
          </div>
        </aside>
      </div>

      {drawerRun ? (
        <RunDrawer
          header={<Chip>Test</Chip>}
          actions={
            <Button
              variant="ghost"
              size="sm"
              busy={testRun.isPending}
              disabled={hasIssues}
              onClick={() => testRun.mutate()}
            >
              {t("editor.restart")}
            </Button>
          }
          onClose={() => setDrawerRun(null)}
        >
          <RunnerBody
            key={drawerRun}
            runId={drawerRun}
            compact
            onRestart={() => testRun.mutate()}
            onView={onRunView}
          />
        </RunDrawer>
      ) : null}

      <ShareDialog
        wizard={w}
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        publish={
          w.readOnly
            ? undefined
            : {
                run: () => publish.mutate(),
                busy: publish.isPending,
                disabled: hasIssues || building,
              }
        }
      />
    </div>
  );
}
