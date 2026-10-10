import {
  Check,
  EyeOff,
  type LucideIcon,
  PanelBottom,
  PanelLeft,
  PanelRight,
  PanelTop,
  Pin,
  Settings,
} from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router";
import { BRAND } from "../brand";
import { EngentyLogoMark } from "../engenty/logo";
import {
  APP_BAR_POSITIONS,
  type AppBarPosition,
  isHorizontal,
  setAppBar,
  useAppBar,
} from "../lib/appbar";
import { t } from "../lib/i18n";
import { type Me, useCurrentProject } from "../lib/session";
import { PluginFrame, useStudioPlugins } from "../plugins/host";
import { cn } from "../ui";
import { SpaceFace, SpaceMenu, UserMenu, useDismiss } from "./AppFrame";

/**
 * The app bar at an edge of the window, as in engenty-pro: the mark, the space, the apps the
 * plugins added, and at its end the settings and the person. A place is a filled tile, a tool a
 * line glyph; the one that is open is cut from the page's own paper. A right click on the bar
 * picks its edge and hides it; hidden, it comes out while the pointer rests at that edge.
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
      placement="bar-start"
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

const POSITION_ICON: Record<AppBarPosition, LucideIcon> = {
  left: PanelLeft,
  top: PanelTop,
  right: PanelRight,
  bottom: PanelBottom,
};

/** The bar's own menu, at the pointer: its edge, and whether it shows at all. */
function BarMenu({ at, onClose }: { at: { x: number; y: number }; onClose: () => void }) {
  const { position, hidden } = useAppBar();
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, true, onClose);
  const item =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-[0.875rem] text-ink-2 hover:bg-accent hover:text-ink";
  return (
    <div
      ref={ref}
      role="menu"
      className="fixed z-[60] w-56 animate-rise rounded-xl bg-card p-1.5 shadow-overlay ring-1 ring-border-soft"
      // Kept inside the window, whichever corner the bar stands in.
      style={{
        left: Math.max(8, Math.min(at.x, window.innerWidth - 232)),
        top: Math.max(8, Math.min(at.y, window.innerHeight - 290)),
      }}
      onContextMenu={(e) => e.preventDefault()}
    >
      <div className="px-3 pt-2 pb-1 font-medium text-[0.6875rem] text-ink-4 uppercase tracking-[0.07em]">
        {t("appbar.position")}
      </div>
      {APP_BAR_POSITIONS.map((edge) => {
        const Icon = POSITION_ICON[edge];
        return (
          <button
            key={edge}
            type="button"
            role="menuitemradio"
            aria-checked={edge === position}
            className={cn(item, edge === position && "text-ink")}
            onClick={() => {
              setAppBar({ position: edge });
              onClose();
            }}
          >
            <Icon className="size-4" />
            <span className="flex-1">{t(`appbar.${edge}`)}</span>
            {edge === position ? <Check className="size-4 text-ember-strong" /> : null}
          </button>
        );
      })}
      <div className="mx-2 my-1.5 h-px bg-border-soft" />
      <button
        type="button"
        role="menuitem"
        className={item}
        onClick={() => {
          setAppBar({ hidden: !hidden });
          onClose();
        }}
      >
        {hidden ? <Pin className="size-4" /> : <EyeOff className="size-4" />}
        {t(hidden ? "appbar.pin" : "appbar.hide")}
      </button>
    </div>
  );
}

/** The bar's place when it is hidden and comes out: along the edge it belongs to. */
const AT_EDGE: Record<AppBarPosition, string> = {
  left: "inset-y-0 left-0",
  right: "inset-y-0 right-0",
  top: "inset-x-0 top-0",
  bottom: "inset-x-0 bottom-0",
};

/** The strip along the edge that brings a hidden bar out. */
const STRIP: Record<AppBarPosition, string> = {
  left: "inset-y-0 left-0 w-2",
  right: "inset-y-0 right-0 w-2",
  top: "inset-x-0 top-0 h-2",
  bottom: "inset-x-0 bottom-0 h-2",
};

/** The small mark that says a hidden bar is there. */
const PILL: Record<AppBarPosition, string> = {
  left: "-translate-y-1/2 top-1/2 left-1 h-10 w-1",
  right: "-translate-y-1/2 top-1/2 right-1 h-10 w-1",
  top: "-translate-x-1/2 top-1 left-1/2 h-1 w-10",
  bottom: "-translate-x-1/2 bottom-1 left-1/2 h-1 w-10",
};

export function AppRail({ me }: { me: Me }) {
  const navigate = useNavigate();
  const plugins = useStudioPlugins();
  const { position, hidden } = useAppBar();
  const horizontal = isHorizontal(position);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  // A hidden bar out for the pointer; it stays while its menu is open.
  const [peek, setPeek] = useState(false);
  const leave = useRef(0);
  useEffect(() => () => window.clearTimeout(leave.current), []);
  const comeOut = () => {
    window.clearTimeout(leave.current);
    setPeek(true);
  };
  const goBack = () => {
    window.clearTimeout(leave.current);
    leave.current = window.setTimeout(() => setPeek(false), 350);
  };
  const onContextMenu = (e: MouseEvent) => {
    e.preventDefault();
    setMenu({ x: e.clientX, y: e.clientY });
  };
  const shown = !hidden || peek || menu !== null;
  return (
    <>
      {hidden ? (
        <>
          <div className={cn("fixed z-40 max-md:hidden", STRIP[position])} onMouseEnter={comeOut} />
          {shown ? null : (
            <div
              aria-hidden
              className={cn(
                "pointer-events-none fixed z-40 rounded-full bg-ink/25 max-md:hidden",
                PILL[position],
              )}
            />
          )}
        </>
      ) : null}
      {shown ? (
        <aside
          aria-label={BRAND.name}
          onContextMenu={onContextMenu}
          onMouseEnter={hidden ? comeOut : undefined}
          onMouseLeave={hidden ? goBack : undefined}
          className={cn(
            "hidden shrink-0 items-center bg-sidebar md:flex",
            horizontal ? "h-14 w-full flex-row gap-1.5 px-2" : "h-full w-16 flex-col pt-2 pb-3",
            hidden && cn("fixed z-50 shadow-overlay", AT_EDGE[position]),
          )}
        >
          {/* Beside the page, the mark's row is as tall as the page's top bar, so the two sit on
              one line. */}
          <button
            type="button"
            onClick={() => navigate("/")}
            title={BRAND.name}
            aria-label={BRAND.name}
            className={cn(
              "grid shrink-0 place-items-center rounded-lg transition hover:bg-ink/10",
              horizontal ? "size-11" : "h-12 w-11",
            )}
          >
            <EngentyLogoMark size={32} />
          </button>
          <div className={horizontal ? "ml-1" : "mt-2"}>
            <SpaceTile me={me} />
          </div>
          {/* The pages plugins added, each behind its icon, after a divider. */}
          {plugins.nav.length ? (
            <div
              className={cn("shrink-0 bg-border", horizontal ? "mx-2 h-7 w-px" : "my-3 h-px w-7")}
            />
          ) : null}
          <nav
            className={cn(
              "flex min-h-0 min-w-0 flex-1 items-center gap-1.5",
              horizontal ? "flex-row overflow-x-auto" : "flex-col overflow-y-auto",
            )}
          >
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
          <div
            className={cn(
              "flex shrink-0 items-center gap-2",
              horizontal ? "flex-row pl-3" : "flex-col pt-3",
            )}
          >
            <NavLink
              to="/settings"
              title={t("nav.settings")}
              aria-label={t("nav.settings")}
              className={({ isActive }) => glyph(isActive)}
            >
              <Settings className="size-5" />
            </NavLink>
            <UserMenu me={me} placement="bar-end" />
          </div>
          {menu ? <BarMenu at={menu} onClose={() => setMenu(null)} /> : null}
        </aside>
      ) : null}
    </>
  );
}
