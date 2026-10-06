import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowUpRight, Check, Copy, Plus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Navigate, useNavigate } from "react-router";
import { Mascot } from "../brand";
import { api } from "../lib/api";
import { features } from "../lib/features";
import { lang, t } from "../lib/i18n";
import { type Me, useCurrentProject, useMayBuild, useMe, type WizardSummary } from "../lib/session";
import { Button, Card, Chip, Dialog, Empty, IconButton, Input, Select } from "../ui";
import { LinkStatus, useAccountLink } from "./Account";
import { ImportWizard } from "./ImportWizard";
import { openExternal } from "./LocalRuntime";
import { ownLink, sharedLink, WhereChip, whereItRuns } from "./where";

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

function CopyLink({ url }: { url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation();
        void navigator.clipboard.writeText(url);
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

/**
 * "Link" on a wizard that runs only on this computer: there is none to hand out. It says so, and
 * how there would be one — an account, whose cloud runs the wizard for everyone.
 */
function LinkTeaser() {
  const navigate = useNavigate();
  const linking = useAccountLink(false);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) {
      return;
    }
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", close);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    // Clicks in here stay here: the card around opens the editor.
    <div className="relative" ref={ref} onClick={(e) => e.stopPropagation()}>
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((o) => !o)}
        className="inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] text-ink-3 hover:bg-accent hover:text-ink"
      >
        <Copy className="size-3.5" /> {t("share.link")}
      </button>
      {open ? (
        <div className="absolute right-0 bottom-10 z-20 flex w-72 animate-rise flex-col gap-3 rounded-xl bg-card p-3.5 shadow-overlay ring-1 ring-border-soft">
          <p className="text-[13px] text-ink-2 leading-relaxed">{t("teaser.link")}</p>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" busy={linking.link.isPending} onClick={() => linking.link.mutate({})}>
              {t("account.signIn")}
            </Button>
            <Button size="sm" variant="secondary" onClick={() => navigate("/settings/account")}>
              {t("account.create")}
            </Button>
          </div>
          <LinkStatus {...linking} />
        </div>
      ) : null}
    </div>
  );
}

/**
 * A wizard on the start page: where it runs, and the link others can open — this server's own,
 * or for a local install its copy's in the cloud. A wizard that runs only on this computer has
 * no link to hand out; it opens here.
 */
function WizardCard({ w, me }: { w: WizardSummary; me: Me }) {
  const navigate = useNavigate();
  const where = whereItRuns(w, me, w.cloud);
  const link = sharedLink(where);
  const open = link ?? (w.published ? ownLink(w) : null);
  return (
    // The engenty sits on the card's top edge, half above it; the chip stays inside the card.
    <div className="relative pt-6">
      <div className="pointer-events-none absolute top-0 left-4 z-10">
        <Mascot kind={w.avatar} size={52} interactive={false} />
      </div>
      <Card
        className="relative flex h-full cursor-pointer flex-col px-5 pt-10 pb-3 transition hover:shadow-elevated"
        onClick={() => navigate(`/edit/${w.id}`)}
      >
        <div className="absolute top-3 right-3">
          {w.published ? <WhereChip where={where} me={me} /> : <Chip>{t("home.draft")}</Chip>}
        </div>
        <h3 className="font-display font-semibold text-[17px] leading-snug">{w.title}</h3>
        <p className="mt-1 line-clamp-2 text-[14px] text-ink-3">{w.description}</p>
        <div className="mt-auto flex min-h-8 items-center justify-between pt-3">
          <span className="text-[12px] text-ink-4">{t("home.steps", { n: w.stepCount })}</span>
          <div className="flex items-center">
            {link ? (
              <CopyLink url={link} />
            ) : where.kind === "here" && features.account ? (
              <LinkTeaser />
            ) : null}
            {open ? (
              // The live wizard as a visitor sees it, outside the studio.
              <IconButton
                label={link ? t("share.open") : t("share.openHere")}
                className="ml-1 size-8"
                onClick={(e) => {
                  e.stopPropagation();
                  openExternal(open);
                }}
              >
                <ArrowUpRight className="size-4" />
              </IconButton>
            ) : null}
          </div>
        </div>
      </Card>
    </div>
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
  const me = useMe().data;
  const build = useMayBuild();
  const wizards = useQuery({
    // Linked or not, the cards ask anew: where each wizard runs changes with it.
    queryKey: ["wizards", project?.id, Boolean(me?.account)],
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
        {me ? wizards.data?.map((w) => <WizardCard key={w.id} w={w} me={me} />) : null}
      </div>
    </div>
  );
}
