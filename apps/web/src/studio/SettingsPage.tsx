import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useNavigate, useParams, useSearchParams } from "react-router";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { type Project, useCurrentProject, useManyProjects, useMe } from "../lib/session";
import { PluginFrame, useStudioPlugins } from "../plugins/host";
import { PluginsSection } from "../plugins/PluginsSection";
import { Button, Card, cn, Empty, IconButton, Input } from "../ui";
import { Account } from "./Account";
import { useCrumbs } from "./AppFrame";
import { Connectors } from "./Connectors";
import { ProjectSwitcher } from "./HomePage";
import { Integrate } from "./Integrate";
import { Models } from "./Models";
import { projectReadOnlyText, ReadOnlyNote } from "./ReadOnly";
import {
  BackRow,
  SettingsMenuContext,
  stepClass,
  useNarrow,
  useStepDirection,
} from "./settings-menu";
import { type SettingsSection, settingsSections } from "./settings-sections";

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
  /** The project is not changed here: the systems are listed, none is added, edited or removed. */
  const readOnly = project.readOnly;
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
      <fieldset disabled={readOnly} className="flex min-w-0 flex-col gap-3">
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
            {readOnly ? (
              <span />
            ) : (
              <IconButton
                label="Entfernen"
                onClick={() => setServers((all) => all.filter((_, j) => j !== i))}
                className="hover:text-rose"
              >
                <Trash2 className="size-4" />
              </IconButton>
            )}
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
        {readOnly ? null : (
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => setServers((all) => [...all, { id: "", name: "", url: "", auth: "" }])}
          >
            <Plus className="size-4" /> {t("settings.addServer")}
          </Button>
        )}
      </fieldset>
      {readOnly ? null : (
        <div className="mt-5 flex items-center justify-end gap-3">
          {save.error ? (
            <p className="text-[14px] text-rose">{(save.error as Error).message}</p>
          ) : null}
          <Button busy={save.isPending} onClick={() => save.mutate()}>
            {saved ? t("settings.saved") : t("settings.save")}
          </Button>
        </div>
      )}
    </Card>
  );
}

/** The sections whose menu goes one level down in the left container. */
const MENUS = new Set(["models", "integrate"]);

/** The left container's top row: the back arrow (one level down only) and the level's name. */
function MenuHead({ section, onBack }: { section: SettingsSection | null; onBack: () => void }) {
  return (
    <div className="mb-2 flex h-9 min-w-0 items-center px-1">
      <div
        className={cn(
          "shrink-0 overflow-hidden transition-[width,margin,opacity] duration-200 ease-out",
          section ? "-ml-1.5 mr-0.5 w-8 opacity-100" : "w-0 opacity-0",
        )}
      >
        <button
          type="button"
          onClick={onBack}
          aria-hidden={!section}
          tabIndex={section ? undefined : -1}
          aria-label={t("settings.title")}
          className="grid size-8 place-items-center rounded-lg text-ink-3 transition hover:bg-accent hover:text-ink"
        >
          <ArrowLeft className="size-4" />
        </button>
      </div>
      {section ? (
        <span className="flex min-w-0 items-center gap-2 font-medium text-[14px]">
          <section.icon className="size-4 shrink-0 text-ember-strong" />
          <span className="truncate">{section.label}</span>
        </span>
      ) : (
        <span className="font-medium text-[14px]">{t("settings.title")}</span>
      )}
    </div>
  );
}

/** The sections, the left container's upper level. */
function SectionList({
  sections,
  current,
  onPick,
}: {
  sections: SettingsSection[];
  current: SettingsSection | undefined;
  onPick: (section: SettingsSection) => void;
}) {
  return (
    <ul className="flex flex-col gap-0.5">
      {sections.map((s) => (
        <li key={s.id}>
          <Link
            to={`/settings/${s.id}`}
            onClick={(e) => {
              // The section that is open already: its menu comes back, nothing else changes.
              if (s.id === current?.id) {
                e.preventDefault();
                onPick(s);
              }
            }}
            aria-current={s.id === current?.id ? "page" : undefined}
            className={cn(
              "group flex items-center gap-2 rounded-lg px-2 py-1 text-[14px] transition max-md:py-2",
              s.id === current?.id
                ? "bg-paper-2 font-medium text-ink"
                : "text-ink-2 hover:bg-accent hover:text-ink",
            )}
          >
            <span className="grid size-7 shrink-0 place-items-center">
              <s.icon className="size-4 transition-transform duration-200 ease-out group-hover:scale-110" />
            </span>
            <span className="min-w-0 flex-1 truncate">{s.label}</span>
            {/* On a phone every row goes one step deeper. */}
            <ChevronRight className="size-4 text-ink-4 md:hidden" />
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Settings at /settings/<section>. One container on the left shows one level at a time: the
 * sections, or — for Models and Integrate — the section's own menu one level down, with the way
 * back at its top. On a phone the levels and the page take turns: the sections, a section's
 * menu, then the page, each with the way back.
 */
export function SettingsPage() {
  const { section } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const me = useMe();
  const { project, loading } = useCurrentProject();
  const many = useManyProjects();
  const [key, setKey] = useState(project?.id);
  useEffect(() => setKey(project?.id), [project?.id]);
  const plugins = useStudioPlugins();
  const narrow = useNarrow();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  // Back up to the sections on a wide page, while the section's page stays; another section
  // opens its own menu again.
  const [upAt, setUpAt] = useState<string | null>(null);
  const sections = settingsSections(me.data, plugins);
  const current = sections.find((s) => s.id === section);
  const hasMenu = current ? MENUS.has(current.id) : false;
  // A phone: 0 the sections, 1 the section's menu, 2 the page.
  const phone = !current ? 0 : hasMenu && !params.get("show") ? 1 : 2;
  const level = narrow ? Math.min(phone, 1) : hasMenu && upAt !== section ? 1 : 0;
  const levelStep = useStepDirection(level);
  const pageStep = useStepDirection(phone);
  const menu = useMemo(() => ({ slot, narrow, setDetail }), [slot, narrow]);
  // The page's name stands in the top bar: the section's content starts right at the top.
  useCrumbs([
    { label: t("settings.title"), to: "/settings" },
    ...(current ? [{ label: current.label, to: `/settings/${current.id}` }] : []),
    ...(current && detail ? [{ label: detail }] : []),
  ]);
  if (!current) {
    // The page for AI clients was /settings/build before it became "Integrate".
    if (section === "build") {
      return <Navigate to="/settings/integrate" replace />;
    }
    // The space was the settings section "project" before it got a page of its own.
    if (section === "project") {
      return <Navigate to="/space" replace />;
    }
    // A plugin's section is there once the plugin loaded. A phone starts at the sections.
    if (section !== undefined || !narrow) {
      return plugins.status === "ready" || section === undefined ? (
        <Navigate to="/settings/account" replace />
      ) : null;
    }
  }
  // Connectors belong to a project: with several, the switcher stands above them.
  const scoped = current?.id === "connectors" && many;
  return (
    <SettingsMenuContext.Provider value={menu}>
      <div className="animate-rise">
        <div className="grid gap-6 md:grid-cols-[13.5rem_minmax(0,1fr)] md:gap-8 lg:grid-cols-[15rem_minmax(0,1fr)] lg:gap-10">
          <aside
            className={cn(
              "min-w-0 md:sticky md:top-20 md:self-start",
              narrow && phone === 2 && "hidden",
              narrow && pageStep === "back" && stepClass("back"),
            )}
          >
            <MenuHead
              section={level === 1 ? (current ?? null) : null}
              onBack={() => (narrow ? navigate("/settings") : setUpAt(section ?? null))}
            />
            <div key={level} className={cn(stepClass(levelStep))}>
              {level === 0 ? (
                <SectionList
                  sections={sections}
                  current={narrow ? undefined : current}
                  onPick={() => setUpAt(null)}
                />
              ) : (
                <div ref={setSlot} />
              )}
            </div>
          </aside>
          {current ? (
            <div
              className={cn(
                "min-w-0",
                !["integrate", "models"].includes(current.id) && "max-w-2xl",
                narrow && phone < 2 && "hidden",
                narrow && pageStep === "deeper" && stepClass("deeper"),
              )}
            >
              {narrow ? (
                <div className="mb-3">
                  <BackRow
                    label={hasMenu ? current.label : t("settings.title")}
                    onBack={() => navigate(hasMenu ? `/settings/${current.id}` : "/settings")}
                  />
                </div>
              ) : null}
              {scoped ? (
                <div className="mb-6">
                  <ProjectSwitcher />
                </div>
              ) : null}
              {current.id === "connectors" && project ? (
                <div className="flex flex-col gap-6">
                  {project.readOnly ? (
                    <ReadOnlyNote>{projectReadOnlyText(project)}</ReadOnlyNote>
                  ) : null}
                  <Connectors key={key} projectId={project.id} readOnly={project.readOnly} />
                  <McpServers key={key} project={project} />
                </div>
              ) : null}
              {/* No project yet: nothing is built here, and no local install has sent one. */}
              {current.id === "connectors" && !project && !loading ? (
                <Empty>{t("settings.noProject")}</Empty>
              ) : null}
              {current.id === "models" ? <Models /> : null}
              {current.id === "integrate" ? <Integrate /> : null}
              {current.id === "account" && me.data ? <Account me={me.data} /> : null}
              {current.id === "plugins" ? <PluginsSection /> : null}
              {current.plugin ? (
                <PluginFrame of={current.plugin}>
                  <current.plugin.component />
                </PluginFrame>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </SettingsMenuContext.Provider>
  );
}
