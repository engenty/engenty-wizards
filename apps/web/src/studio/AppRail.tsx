import { Settings } from "lucide-react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { BRAND } from "../brand";
import { EngentyLogoMark } from "../engenty/logo";
import { t } from "../lib/i18n";
import { type Me, useCurrentProject } from "../lib/session";
import { PluginFrame, useStudioPlugins } from "../plugins/host";
import { cn } from "../ui";
import { SpaceFace, SpaceMenu, UserMenu } from "./AppFrame";

/**
 * The app bar at the window's left edge, as in engenty-pro: the mark, the space, the apps the
 * plugins added, and at the foot the settings and the person. A place is a filled tile, a tool a
 * line glyph; the one that is open is cut from the page's own paper.
 */

function glyph(active: boolean): string {
  return cn(
    "grid size-10 shrink-0 place-items-center rounded-lg transition",
    active
      ? "bg-paper text-ink shadow-soft dark:ring-1 dark:ring-border-soft"
      : "text-ink-3 hover:bg-ink/10 hover:text-ink",
  );
}

/** The space's tile: it opens the spaces to switch between; the ring says its page is open. */
function SpaceTile({ me }: { me: Me }) {
  const { project } = useCurrentProject();
  const { pathname } = useLocation();
  const here = pathname === "/space" || pathname.startsWith("/space/");
  return (
    <SpaceMenu
      me={me}
      placement="beside"
      label={project?.name ?? t("nav.project")}
      className={(open) =>
        cn(
          "block rounded-lg transition",
          here || open
            ? "ring-2 ring-ink/80 ring-offset-2 ring-offset-sidebar"
            : "hover:shadow-soft",
        )
      }
    >
      <SpaceFace project={project} />
    </SpaceMenu>
  );
}

export function AppRail({ me }: { me: Me }) {
  const navigate = useNavigate();
  const plugins = useStudioPlugins();
  return (
    <aside
      aria-label={BRAND.name}
      className="hidden w-16 shrink-0 flex-col items-center pt-2 pb-3 md:flex"
    >
      {/* The mark's row is as tall as the page's top bar beside it, so the two sit on one line. */}
      <button
        type="button"
        onClick={() => navigate("/")}
        title={BRAND.name}
        aria-label={BRAND.name}
        className="grid h-12 w-11 shrink-0 place-items-center rounded-lg transition hover:bg-ink/10"
      >
        <EngentyLogoMark size={32} />
      </button>
      <div className="mt-2">
        <SpaceTile me={me} />
      </div>
      {/* The pages plugins added, each behind its icon, after a divider. */}
      {plugins.nav.length ? <div className="my-3 h-px w-7 shrink-0 bg-border" /> : null}
      <nav className="flex min-h-0 flex-1 flex-col items-center gap-1.5 overflow-y-auto">
        {plugins.nav.map((entry) => (
          <PluginFrame key={entry.serial} of={entry}>
            <NavLink
              to={entry.to}
              title={entry.label()}
              aria-label={entry.label()}
              className={({ isActive }) => glyph(isActive)}
            >
              <entry.icon className="size-5" />
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
          <Settings className="size-5" />
        </NavLink>
        <UserMenu me={me} placement="beside" />
      </div>
    </aside>
  );
}
