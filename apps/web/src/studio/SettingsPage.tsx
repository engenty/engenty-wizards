import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { useEffect, useState } from "react";
import { Link, Navigate, useNavigate, useParams } from "react-router";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { type Project, useCurrentProject, useManyProjects, useMe } from "../lib/session";
import { PluginFrame, useStudioPlugins } from "../plugins/host";
import { PluginsSection } from "../plugins/PluginsSection";
import { Button, Card, cn, IconButton, Input, Select } from "../ui";
import { Account } from "./Account";
import { Connectors } from "./Connectors";
import { ProjectSwitcher } from "./HomePage";
import { LocalRuntimeCard } from "./LocalRuntime";
import { McpAccess } from "./McpAccess";
import { ProjectSettings } from "./project/ProjectSettings";
import { settingsSections } from "./settings-sections";

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

/** Section of the settings at /settings/<section>; the left list on wide screens, a dropdown on narrow ones. */
export function SettingsPage() {
  const { section } = useParams();
  const navigate = useNavigate();
  const me = useMe();
  const { project } = useCurrentProject();
  const many = useManyProjects();
  const [key, setKey] = useState(project?.id);
  useEffect(() => setKey(project?.id), [project?.id]);
  const plugins = useStudioPlugins();
  const sections = settingsSections(me.data, plugins);
  const current = sections.find((s) => s.id === section);
  if (!current) {
    // A plugin's section is there once the plugin loaded.
    return plugins.status === "ready" ? <Navigate to="/settings/project" replace /> : null;
  }
  // The project page brings its own switcher, next to the project's name.
  const scoped = current.id === "connectors" && many;
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
        <div className={cn("min-w-0", current.id !== "project" && "max-w-2xl")}>
          {scoped ? (
            <div className="mb-6">
              <ProjectSwitcher />
            </div>
          ) : null}
          {current.id === "project" && project ? (
            <ProjectSettings key={key} project={project} />
          ) : null}
          {current.id === "connectors" && project ? (
            <div className="flex flex-col gap-6">
              <Connectors key={key} projectId={project.id} />
              <McpServers key={key} project={project} />
            </div>
          ) : null}
          {current.id === "models" ? <LocalRuntimeCard /> : null}
          {current.id === "build" ? <McpAccess /> : null}
          {current.id === "account" && me.data ? <Account me={me.data} /> : null}
          {current.id === "plugins" ? <PluginsSection /> : null}
          {current.plugin ? (
            <PluginFrame of={current.plugin}>
              <current.plugin.component />
            </PluginFrame>
          ) : null}
        </div>
      </div>
    </div>
  );
}
