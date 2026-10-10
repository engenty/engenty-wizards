import {
  AppWindow,
  Check,
  ChevronDown,
  Cloud,
  CloudOff,
  CreditCard,
  Folder,
  Laptop,
  LogOut,
  Plus,
} from "lucide-react";
import {
  type CSSProperties,
  Fragment,
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { Link, useNavigate } from "react-router";
import { AboutLinks } from "../about/AboutLinks";
import { Logo } from "../brand";
import { type AppBarPosition, besideBar, useAppBar } from "../lib/appbar";
import { features } from "../lib/features";
import { t } from "../lib/i18n";
import { acceptInstall, standalone, useInstallPrompt } from "../lib/install";
import {
  initialsOf,
  type Me,
  type Project,
  signOut,
  spendableCredits,
  useCurrentProject,
  useMayCreate,
} from "../lib/session";
import { useStudioPlugins } from "../plugins/host";
import { cn } from "../ui";
import { AppRail } from "./AppRail";
import { NewSpaceDialog } from "./HomePage";
import { InstallBanner, InstallDialog } from "./InstallBanner";
import { LangSwitch } from "./LangSwitch";
import { settingsSections } from "./settings-sections";
import { ThemeSwitch } from "./ThemeSwitch";
import { UpdateBanner } from "./UpdateBanner";
import { hostOf } from "./where";

/** A step of the trail after the logo; the last one is the page itself. */
export interface Crumb {
  label: string;
  to?: string;
}

let crumbs: Crumb[] = [];
const crumbListeners = new Set<() => void>();

function setCrumbs(next: Crumb[]) {
  crumbs = next;
  for (const listener of crumbListeners) {
    listener();
  }
}

/**
 * Where in the studio a page stands, said once in the top bar instead of a heading of its own:
 * the content starts at the top. Set while the page is shown.
 */
export function useCrumbs(items: Crumb[]) {
  const key = JSON.stringify(items);
  useEffect(() => {
    setCrumbs(JSON.parse(key) as Crumb[]);
    return () => setCrumbs([]);
  }, [key]);
}

function Trail() {
  const trail = useSyncExternalStore(
    (listener) => {
      crumbListeners.add(listener);
      return () => crumbListeners.delete(listener);
    },
    () => crumbs,
  );
  if (!trail.length) {
    return null;
  }
  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center text-[0.9375rem] max-sm:hidden"
    >
      {/* After the space's name: set off by a hairline, since the space is no step of the trail. */}
      <span aria-hidden className="mx-3 h-4 w-px shrink-0 bg-border" />
      {trail.map((crumb, i) => (
        <Fragment key={`${i}:${crumb.label}`}>
          {i > 0 ? <span className="mx-2 text-ink-4">/</span> : null}
          {crumb.to && i < trail.length - 1 ? (
            <Link to={crumb.to} className="truncate text-ink-3 transition hover:text-ink">
              {crumb.label}
            </Link>
          ) : (
            <span aria-current="page" className="truncate font-medium text-ink">
              {crumb.label}
            </span>
          )}
        </Fragment>
      ))}
    </nav>
  );
}

/** Where the account lives: the Manage-App of the runtime, or of the linked account. */
const accountBase = (me: Me): string | null => me.manageUrl ?? me.account?.url ?? null;

/** Where credits are bought. */
export function billingUrl(me: Me): string | null {
  const base = accountBase(me);
  return base ? `${base}/billing` : null;
}

export function CreditsPill({ me }: { me: Me }) {
  const credits = spendableCredits(me);
  const url = billingUrl(me);
  if (credits === null || !url) {
    return null;
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3 font-medium text-[0.8125rem] tabular-nums transition",
        credits < 50 ? "bg-amber-tint text-ink" : "bg-paper-2 text-ink-2 hover:text-ink",
      )}
    >
      {/* Whole credits, rounded down: the pill never shows more than there is. */}
      {t("nav.credits", { n: Math.floor(credits).toLocaleString() })}
    </a>
  );
}

/**
 * Where a local install stands with its account, at the avatar: linked (its cloud runs what is
 * published here), linked with the sign-in run out, or alone. Nothing for a managed runtime.
 */
function accountState(me: Me): "linked" | "expired" | "alone" | null {
  if (me.mode !== "local") {
    return null;
  }
  if (!me.account) {
    return features.account ? "alone" : null;
  }
  return me.account.signedIn ? "linked" : "expired";
}

/** Closes a menu on a click outside it or on Escape, while it is open. */
export function useDismiss(ref: RefObject<HTMLElement | null>, open: boolean, close: () => void) {
  const closeRef = useRef(close);
  closeRef.current = close;
  useEffect(() => {
    if (!open) {
      return;
    }
    const onDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        closeRef.current();
      }
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        closeRef.current();
      }
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [ref, open]);
}

/**
 * Where a menu of the top bar or the app bar opens: below its trigger, or away from the bar at
 * its start (the space) or its end (the person), whichever edge the bar stands at.
 */
export type MenuPlacement = "below" | "bar-start" | "bar-end";

function placementClass(placement: MenuPlacement, position: AppBarPosition, below: string) {
  return placement === "below"
    ? below
    : besideBar(position, placement === "bar-start" ? "start" : "end");
}

/** Text light or dark by the fill's own lightness, as `--ember-on` is for the ember. */
const onFill = (color: string) =>
  `oklch(from ${color} calc(0.16 + 0.83 * clamp(0, (0.65 - l) * 1000, 1)) 0.01 h)`;

/** A space as a tile: its first brand colour behind its initials; without one, quiet paper. */
export function SpaceFace({
  project,
  size = "md",
}: {
  project: Project | null;
  size?: "sm" | "md";
}) {
  const color = project?.brand.colors?.[0]?.value;
  const initials = initialsOf(project?.name ?? "");
  return (
    <span
      className={cn(
        "grid shrink-0 place-items-center rounded-lg font-semibold tracking-wide",
        size === "md" ? "size-10 text-[0.8125rem]" : "size-9 text-[0.75rem]",
        color ? null : "bg-paper-3 text-ink ring-1 ring-border",
      )}
      style={color ? { background: color, color: onFill(color) } : undefined}
    >
      {initials || <Folder className="size-4" />}
    </span>
  );
}

/**
 * The spaces, listed as Slack lists its workspaces: the one shown first (its row opens its
 * page), the others to switch to, and a row that adds one — greyed at the plan's limit. The
 * trigger is the caller's: the space's tile in the app bar, its name in the top bar. `label`:
 * the trigger's name for a screen reader where it shows no text.
 */
export function SpaceMenu({
  me,
  placement,
  label,
  className,
  children,
}: {
  me: Me;
  placement: MenuPlacement;
  label?: string;
  className: string | ((open: boolean) => string);
  children: ReactNode;
}) {
  const navigate = useNavigate();
  const { position } = useAppBar();
  const { project, projects, select } = useCurrentProject();
  const mayCreate = useMayCreate();
  const [open, setOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useDismiss(ref, open, () => setOpen(false));
  const limit = me.limits.projects;
  const full = limit !== null && projects.length >= limit;
  const row =
    "flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-accent";
  return (
    <div className="relative shrink-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={label}
        title={t("nav.switchSpace")}
        className={typeof className === "function" ? className(open) : className}
      >
        {children}
      </button>
      {open ? (
        <div
          role="menu"
          className={cn(
            "absolute z-50 w-72 animate-rise rounded-xl bg-card p-1.5 shadow-overlay ring-1 ring-border-soft",
            placementClass(placement, position, "top-10 left-0"),
          )}
        >
          {projects.map((p) => {
            const current = p.id === project?.id;
            return (
              <button
                key={p.id}
                type="button"
                role="menuitem"
                className={row}
                onClick={() => {
                  setOpen(false);
                  if (current) {
                    navigate("/space");
                  } else {
                    select(p.id);
                  }
                }}
              >
                <SpaceFace project={p} size="sm" />
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span
                    className={cn(
                      "truncate text-[0.875rem]",
                      current ? "font-semibold text-ink" : "font-medium text-ink-2",
                    )}
                  >
                    {p.name}
                  </span>
                  <span className="truncate text-[0.75rem] text-ink-4">
                    {t("nav.wizardCount", { n: p.wizardCount })}
                  </span>
                </span>
                {current ? <Check className="size-4 shrink-0 text-ember-strong" /> : null}
              </button>
            );
          })}
          {/* A tenant that builds nothing here makes no space here either; nor does a member. */}
          {mayCreate ? (
            <>
              <div className="mx-2 my-1.5 h-px bg-border-soft" />
              <button
                type="button"
                role="menuitem"
                disabled={full}
                className={cn(row, full && "cursor-default opacity-60 hover:bg-transparent")}
                onClick={() => {
                  setOpen(false);
                  setCreating(true);
                }}
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-paper-2 text-ink-3">
                  <Plus className="size-4" />
                </span>
                <span className="flex min-w-0 flex-1 flex-col leading-tight">
                  <span className="truncate font-medium text-[0.875rem] text-ink-2">
                    {t("nav.addSpace")}
                  </span>
                  {full ? (
                    <span className="truncate text-[0.75rem] text-ink-4">
                      {t("home.projectLimit", { n: limit })}
                    </span>
                  ) : null}
                </span>
              </button>
            </>
          ) : null}
        </div>
      ) : null}
      <NewSpaceDialog open={creating} onClose={() => setCreating(false)} />
    </div>
  );
}

/** The space's name in the top bar; it opens the spaces to switch between and to add one. */
function SpaceName({ me }: { me: Me }) {
  const { project } = useCurrentProject();
  if (!project) {
    return null;
  }
  return (
    <SpaceMenu
      me={me}
      placement="below"
      className="-ml-1 flex h-8 max-w-[16rem] items-center gap-1 rounded-lg px-2 font-medium text-[0.9375rem] text-ink transition hover:bg-accent"
    >
      <span className="truncate">{project.name}</span>
      <ChevronDown className="size-4 shrink-0 text-ink-4" />
    </SpaceMenu>
  );
}

/** `placement`: where the menu opens — below the avatar in a top bar, away from the app bar. */
export function UserMenu({ me, placement = "below" }: { me: Me; placement?: MenuPlacement }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { position } = useAppBar();
  const plugins = useStudioPlugins();
  useDismiss(ref, open, () => setOpen(false));
  // The studio as an app on this device: Chrome's offer taken up at once, else how the browser does it.
  const installPrompt = useInstallPrompt();
  const [installOpen, setInstallOpen] = useState(false);
  const initials = initialsOf(me.user.name);
  const state = accountState(me);
  const item =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[0.875rem] text-ink-2 hover:bg-accent hover:text-ink";
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cn(
          "relative flex shrink-0 items-center justify-center rounded-full bg-ember-tint font-semibold text-[0.8125rem] text-ember-strong ring-1 ring-border-soft",
          // In the app bar the avatar is as large as the tiles above it.
          placement === "below" ? "size-9" : "size-10",
        )}
        aria-label={me.user.name || "Menu"}
      >
        {me.user.image ? (
          <img src={me.user.image} alt="" className="size-full rounded-full object-cover" />
        ) : (
          initials
        )}
        {state === "linked" || state === "expired" ? (
          <span
            title={
              state === "linked"
                ? t("nav.connected", { host: hostOf(me.account?.cloudUrl ?? "") })
                : t("nav.expired")
            }
            className="-right-1 -bottom-1 absolute flex size-4 items-center justify-center rounded-full bg-card ring-1 ring-border-soft"
          >
            {state === "linked" ? (
              <Cloud className="size-2.5 text-moss" />
            ) : (
              <CloudOff className="size-2.5 text-amber" />
            )}
          </span>
        ) : null}
      </button>
      {open ? (
        <div
          className={cn(
            "absolute z-50 w-72 animate-rise rounded-xl bg-card p-1.5 shadow-overlay ring-1 ring-border-soft",
            placementClass(placement, position, "top-11 right-0"),
          )}
        >
          <div className="px-3 pt-2 pb-2.5">
            <div className="truncate font-medium text-[0.875rem]">
              {me.user.name}
              {/* A local install without an account: the person is this computer's. */}
              {state === "alone" ? (
                <span className="font-normal text-ink-4"> ({t("nav.local")})</span>
              ) : null}
            </div>
            <div className="truncate text-[0.75rem] text-ink-3">{me.user.email}</div>
          </div>
          {state ? (
            // Whether what is published here runs for others: where it runs, and what to do.
            <button
              type="button"
              className="mx-1.5 mb-1.5 flex w-[calc(100%-0.75rem)] items-start gap-2.5 rounded-lg bg-paper-2 px-2.5 py-2 text-left text-[0.8125rem] text-ink-2 hover:text-ink"
              onClick={() => {
                setOpen(false);
                navigate("/settings/account");
              }}
            >
              {state === "linked" ? (
                <Cloud className="mt-0.5 size-4 shrink-0 text-moss" />
              ) : state === "expired" ? (
                <CloudOff className="mt-0.5 size-4 shrink-0 text-amber" />
              ) : (
                <Laptop className="mt-0.5 size-4 shrink-0 text-ink-3" />
              )}
              <span className="flex min-w-0 flex-1 flex-col leading-snug">
                <span className="break-words">
                  {state === "linked"
                    ? t("nav.connected", { host: hostOf(me.account?.cloudUrl ?? "") })
                    : state === "expired"
                      ? t("nav.expired")
                      : t("nav.onlyHere")}
                </span>
                <span className="font-medium text-ink tabular-nums">
                  {state === "linked"
                    ? me.account?.credits !== null && me.account?.credits !== undefined
                      ? t("nav.credits", { n: Math.floor(me.account.credits).toLocaleString() })
                      : null
                    : state === "expired"
                      ? t("account.signInAgain")
                      : t("account.signIn")}
                </span>
              </span>
            </button>
          ) : null}
          <div className="px-3 pt-1.5 pb-1 font-medium text-[0.6875rem] text-ink-4 uppercase tracking-[0.07em]">
            {t("nav.settings")}
          </div>
          {settingsSections(me, plugins)
            .filter((s) => s.menu)
            .map((s) => (
              <button
                key={s.id}
                type="button"
                className={item}
                onClick={() => {
                  setOpen(false);
                  navigate(`/settings/${s.id}`);
                }}
              >
                <s.icon className="size-4" /> {s.label}
              </button>
            ))}
          <div className="mx-2 my-1.5 h-px bg-border-soft" />
          {standalone() ? null : (
            <button
              type="button"
              className={item}
              onClick={() => {
                setOpen(false);
                if (installPrompt) {
                  void acceptInstall(installPrompt);
                } else {
                  setInstallOpen(true);
                }
              }}
            >
              <AppWindow className="size-4" /> {t("install.app.action")}
            </button>
          )}
          {me.manageUrl ? (
            <a className={item} href={`${me.manageUrl}/account`} target="_blank" rel="noreferrer">
              <CreditCard className="size-4" /> {t("nav.account")}
            </a>
          ) : null}
          <div className="flex items-center justify-between gap-3 px-3 py-2 text-[0.875rem] text-ink-2">
            {t("nav.language")}
            <LangSwitch tone="surface" />
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2 text-[0.875rem] text-ink-2">
            {t("nav.theme")}
            <ThemeSwitch />
          </div>
          {me.mode === "managed" ? (
            <button type="button" className={item} onClick={() => void signOut()}>
              <LogOut className="size-4" /> {t("nav.logout")}
            </button>
          ) : null}
        </div>
      ) : null}
      {/* Beside the menu, not in it: the menu closes as the dialog opens. */}
      <InstallDialog open={installOpen} onClose={() => setInstallOpen(false)} />
    </div>
  );
}

/**
 * The row at the top of the page: the wordmark (the mark stands in the app bar), the space's
 * name, which switches between spaces, then the trail and the credits. A phone starts at the
 * space's name; the rest stands in its app bar along the bottom.
 */
export function TopBar({ me, children }: { me: Me; children?: ReactNode }) {
  const navigate = useNavigate();
  return (
    <header className="flex h-12 shrink-0 items-center gap-2 px-3 coarse:h-14 sm:gap-3 sm:px-4 md:px-5">
      <span className="max-md:hidden">
        <Logo mark={false} onClick={() => navigate("/")} />
      </span>
      <SpaceName me={me} />
      <div className="flex min-w-0 flex-1 items-center">
        <Trail />
        {children}
      </div>
      <CreditsPill me={me} />
    </header>
  );
}

/**
 * One quiet line at the foot of a page: the places around the account, for someone signed in.
 * `about`: in the studio it also says what this app is — version, changelog, open source.
 */
export function Footer({ me, about }: { me?: Me | null; about?: boolean }) {
  const base = me ? accountBase(me) : null;
  const links = base
    ? [
        { href: `${base}/billing`, label: t("footer.billing") },
        { href: `${base}/billing/usage`, label: t("footer.usage") },
        { href: `${base}/billing/invoices`, label: t("footer.invoices") },
        { href: `${base}/`, label: t("footer.account") },
      ]
    : [];
  return (
    <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 py-6 text-[0.75rem] text-ink-4 sm:px-6">
      <span>© {new Date().getFullYear()} engenty</span>
      {links.map((link) => (
        <a
          key={link.href}
          href={link.href}
          target="_blank"
          rel="noreferrer"
          className="transition hover:text-ink-2"
        >
          {link.label}
        </a>
      ))}
      {about ? <AboutLinks /> : null}
    </footer>
  );
}

/** The studio's scroll container below the top bar; a page that watches the scroll asks for it. */
export const SCROLL_ROOT_ID = "studio-scroll";

export function scrollRoot(): HTMLElement {
  return document.getElementById(SCROLL_ROOT_ID) ?? document.documentElement;
}

/** The page's gap to the window's edges: on the three sides the bar does not stand at. */
const INSET: Record<AppBarPosition, string> = {
  left: "md:py-2 md:pr-2",
  right: "md:py-2 md:pl-2",
  top: "md:px-2 md:pb-2",
  bottom: "md:px-2 md:pt-2",
};

const DIRECTION: Record<AppBarPosition, string> = {
  left: "flex-row",
  right: "flex-row-reverse",
  top: "flex-col",
  bottom: "flex-col-reverse",
};

/**
 * The studio's frame: the app bar at an edge of the window and the page beside it, on a wide
 * screen set in from the window's edge with rounded corners, a card on the bar's ground. The
 * page scrolls inside; the bar and the top bar stay. `wide`: a page that lays out columns of its
 * own takes the screen's width. `full`: a page that fills the frame and draws its own top bar.
 */
export function AppFrame({
  me,
  wide,
  full,
  children,
}: {
  me: Me;
  wide?: boolean;
  full?: boolean;
  children: ReactNode;
}) {
  const { position, phone } = useAppBar();
  // How far the page's lower edge stands above the window's, for what docks there: the bar's
  // height where it stands at the bottom, else the page's inset.
  const insetBottom = phone
    ? position === "bottom"
      ? "calc(3.5rem + env(safe-area-inset-bottom))"
      : "0px"
    : position === "bottom"
      ? "4rem"
      : "0.5rem";
  return (
    <div
      className={cn("flex h-dvh overflow-hidden bg-sidebar", DIRECTION[position])}
      style={{ "--inset-b": insetBottom } as CSSProperties}
    >
      <AppRail me={me} />
      <div className={cn("flex min-h-0 min-w-0 flex-1 flex-col", INSET[position])}>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden bg-background md:rounded-xl md:shadow-elevated md:dark:ring-1 md:dark:ring-border-soft">
          <UpdateBanner />
          <InstallBanner />
          {full ? (
            <main className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
              {children}
            </main>
          ) : (
            <>
              <TopBar me={me} />
              {/* `relative`: what a page places out of flow without a positioned parent (a hidden
                  file field) stays in the page's own scroll, not in a frame around it, which a
                  jump to a section would scroll as well. */}
              <main id={SCROLL_ROOT_ID} className="relative min-h-0 flex-1 overflow-y-auto">
                <div
                  className={cn(
                    "mx-auto w-full px-3 pt-4 pb-12 sm:px-6 sm:pt-6",
                    wide ? "max-w-[88rem]" : "max-w-5xl",
                  )}
                >
                  {children}
                </div>
                <Footer me={me} about />
              </main>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
