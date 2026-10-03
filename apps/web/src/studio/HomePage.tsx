import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, Copy, Plus } from "lucide-react";
import { useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { BASE } from "@/lib/base";
import { Mascot } from "../brand";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { useCurrentProject, type WizardSummary } from "../lib/session";
import { Button, Card, Chip, Dialog, Empty, Input, Select } from "../ui";

export function ProjectSwitcher() {
  const { project, projects, select } = useCurrentProject();
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
  if (!project) {
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
          { value: "__new", label: `+ ${t("home.newProject")}` },
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
        void navigator.clipboard.writeText(`${window.location.origin}${BASE}/r/${token}`);
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
      className="group flex cursor-pointer flex-col p-5 transition hover:shadow-elevated"
      onClick={() => navigate(`/w/${w.id}`)}
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
          {w.published ? <CopyLink token={w.shareToken} /> : null}
          <ArrowUpRight className="ml-1 size-4 text-ink-4 transition group-hover:text-ink" />
        </div>
      </div>
    </Card>
  );
}

export function HomePage() {
  const navigate = useNavigate();
  const { project, projects, loading } = useCurrentProject();
  const wizards = useQuery({
    queryKey: ["wizards", project?.id],
    queryFn: () => api.get<WizardSummary[]>(`/api/studio/projects/${project!.id}/wizards`),
    enabled: Boolean(project),
  });
  const total = projects.reduce((n, p) => n + p.wizardCount, 0);
  if (!loading && projects.length && total === 0) {
    return <Navigate to="/new" replace />;
  }
  return (
    <div className="animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <ProjectSwitcher />
        </div>
        <Button onClick={() => navigate("/new")}>
          <Plus className="size-4" /> {t("home.new")}
        </Button>
      </div>
      <h1 className="mt-10 font-display font-semibold text-[28px] tracking-tight">
        {t("home.title")}
      </h1>
      {wizards.data && wizards.data.length === 0 ? <Empty>{t("home.empty")}</Empty> : null}
      <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {wizards.data?.map((w) => (
          <WizardCard key={w.id} w={w} />
        ))}
      </div>
    </div>
  );
}
