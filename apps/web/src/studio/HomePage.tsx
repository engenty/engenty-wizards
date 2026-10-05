import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, Copy, Plus } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { BASE } from "@/lib/base";
import { Mascot } from "../brand";
import { api } from "../lib/api";
import { lang, t } from "../lib/i18n";
import { useCurrentProject, useMayBuild, useMe, type WizardSummary } from "../lib/session";
import { Button, Card, Chip, Dialog, Empty, IconButton, Input, Select } from "../ui";
import { ImportWizard } from "./ImportWizard";
import { openExternal } from "./LocalRuntime";

/** Picks the project the studio looks at. Nothing where the tenant works with one project. */
export function ProjectSwitcher() {
  const { project, projects, select } = useCurrentProject();
  const limit = useMe().data?.limits.projects ?? 1;
  const build = useMayBuild();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const create = useMutation({
    mutationFn: () => api.post<{ id: string }>("/api/studio/projects", { name }),
    onSuccess: async ({ id }) => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
      select(id);
      setOpen(false);
      setName("");
    },
  });
  if (!project || limit <= 1) {
    return null;
  }
  return (
    <div className="flex items-center gap-2">
      <Select
        className="w-56"
        value={project.id}
        onChange={(v) => (v === "__new" ? setOpen(true) : select(v))}
        options={[
          ...projects.map((p) => ({ value: p.id, label: p.name })),
          // A tenant that builds nothing here makes no project here either.
          ...(build
            ? [
                projects.length < limit
                  ? { value: "__new", label: `+ ${t("home.newProject")}` }
                  : {
                      value: "__new",
                      label: t("home.projectLimit", { n: limit }),
                      disabled: true,
                    },
              ]
            : []),
        ]}
      />
      <Dialog open={open} onClose={() => setOpen(false)} title={t("home.newProject")}>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (name.trim()) {
              create.mutate();
            }
          }}
        >
          <Input
            autoFocus
            placeholder={t("home.projectName")}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <div className="mt-5 flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setOpen(false)}>
              {t("common.cancel")}
            </Button>
            <Button type="submit" busy={create.isPending} disabled={!name.trim()}>
              {t("home.newProject")}
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}

function CopyLink({ token }: { token: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(`${window.location.origin}${BASE}/w/${token}`);
        setDone(true);
        setTimeout(() => setDone(false), 1500);
      }}
      className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-ink-3 hover:bg-accent hover:text-ink"
    >
      {done ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
      {done ? t("share.copied") : t("share.link")}
    </button>
  );
}

function WizardCard({ w }: { w: WizardSummary }) {
  const navigate = useNavigate();
  return (
    <Card
      className="flex cursor-pointer flex-col p-5 transition hover:shadow-elevated"
      onClick={() => navigate(`/edit/${w.id}`)}
    >
      <div className="flex items-start justify-between">
        <div className="-ml-1 -mt-1">
          <Mascot kind={w.avatar} size={52} interactive={false} />
        </div>
        {w.published ? <Chip tone="live">{t("home.live")}</Chip> : <Chip>{t("home.draft")}</Chip>}
      </div>
      <h3 className="mt-3 font-display font-semibold text-[17px] leading-snug">{w.title}</h3>
      <p className="mt-1 line-clamp-2 min-h-[2.6em] text-[14px] text-ink-3">{w.description}</p>
      <div className="mt-4 flex items-center justify-between">
        <span className="text-[12px] text-ink-4">{t("home.steps", { n: w.stepCount })}</span>
        <div className="flex items-center">
          {w.published ? (
            <>
              <CopyLink token={w.shareToken} />
              {/* The live wizard as a visitor sees it, outside the studio. */}
              <IconButton
                label={t("share.open")}
                className="ml-1 size-8"
                onClick={(e) => {
                  e.stopPropagation();
                  openExternal(`${window.location.origin}${BASE}/w/${w.shareToken}`);
                }}
              >
                <ArrowUpRight className="size-4" />
              </IconButton>
            </>
          ) : null}
        </div>
      </div>
    </Card>
  );
}

const INSTALL = "curl -fsSL https://engenty.ai/install.sh | bash";

/**
 * Nothing is built on this server, and nothing has arrived yet: wizards get here from the
 * person's own install. Three steps lead there.
 */
function FromLocal() {
  const [copied, setCopied] = useState(false);
  const steps = [t("home.local.install"), t("home.local.signIn"), t("home.local.publish")];
  return (
    <div className="mx-auto flex max-w-xl animate-rise flex-col items-center pt-4 text-center">
      <Mascot kind="round" size={120} />
      <h1 className="mt-2 font-display font-semibold text-[28px] leading-tight tracking-tight">
        {t("home.local.title")}
      </h1>
      <p className="mt-3 text-[15px] text-ink-2 leading-relaxed">{t("home.local.text")}</p>
      <ol className="mt-8 flex w-full flex-col gap-4 text-left">
        {steps.map((step, i) => (
          <li key={step} className="flex gap-3">
            <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-paper-2 font-medium text-[13px] text-ink-2">
              {i + 1}
            </span>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-[15px] leading-snug">{step}</p>
              {i === 0 ? (
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-paper-2 py-1.5 pr-1.5 pl-3">
                  <code className="min-w-0 flex-1 select-all overflow-x-auto whitespace-nowrap font-mono text-[13px] text-ink-2">
                    {INSTALL}
                  </code>
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(INSTALL);
                      setCopied(true);
                      setTimeout(() => setCopied(false), 1500);
                    }}
                  >
                    {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
                    {copied ? t("share.copied") : t("share.copy")}
                  </Button>
                </div>
              ) : null}
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { project, projects, loading } = useCurrentProject();
  const build = useMayBuild();
  const wizards = useQuery({
    queryKey: ["wizards", project?.id],
    queryFn: () => api.get<WizardSummary[]>(`/api/studio/projects/${project!.id}/wizards`),
    enabled: Boolean(project),
  });
  const total = projects.reduce((n, p) => n + p.wizardCount, 0);
  /** Wizards are made in this project: the tenant builds here, and the project is its own. */
  const canCreate = build && !project?.readOnly;
  if (!loading && canCreate && projects.length && total === 0) {
    return <Navigate to="/new" replace />;
  }
  // Nothing is built here and no install has sent anything yet: the way a wizard gets here.
  if (!loading && !build && projects.length === 0) {
    return <FromLocal />;
  }
  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <ProjectSwitcher />
        </div>
        {canCreate ? (
          <div className="flex items-center gap-2">
            <ImportWizard />
            <Button onClick={() => navigate("/new")}>
              <Plus className="size-4" /> {t("home.new")}
            </Button>
          </div>
        ) : null}
      </div>
      <h1 className="mt-10 font-display font-semibold text-[28px] tracking-tight">
        {t("home.title")}
      </h1>
      {project?.origin === "local" ? (
        <p className="mt-2 text-[14px] text-ink-3">
          {t("home.fromLocal")}{" "}
          {project.syncedAt
            ? t("home.syncedAt", {
                when: new Intl.DateTimeFormat(lang, {
                  dateStyle: "medium",
                  timeStyle: "short",
                }).format(new Date(project.syncedAt)),
              })
            : null}
        </p>
      ) : null}
      {wizards.data && wizards.data.length === 0 ? <Empty>{t("home.empty")}</Empty> : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {wizards.data?.map((w) => (
          <WizardCard key={w.id} w={w} />
        ))}
      </div>
    </div>
  );
}
