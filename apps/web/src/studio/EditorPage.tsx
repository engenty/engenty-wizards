import type { MissingModel, RunView } from "@engenty-wizards/shared/run";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Download, Play, Share2, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router";
import { withBase } from "@/lib/base";
import { api } from "../lib/api";
import { type Key, t } from "../lib/i18n";
import { useMe, type WizardDetail } from "../lib/session";
import { RunnerBody } from "../runner/RunnerView";
import { Button, Chip, cn, IconButton, Spinner } from "../ui";
import { CreditsPill, UserMenu } from "./AppFrame";
import { ChatPanel, useArchitectChat } from "./editor/ChatPanel";
import { FilesPanel } from "./editor/FilesPanel";
import { FlowDiagram } from "./editor/FlowDiagram";
import { Inspector } from "./editor/Inspector";
import { RunsPanel } from "./editor/RunsPanel";
import { ShareDialog } from "./editor/ShareDialog";
import { LiveChip, useLiveDraft } from "./live";

type Tab = "chat" | "step" | "files" | "runs";

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
  const [shareOpen, setShareOpen] = useState(false);
  const [drawerRun, setDrawerRun] = useState<string | null>(null);
  const [activeStep, setActiveStep] = useState<string | null>(null);
  const onRunView = useCallback(
    (view: RunView | null) =>
      setActiveStep(view && view.status !== "done" ? (view.step?.id ?? null) : null),
    [],
  );
  const { save, saving, remote, merged } = useLiveDraft(id);

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
  const blocked = missing.some((m) => m.blocking);
  const testRun = useMutation({
    mutationFn: () => api.post<{ runId: string }>(`/api/studio/wizards/${id}/test-runs`),
    onSuccess: ({ runId }) => setDrawerRun(runId),
  });
  const publish = useMutation({
    mutationFn: () => api.post(`/api/studio/wizards/${id}/publish`),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["wizard", id] });
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

  const select = (sid: string | null) => {
    setSelected(sid);
    if (sid) {
      setTab("step");
    }
  };

  return (
    <div className="flex h-dvh flex-col">
      <header className="flex h-16 shrink-0 items-center gap-2 px-3 sm:px-4">
        <IconButton label="Zurück" onClick={() => navigate("/")}>
          <ArrowLeft className="size-5" />
        </IconButton>
        <button
          type="button"
          onClick={() => select("__wizard")}
          className="min-w-0 truncate rounded-md px-2 py-1 text-left hover:bg-accent"
        >
          <span className="font-display font-semibold text-[17px] tracking-tight">{def.title}</span>
        </button>
        <span className="hidden sm:inline-flex">
          {w.published ? (
            w.dirty ? (
              <Chip tone="warn">{t("editor.unpublishedChanges")}</Chip>
            ) : (
              <Chip tone="live">{t("editor.published", { v: w.publishedVersion ?? 0 })}</Chip>
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
          {w.published && !w.dirty ? (
            <Button size="sm" onClick={() => setShareOpen(true)}>
              <Share2 className="size-3.5" /> {t("editor.share")}
            </Button>
          ) : (
            <Button
              size="sm"
              disabled={hasIssues || building}
              busy={publish.isPending}
              onClick={() => publish.mutate()}
            >
              {t("editor.publish")}
            </Button>
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
        <section className="relative min-h-[45vh] flex-1 overflow-hidden lg:min-h-0">
          {hasIssues && !building ? (
            <div className="absolute top-3 right-3 left-3 z-10 mx-auto max-w-xl animate-rise rounded-xl bg-card p-4 shadow-elevated ring-1 ring-rose/30">
              <p className="text-[14px]">{t("editor.issues")}</p>
              <ul className="mt-2 list-disc pl-5 text-[13px] text-ink-2">
                {w.issues.slice(0, 4).map((i, k) => (
                  <li key={k}>{i.message}</li>
                ))}
              </ul>
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
            </div>
          ) : null}
          {!hasIssues && !building && missing.length ? (
            <div
              className={cn(
                "absolute top-3 right-3 left-3 z-10 mx-auto max-w-xl animate-rise rounded-xl bg-card p-4 shadow-elevated ring-1",
                blocked ? "ring-rose/30" : "ring-amber/30",
              )}
            >
              <p className="text-[14px]">
                {t(blocked ? "editor.models.blocking" : "editor.models.optional")}
              </p>
              <ul className="mt-2 list-disc pl-5 text-[13px] text-ink-2">
                {missing.map((m) => (
                  <li key={m.cls}>
                    <span className="text-ink">{t(`class.${m.cls}` as Key)}</span> (
                    {m.steps.map((s) => `„${s.title}“`).join(", ")}): {m.problem}
                  </li>
                ))}
              </ul>
              <Button
                size="sm"
                variant="quiet"
                className="mt-3"
                onClick={() => navigate("/settings/models")}
              >
                {t("editor.models.settings")}
              </Button>
            </div>
          ) : null}
          {building ? (
            <div className="flex h-full flex-col items-center justify-center gap-3 text-ink-3">
              <Spinner className="size-6 text-ember" />
              <span className="text-[14px]">
                {chat.activity ??
                  (chat.phase === "building" ? t("editor.building") : t("editor.thinking"))}
              </span>
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
            />
          )}
        </section>

        <aside
          className="relative flex h-[55vh] min-h-0 w-full shrink-0 flex-col bg-card shadow-[0_0_0_1px_var(--border-soft)] lg:h-auto lg:w-(--pane) lg:rounded-tl-3xl"
          style={{ "--pane": `${pane.width}px` } as React.CSSProperties}
        >
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
          <nav className="flex shrink-0 gap-1 px-3 pt-3">
            {(["chat", "step", "files", "runs"] as Tab[]).map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setTab(k)}
                className={cn(
                  "h-9 rounded-full px-4 font-medium text-[13px] transition",
                  tab === k ? "bg-paper-2 text-ink" : "text-ink-3 hover:text-ink",
                )}
              >
                {t(TAB_LABEL[k] as "editor.chat")}
              </button>
            ))}
          </nav>
          <div className="min-h-0 flex-1 overflow-y-auto">
            {tab === "chat" ? (
              <ChatPanel chat={chat} avatar={def.avatar} />
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
              />
            ) : tab === "files" ? (
              <FilesPanel wizardId={w.id} files={w.files} />
            ) : (
              <RunsPanel wizardId={w.id} onOpen={setDrawerRun} />
            )}
          </div>
        </aside>
      </div>

      {drawerRun ? (
        <div
          className="fixed inset-0 z-50 flex justify-end bg-[oklch(20%_0.01_60/0.22)] backdrop-blur-[1px]"
          onClick={() => setDrawerRun(null)}
        >
          <div
            className="flex h-full w-full max-w-[680px] animate-rise flex-col bg-background shadow-overlay"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex h-14 shrink-0 items-center justify-between px-4">
              <Chip>Test</Chip>
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="sm"
                  busy={testRun.isPending}
                  disabled={hasIssues}
                  onClick={() => testRun.mutate()}
                >
                  {t("editor.restart")}
                </Button>
                <IconButton label={t("editor.close")} onClick={() => setDrawerRun(null)}>
                  <X className="size-5" />
                </IconButton>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto">
              <RunnerBody
                key={drawerRun}
                runId={drawerRun}
                compact
                onRestart={() => testRun.mutate()}
                onView={onRunView}
              />
            </div>
          </div>
        </div>
      ) : null}

      <ShareDialog wizard={w} open={shareOpen} onClose={() => setShareOpen(false)} />
    </div>
  );
}
