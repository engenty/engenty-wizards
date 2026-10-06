import { useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router";
import { t } from "../lib/i18n";
import { useCurrentProject } from "../lib/session";
import { cn, Empty, Select } from "../ui";
import { ProjectSettings } from "./project/ProjectSettings";
import { projectSections } from "./project-sections";

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

/**
 * The space at /space: what all its wizards share. One page; the sections menu at its left
 * (a picker above it on narrow screens) jumps to a section and marks the one in view.
 */
export function ProjectPage() {
  const { project, loading } = useCurrentProject();
  const navigate = useNavigate();
  const { hash } = useLocation();
  const sections = projectSections();
  const current = useSectionInView(sections.map((s) => s.id));
  const go = (id: string) => {
    scrollToSection(id, true);
    navigate({ hash: id }, { replace: true });
  };
  // An address with a section opens the page there, once the sections are drawn.
  const projectId = project?.id;
  // biome-ignore lint/correctness/useExhaustiveDependencies: the address counts when the page opens, not after each jump.
  useEffect(() => {
    if (projectId && hash) {
      requestAnimationFrame(() => scrollToSection(hash.slice(1), false));
    }
  }, [projectId]);
  return (
    <div className="animate-rise">
      <h1 className="font-display font-semibold text-[28px] tracking-tight">{t("nav.project")}</h1>
      <div className="mt-6 grid gap-6 md:mt-8 md:grid-cols-[200px_minmax(0,1fr)] md:gap-10">
        <nav className="max-md:hidden">
          <ul className="sticky top-24 flex flex-col gap-0.5">
            {sections.map((s) => (
              <li key={s.id}>
                <a
                  href={`#${s.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    go(s.id);
                  }}
                  aria-current={s.id === current ? "location" : undefined}
                  className={cn(
                    "block rounded-lg px-3 py-2 text-[14px] transition",
                    s.id === current
                      ? "bg-paper-2 font-medium text-ink"
                      : "text-ink-3 hover:bg-accent hover:text-ink",
                  )}
                >
                  {s.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>
        <div className="-mx-4 sticky top-16 z-30 bg-background/85 px-4 py-2 backdrop-blur-md md:hidden">
          <Select
            value={current ?? ""}
            onChange={go}
            options={sections.map((s) => ({ value: s.id, label: s.label }))}
          />
        </div>
        <div className="min-w-0">
          {project ? <ProjectSettings key={project.id} project={project} /> : null}
          {/* No project yet: nothing is built here, and no local install has sent one. */}
          {!(project || loading) ? <Empty>{t("settings.noProject")}</Empty> : null}
        </div>
      </div>
    </div>
  );
}
