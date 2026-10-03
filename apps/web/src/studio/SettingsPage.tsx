import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { withBase } from "@/lib/base";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { type Project, useCurrentProject, useMe } from "../lib/session";
import { Button, Card, cn, IconButton, Input, Label, Select, Swatch, Textarea } from "../ui";
import { Connectors } from "./Connectors";
import { ProjectSwitcher } from "./HomePage";
import { LocalRuntimeCard } from "./LocalRuntime";
import { McpAccess } from "./McpAccess";

type Server = Project["mcpServers"][number] & { auth?: string };

function slugId(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[^a-z]+/, "")
      .slice(0, 24) || "system";
  let id = base;
  let i = 2;
  while (taken.includes(id)) {
    id = `${base}_${i++}`;
  }
  return id;
}

function ProjectForm({ project }: { project: Project }) {
  const qc = useQueryClient();
  const [name, setName] = useState(project.name);
  const [brandName, setBrandName] = useState(project.brand.name ?? "");
  const [details, setDetails] = useState(project.brand.details ?? "");
  const [accent, setAccent] = useState(project.brand.accent ?? "");
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/api/studio/projects/${project.id}`, {
        name,
        brand: { name: brandName, details, accent },
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    },
  });
  const logo = useMutation({
    mutationFn: (file: File) => api.upload(`/api/studio/projects/${project.id}/logo`, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/api/studio/projects/${project.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="mb-5 font-display font-semibold text-lg">{t("settings.project")}</h2>
        <Label>{t("settings.name")}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Card>

      <Card className="p-6">
        <h2 className="font-display font-semibold text-lg">{t("settings.brand")}</h2>
        <p className="mt-1 mb-5 text-[14px] text-ink-3">{t("settings.brandHint")}</p>
        <div className="flex flex-col gap-5">
          <div>
            <Label>{t("settings.brandName")}</Label>
            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} />
          </div>
          <div>
            <Label>{t("settings.brandDetails")}</Label>
            <Textarea minRows={4} value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-8">
            <div>
              <Label>{t("settings.accent")}</Label>
              <div className="flex items-center gap-3">
                <Swatch value={accent || "#e0531b"} onChange={(e) => setAccent(e.target.value)} />
                <Input
                  value={accent}
                  placeholder="#e0531b"
                  onChange={(e) => setAccent(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>
            <div>
              <Label>{t("settings.logo")}</Label>
              <div className="flex items-center gap-3">
                {project.brand.logoAssetId ? (
                  <img
                    src={withBase(`/api/public/logos/${project.brand.logoAssetId}`)}
                    alt=""
                    className="h-11 max-w-[140px] rounded-md object-contain"
                  />
                ) : null}
                <Button
                  variant="secondary"
                  busy={logo.isPending}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="size-4" /> {t("settings.logo")}
                </Button>
                <input
                  ref={fileInput}
                  hidden
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && logo.mutate(e.target.files[0])}
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="danger"
          busy={remove.isPending}
          onClick={() => confirm(`${t("settings.delete")}?`) && remove.mutate()}
        >
          {t("settings.delete")}
        </Button>
        <Button busy={save.isPending} onClick={() => save.mutate()}>
          {saved ? t("settings.saved") : t("settings.save")}
        </Button>
      </div>
      {save.error ? <p className="text-[14px] text-rose">{(save.error as Error).message}</p> : null}
    </div>
  );
}

/** The project's MCP servers, called with the admin's credentials; saved on their own. */
function McpServers({ project }: { project: Project }) {
  const qc = useQueryClient();
  const [servers, setServers] = useState<Server[]>(
    project.mcpServers.map((s) => ({
      ...s,
      auth: s.headers?.Authorization ?? s.headers?.authorization ?? "",
    })),
  );
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () =>
      api.patch(`/api/studio/projects/${project.id}`, {
        mcpServers: servers
          .filter((s) => s.name && s.url)
          .map(({ auth, headers, ...s }) => ({
            ...s,
            headers: auth ? { ...headers, Authorization: auth } : undefined,
          })),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    },
  });
  return (
    <Card className="p-6">
      <h2 className="font-display font-semibold text-lg">{t("settings.mcp")}</h2>
      <p className="mt-1 mb-5 text-[14px] text-ink-3">{t("settings.mcpHint")}</p>
      <div className="flex flex-col gap-3">
        {servers.map((s, i) => (
          <div
            key={i}
            className="grid gap-2 rounded-lg bg-paper p-3 ring-1 ring-border-soft sm:grid-cols-[1fr_2fr_auto]"
          >
            <Input
              placeholder={t("settings.serverName")}
              value={s.name}
              onChange={(e) =>
                setServers((all) =>
                  all.map((x, j) =>
                    j === i
                      ? {
                          ...x,
                          name: e.target.value,
                          id:
                            x.id ||
                            slugId(
                              e.target.value,
                              all.map((y) => y.id),
                            ),
                        }
                      : x,
                  ),
                )
              }
            />
            <Input
              placeholder={`${t("settings.serverUrl")} (https://…/mcp)`}
              value={s.url}
              onChange={(e) =>
                setServers((all) =>
                  all.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                )
              }
            />
            <IconButton
              label="Entfernen"
              onClick={() => setServers((all) => all.filter((_, j) => j !== i))}
              className="hover:text-rose"
            >
              <Trash2 className="size-4" />
            </IconButton>
            <Input
              className="sm:col-span-2"
              placeholder={t("settings.serverHeader")}
              value={s.auth ?? ""}
              onChange={(e) =>
                setServers((all) =>
                  all.map((x, j) => (j === i ? { ...x, auth: e.target.value } : x)),
                )
              }
            />
            {s.id ? (
              <span className="self-center font-mono text-[11px] text-ink-4">{s.id}</span>
            ) : null}
          </div>
        ))}
        <Button
          variant="secondary"
          className="self-start"
          onClick={() => setServers((all) => [...all, { id: "", name: "", url: "", auth: "" }])}
        >
          <Plus className="size-4" /> {t("settings.addServer")}
        </Button>
      </div>
      <div className="mt-5 flex items-center justify-end gap-3">
        {save.error ? (
          <p className="text-[14px] text-rose">{(save.error as Error).message}</p>
        ) : null}
        <Button busy={save.isPending} onClick={() => save.mutate()}>
          {saved ? t("settings.saved") : t("settings.save")}
        </Button>
      </div>
    </Card>
  );
}

type Section = "project" | "connectors" | "models" | "build";

/** Section of the settings at /settings/<section>; the left list on wide screens, a dropdown on narrow ones. */
export function SettingsPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const me = useMe();
  const { project } = useCurrentProject();
  const [key, setKey] = useState(project?.id);
  useEffect(() => setKey(project?.id), [project?.id]);
  const sections: { id: Section; label: string }[] = [
    { id: "project", label: t("settings.project") },
    { id: "connectors", label: t("connectors.title") },
    // Models and the account are chosen on the machine only when the runtime runs alone.
    ...(me.data?.mode === "local" ? [{ id: "models" as const, label: t("local.title") }] : []),
    { id: "build", label: t("mcp.nav") },
  ];
  const current = sections.find((s) => s.id === section);
  if (!current) {
    return <Navigate to="/settings/project" replace />;
  }
  const scoped = current.id === "project" || current.id === "connectors";
  return (
    <div className="animate-rise">
      <h1 className="font-display font-semibold text-[28px] tracking-tight">
        {t("settings.title")}
      </h1>
      <div className="mt-6 grid gap-6 md:mt-8 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10">
        <nav className="max-md:hidden">
          <ul className="sticky top-24 flex flex-col gap-0.5">
            {sections.map((s) => (
              <li key={s.id}>
                <Link
                  to={`/settings/${s.id}`}
                  aria-current={s.id === current.id ? "page" : undefined}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-[14px] transition",
                    s.id === current.id
                      ? "bg-paper-2 font-medium text-ink"
                      : "text-ink-3 hover:bg-accent hover:text-ink",
                  )}
                >
                  {s.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <Select
          className="md:hidden"
          value={current.id}
          onChange={(id) => navigate(`/settings/${id}`)}
          options={sections.map((s) => ({ value: s.id, label: s.label }))}
        />
        <div className="min-w-0 max-w-2xl">
          {scoped ? (
            <div className="mb-6">
              <ProjectSwitcher />
            </div>
          ) : null}
          {current.id === "project" && project ? <ProjectForm key={key} project={project} /> : null}
          {current.id === "connectors" && project ? (
            <div className="flex flex-col gap-6">
              <Connectors key={key} projectId={project.id} />
              <McpServers key={key} project={project} />
            </div>
          ) : null}
          {current.id === "models" ? <LocalRuntimeCard /> : null}
          {current.id === "build" ? <McpAccess /> : null}
        </div>
      </div>
    </div>
  );
}
