import { Layers, LayoutGrid, Puzzle, WandSparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useLocation, useNavigate, useParams, useSearchParams } from "react-router";
import { t } from "../lib/i18n";
import { useCurrentProject, useManyProjects } from "../lib/session";
import { PluginFrame, useStudioPlugins } from "../plugins/host";
import { cn, Empty } from "../ui";
import { useCrumbs } from "./AppFrame";
import { PageEditor } from "./project/PageEditor";
import { ProjectSettings } from "./project/ProjectSettings";
import { NO_FILTER, Results, type ResultsFilter, useResults } from "./project/Results";
import { Anchor, Section } from "./project/Section";
import { DATA_ICON, DataOverview, dataGroups, useSpaceData } from "./project/SpaceData";
import { SpaceSwitcher } from "./project/SpaceSwitcher";
import { TableEditor } from "./project/TableEditor";
import {
  groupOfSection,
  isSpaceGroup,
  type ProjectSectionGroup,
  projectSections,
  type SpaceGroupId,
  spaceGroups,
} from "./project-sections";
import {
  BackRow,
  LevelHead,
  LevelList,
  MenuGroup,
  MenuRow,
  SettingsMenuContext,
  SubMenu,
  stepClass,
  useNarrow,
  useStepDirection,
} from "./settings-menu";

/**
 * The section in view: the last whose top passed the upper third of the window (below the
 * sticky bars); at the end of the page the last one, which may be too short to get there.
 */
function useSectionInView(ids: string[]): string | undefined {
  const key = ids.join(" ");
  const [current, setCurrent] = useState<string | undefined>(ids[0]);
  useEffect(() => {
    const list = key.split(" ");
    let frame = 0;
    const update = () => {
      frame = 0;
      const atEnd =
        window.scrollY > 0 &&
        window.innerHeight + window.scrollY >= document.documentElement.scrollHeight - 4;
      const line = Math.max(160, window.innerHeight / 3);
      let found = list[0];
      for (const id of list) {
        const top = document.getElementById(id)?.getBoundingClientRect().top;
        if (top !== undefined && top <= line) {
          found = id;
        }
      }
      setCurrent(atEnd ? list.at(-1) : found);
    };
    const schedule = () => {
      frame ||= requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [key]);
  return current;
}

function scrollToSection(id: string, smooth: boolean) {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  document
    .getElementById(id)
    ?.scrollIntoView({ block: "start", behavior: smooth && !reduced ? "smooth" : "auto" });
}

/** The rows of a part's sections: its own, then each plugin's under the plugin's name. */
function SectionRows({
  groups,
  current,
  onPick,
}: {
  groups: ProjectSectionGroup[];
  current: string | undefined;
  onPick: (id: string) => void;
}) {
  return groups.map((group) => {
    const rows = group.sections.map((s) => (
      <MenuRow
        key={s.id}
        icon={s.icon ?? Puzzle}
        label={s.label}
        selected={s.id === current}
        onPick={() => onPick(s.id)}
      />
    ));
    return group.label ? (
      <MenuGroup key={group.plugin} label={group.label}>
        {rows}
      </MenuGroup>
    ) : (
      <ul key="own" className="flex flex-col gap-0.5">
        {rows}
      </ul>
    );
  });
}

/**
 * The space at /space/<part>: what all its wizards share, in four parts — Info & Marke, Wissen,
 * Daten and Ergebnisse. The left container shows one level at a time, as the settings do: the
 * parts, or the menu of the part that is open, which jumps to its sections and marks the one in
 * view (Ergebnisse: picks a wizard). On a phone the parts, a part's menu and the page take
 * turns. Plugins add sections to a part; each plugin's stand under its name.
 */
export function ProjectPage() {
  const { group: param } = useParams();
  const [params, setParams] = useSearchParams();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const { project, loading } = useCurrentProject();
  const many = useManyProjects();
  const plugins = useStudioPlugins();
  const narrow = useNarrow();
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  // Back up to the parts on a wide page, while the part's page stays; another part opens its
  // own menu again.
  const [upAt, setUpAt] = useState<string | null>(null);
  const group: SpaceGroupId | undefined = isSpaceGroup(param) ? param : undefined;
  const entries = spaceGroups().map((g) => ({ ...g, to: `/space/${g.id}` }));
  const entry = entries.find((e) => e.id === group);
  const show = params.get("show");
  // A phone: 0 the parts, 1 the part's menu, 2 the page.
  const phone = !group ? 0 : show ? 2 : 1;
  const level = narrow ? Math.min(phone, 1) : group && upAt !== group ? 1 : 0;
  const levelStep = useStepDirection(level);
  const pageStep = useStepDirection(phone);
  const menu = useMemo(() => ({ slot, narrow, setDetail }), [slot, narrow]);
  const title = project ? project.brand.name?.trim() || project.name : t("nav.project");

  const sections = group && group !== "results" ? projectSections(group, plugins) : [];
  const added = group ? projectSections(group, plugins).filter((g) => g.plugin) : [];
  const anchors = [...sections, ...(group === "results" ? added : [])].flatMap((g) =>
    g.sections.map((s) => s.id),
  );
  const inView = useSectionInView(anchors);
  // Ergebnisse: of one wizard (`?show=<id>`), or of all.
  const wizardId = group === "results" && show && show !== "all" ? show : null;
  const [filter, setFilter] = useState<ResultsFilter>(NO_FILTER);
  const results = useResults(group === "results" ? project?.id : undefined, wizardId, filter);
  const wizardTitle = results.data?.wizards.find((w) => w.id === wizardId)?.title;
  // Daten: a table (`?show=t:<id>`) or a page (`p:<id>`), or all of them.
  const picked = group === "data" && show && show !== "all" ? show : null;
  const spaceData = useSpaceData(group === "data" ? project?.id : undefined);
  const pickedTitle = spaceData.data
    ? dataGroups(spaceData.data)
        .flatMap((g) => g.items)
        .find((item) => item.key === picked)?.title
    : undefined;

  useCrumbs([
    { label: title, to: "/space" },
    ...(entry ? [{ label: entry.label, to: `/space/${entry.id}` }] : []),
    ...(entry && (detail ?? wizardTitle ?? pickedTitle)
      ? [{ label: (detail ?? wizardTitle ?? pickedTitle) as string }]
      : []),
  ]);

  // A section named in the address (`#logos`, or `?show=logos` on a phone) is scrolled to once
  // it is drawn: a plugin's comes after the space's own. A jump from the menu scrolls by itself.
  const target = group === "results" || group === "data" ? hash.slice(1) : show || hash.slice(1);
  const scrolled = useRef("");
  // biome-ignore lint/correctness/useExhaustiveDependencies: drawn sections arrive with the project and the plugins.
  useEffect(() => {
    const key = `${group}#${target}`;
    if (target && scrolled.current !== key && document.getElementById(target)) {
      scrolled.current = key;
      requestAnimationFrame(() => scrollToSection(target, false));
    }
  }, [group, target, project?.id, plugins.spaceSections]);

  if (!group) {
    // The space was one page: `/space#documents` opens the part the section is in now.
    const id = hash.slice(1);
    const of = id ? groupOfSection(id, plugins) : null;
    if (of) {
      return (
        <Navigate
          to={narrow ? `/space/${of}?show=${id}` : { pathname: `/space/${of}`, hash: id }}
          replace
        />
      );
    }
    if (id && plugins.status !== "ready") {
      return null;
    }
    // A phone starts at the parts.
    if (param !== undefined || !narrow) {
      return <Navigate to="/space/info" replace />;
    }
  }

  const jump = (id: string) => {
    if (narrow) {
      navigate({ search: `?show=${id}` });
      return;
    }
    scrolled.current = `${group}#${id}`;
    scrollToSection(id, true);
    navigate({ search: "", hash: id }, { replace: true });
  };
  // Ergebnisse and Daten pick what the page shows: on a phone a step deeper, beside the menu in place.
  const pick = (id: string) =>
    narrow
      ? setParams({ show: id })
      : setParams(id === "all" ? {} : { show: id }, { replace: true });
  const pluginSections = (list: ProjectSectionGroup[]) =>
    list
      .flatMap((g) => g.sections)
      .map((s) => plugins.spaceSections.find((x) => x.id === s.id))
      .filter((s) => s !== undefined)
      .map((section) => (
        <Anchor key={section.serial} id={section.id}>
          <Section title={section.label()} hint={section.hint?.()} plain>
            <PluginFrame of={section}>
              <section.component />
            </PluginFrame>
          </Section>
        </Anchor>
      ));
  // On a phone the menu marks nothing: a row opens the page.
  const marked = narrow ? undefined : inView;

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
            <LevelHead
              title={title}
              open={level === 1 ? (entry ?? null) : null}
              onBack={() => (narrow ? navigate("/space") : setUpAt(group ?? null))}
            />
            <div key={level} className={cn(stepClass(levelStep))}>
              {level === 0 ? (
                <LevelList
                  entries={entries}
                  current={narrow ? undefined : entry}
                  onPick={() => setUpAt(null)}
                />
              ) : (
                <div ref={setSlot} />
              )}
            </div>
          </aside>
          {group ? (
            <div
              className={cn(
                "min-w-0",
                narrow && phone < 2 && "hidden",
                narrow && pageStep === "deeper" && stepClass("deeper"),
              )}
            >
              {narrow ? (
                <div className="mb-3">
                  <BackRow
                    label={entry?.label ?? title}
                    onBack={() => navigate(`/space/${group}`)}
                  />
                </div>
              ) : null}
              {many && project ? (
                <div className="mb-6">
                  <SpaceSwitcher project={project} />
                </div>
              ) : null}

              {group === "results" ? (
                <SubMenu>
                  <ul className="flex flex-col gap-0.5">
                    <MenuRow
                      icon={Layers}
                      label={t("space.resultsAll")}
                      selected={!narrow && !wizardId}
                      onPick={() => pick("all")}
                    />
                    {/* The wizards that have a result; the one picked stays. */}
                    {results.data?.wizards
                      .filter((w) => w.results || w.id === wizardId)
                      .map((w) => (
                        <MenuRow
                          key={w.id}
                          icon={WandSparkles}
                          label={w.title}
                          badge={
                            w.results ? (
                              <span className="text-[0.75rem] text-ink-3 tabular-nums">
                                {w.results}
                              </span>
                            ) : null
                          }
                          selected={!narrow && w.id === wizardId}
                          onPick={() => pick(w.id)}
                        />
                      ))}
                  </ul>
                  <SectionRows groups={added} current={marked} onPick={jump} />
                </SubMenu>
              ) : group === "data" ? (
                <SubMenu>
                  <ul className="flex flex-col gap-0.5">
                    <MenuRow
                      icon={LayoutGrid}
                      label={t("data.all")}
                      selected={!narrow && !picked}
                      onPick={() => pick("all")}
                    />
                  </ul>
                  {spaceData.data
                    ? dataGroups(spaceData.data).map((g) => (
                        <MenuGroup key={g.key} label={g.label}>
                          {g.items.map((item) => (
                            <MenuRow
                              key={item.key}
                              icon={DATA_ICON[item.kind]}
                              label={item.title}
                              selected={!narrow && item.key === picked}
                              onPick={() => pick(item.key)}
                            />
                          ))}
                        </MenuGroup>
                      ))
                    : null}
                  <SectionRows groups={added} current={marked} onPick={jump} />
                </SubMenu>
              ) : (
                <SubMenu>
                  <SectionRows groups={sections} current={marked} onPick={jump} />
                </SubMenu>
              )}

              {project && (group === "info" || group === "knowledge") ? (
                <ProjectSettings key={project.id} project={project} group={group}>
                  {pluginSections(added)}
                </ProjectSettings>
              ) : null}
              {project && group === "data" ? (
                <div className="flex flex-col gap-9 pb-20">
                  {picked?.startsWith("t:") ? (
                    <TableEditor
                      key={picked}
                      tableId={picked.slice(2)}
                      onGone={() => pick("all")}
                    />
                  ) : picked?.startsWith("p:") ? (
                    <PageEditor key={picked} pageId={picked.slice(2)} onGone={() => pick("all")} />
                  ) : (
                    <>
                      {spaceData.data ? (
                        <DataOverview
                          projectId={project.id}
                          data={spaceData.data}
                          readOnly={project.readOnly}
                          onOpen={pick}
                        />
                      ) : null}
                      {pluginSections(added)}
                    </>
                  )}
                </div>
              ) : null}
              {project && group === "results" ? (
                <div className="flex flex-col gap-9 pb-20">
                  {results.data ? (
                    <Results
                      data={results.data}
                      wizardId={wizardId}
                      filter={filter}
                      onFilter={setFilter}
                    />
                  ) : null}
                  {results.isError ? (
                    <p className="text-[0.875rem] text-rose">{(results.error as Error).message}</p>
                  ) : null}
                  {pluginSections(added)}
                </div>
              ) : null}
              {/* No project yet: nothing is built here, and no local install has sent one. */}
              {!(project || loading) ? <Empty>{t("settings.noProject")}</Empty> : null}
            </div>
          ) : null}
        </div>
      </div>
    </SettingsMenuContext.Provider>
  );
}
