import { Check, ChevronDown, Folder, Plus, Settings } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { BRAND } from "../brand";
import { EngentyLogoMark } from "../engenty/logo";
import { t } from "../lib/i18n";
import {
  initialsOf,
  type Me,
  type Project,
  useCurrentProject,
  useManyProjects,
  useMayCreate,
  useMe,
} from "../lib/session";
import { PluginFrame, useStudioPlugins } from "../plugins/host";
import { cn } from "../ui";
import { UserMenu } from "./AppFrame";
import { NewSpaceDialog } from "./HomePage";

/**
 * The app bar at the window's left edge, as in engenty-pro: the mark, the space, the apps the
 * plugins added, and at the foot the settings and the person. A place is a filled tile, a tool a
 * line glyph; the one that is open is cut from the page's own paper.
 */

function glyph(active: boolean): string {
  return cn(
    "grid size-9 shrink-0 place-items-center rounded-lg transition",
    active
      ? "bg-paper text-ink shadow-soft dark:ring-1 dark:ring-border-soft"
      : "text-ink-3 hover:bg-ink/10 hover:text-ink",
  );
}

/** Text light or dark by the fill's own lightness, as `--ember-on` is for the ember. */
const onFill = (color: string) =>
  `oklch(from ${color} calc(0.16 + 0.83 * clamp(0, (0.65 - l) * 1000, 1)) 0.01 h)`;

/** The space as a tile: its first brand colour behind its initials; without one, quiet paper. */
function SpaceFace({ project }: { project: Project | null }) {
  const color = project?.brand.colors?.[0]?.value;
  const initials = initialsOf(project ? project.brand.name?.trim() || project.name : "");
  return (
    <span
      className={cn(
        "grid size-9 place-items-center rounded-lg font-semibold text-[0.75rem] tracking-wide",
        color ? null : "bg-paper-3 text-ink ring-1 ring-border",
      )}
      style={color ? { background: color, color: onFill(color) } : undefined}
    >
      {initials || <Folder className="size-4" />}
    </span>
  );
}

/** The space: its tile opens its page; with several spaces, the chevron below picks another. */
function SpaceTile() {
  const { project, projects, select } = useCurrentProject();
  const many = useManyProjects();
  const mayCreate = useMayCreate();
  // Null: as many as wanted.
  const limit = useMe().data?.limits.projects ?? 1;
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
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
  const title = project ? project.brand.name?.trim() || project.name : t("nav.project");
  const item =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[0.875rem] text-ink-2 hover:bg-accent hover:text-ink";
  return (
    <div className="relative flex flex-col items-center" ref={ref}>
      <NavLink
        to="/space"
        title={title}
        aria-label={title}
        className={({ isActive }) =>
          cn(
            "rounded-lg transition",
            isActive ? "ring-2 ring-ink/80 ring-offset-2 ring-offset-sidebar" : "hover:shadow-soft",
          )
        }
      >
        <SpaceFace project={project} />
      </NavLink>
      {many ? (
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={t("nav.switchSpace")}
          title={t("nav.switchSpace")}
          className="mt-0.5 grid h-4 w-9 place-items-center rounded text-ink-4 transition hover:text-ink"
        >
          <ChevronDown className="size-3.5" />
        </button>
      ) : null}
      {open ? (
        <div className="absolute top-0 left-full z-50 ml-3 w-64 animate-rise rounded-xl bg-card p-1.5 shadow-overlay ring-1 ring-border-soft">
          <div className="px-3 pt-2 pb-1 font-medium text-[0.6875rem] text-ink-4 uppercase tracking-[0.07em]">
            {t("nav.project")}
          </div>
          {projects.map((p) => (
            <button
              key={p.id}
              type="button"
              className={cn(item, p.id === project?.id && "font-medium text-ink")}
              onClick={() => {
                select(p.id);
                setOpen(false);
              }}
            >
              <span className="min-w-0 flex-1 truncate">{p.name}</span>
              {p.id === project?.id ? <Check className="size-4 text-ember-strong" /> : null}
            </button>
          ))}
          {/* A tenant that builds nothing here makes no space here either; nor does a member. */}
          {mayCreate ? (
            <>
              <div className="mx-2 my-1.5 h-px bg-border-soft" />
              {limit === null || projects.length < limit ? (
                <button
                  type="button"
                  className={item}
                  onClick={() => {
                    setOpen(false);
                    setCreating(true);
                  }}
                >
                  <Plus className="size-4" /> {t("home.newProject")}
                </button>
              ) : (
                <p className="px-3 py-2 text-[0.8125rem] text-ink-4">
                  {t("home.projectLimit", { n: limit })}
                </p>
              )}
            </>
          ) : null}
        </div>
      ) : null}
      <NewSpaceDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

export function AppRail({ me }: { me: Me }) {
  const navigate = useNavigate();
  const plugins = useStudioPlugins();
  return (
    <aside
      aria-label={BRAND.name}
      className="hidden w-14 shrink-0 flex-col items-center pt-2 pb-3 md:flex"
    >
      {/* The mark's row is as tall as the page's top bar beside it, so the two sit on one line. */}
      <button
        type="button"
        onClick={() => navigate("/")}
        title={BRAND.name}
        aria-label={BRAND.name}
        className="grid h-12 w-10 shrink-0 place-items-center rounded-lg transition hover:bg-ink/10"
      >
        <EngentyLogoMark size={30} />
      </button>
      <div className="mt-2">
        <SpaceTile />
      </div>
      {/* The pages plugins added, each behind its icon, after a divider. */}
      {plugins.nav.length ? <div className="my-3 h-px w-6 shrink-0 bg-border" /> : null}
      <nav className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto">
        {plugins.nav.map((entry) => (
          <PluginFrame key={entry.serial} of={entry}>
            <NavLink
              to={entry.to}
              title={entry.label()}
              aria-label={entry.label()}
              className={({ isActive }) => glyph(isActive)}
            >
              <entry.icon className="size-[1.125rem]" />
            </NavLink>
          </PluginFrame>
        ))}
      </nav>
      <div className="flex shrink-0 flex-col items-center gap-2 pt-3">
        <NavLink
          to="/settings"
          title={t("nav.settings")}
          aria-label={t("nav.settings")}
          className={({ isActive }) => glyph(isActive)}
        >
          <Settings className="size-[1.125rem]" />
        </NavLink>
        <UserMenu me={me} placement="beside" />
      </div>
    </aside>
  );
}
