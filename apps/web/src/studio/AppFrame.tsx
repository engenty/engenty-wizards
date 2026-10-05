import { CreditCard, LogOut, Settings } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { AboutLinks } from "../about/AboutLinks";
import { Logo } from "../brand";
import { t } from "../lib/i18n";
import { initialsOf, type Me, signOut, spendableCredits } from "../lib/session";
import { PluginFrame, useStudioPlugins } from "../plugins/host";
import { cn, IconButton } from "../ui";
import { InstallBanner } from "./InstallBanner";
import { LangSwitch } from "./LangSwitch";
import { settingsSections } from "./settings-sections";
import { ThemeSwitch } from "./ThemeSwitch";
import { UpdateBanner } from "./UpdateBanner";

/** Where the account lives: the Manage-App of the runtime, or of the linked account. */
const accountBase = (me: Me): string | null => me.manageUrl ?? me.account?.url ?? null;

/** Where credits are bought. */
function billingUrl(me: Me): string | null {
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
        "flex h-8 shrink-0 items-center whitespace-nowrap rounded-full px-3 font-medium text-[13px] tabular-nums transition",
        credits < 50 ? "bg-amber-tint text-ink" : "bg-paper-2 text-ink-2 hover:text-ink",
      )}
    >
      {/* Whole credits, rounded down: the pill never shows more than there is. */}
      {t("nav.credits", { n: Math.floor(credits).toLocaleString() })}
    </a>
  );
}

export function UserMenu({ me }: { me: Me }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const plugins = useStudioPlugins();
  useEffect(() => {
    const close = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, []);
  const initials = initialsOf(me.user.name);
  const item =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] text-ink-2 hover:bg-accent hover:text-ink";
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-full bg-ember-tint font-semibold text-[13px] text-ember-strong ring-1 ring-border-soft"
        aria-label={me.user.name || "Menu"}
      >
        {me.user.image ? (
          <img src={me.user.image} alt="" className="size-full object-cover" />
        ) : (
          initials
        )}
      </button>
      {open ? (
        <div className="absolute top-11 right-0 z-50 w-60 animate-rise rounded-xl bg-card p-1.5 shadow-overlay ring-1 ring-border-soft">
          <div className="px-3 pt-2 pb-2.5">
            <div className="truncate font-medium text-[14px]">{me.user.name}</div>
            <div className="truncate text-[12px] text-ink-3">{me.user.email}</div>
          </div>
          <div className="px-3 pt-1.5 pb-1 font-medium text-[11px] text-ink-4 uppercase tracking-[0.07em]">
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
          {me.manageUrl ? (
            <a className={item} href={`${me.manageUrl}/account`} target="_blank" rel="noreferrer">
              <CreditCard className="size-4" /> {t("nav.account")}
            </a>
          ) : null}
          <div className="flex items-center justify-between gap-3 px-3 py-2 text-[14px] text-ink-2">
            {t("nav.language")}
            <LangSwitch tone="surface" />
          </div>
          <div className="flex items-center justify-between gap-3 px-3 py-2 text-[14px] text-ink-2">
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
    </div>
  );
}

export function TopBar({ me, children }: { me: Me; children?: ReactNode }) {
  const navigate = useNavigate();
  const plugins = useStudioPlugins();
  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-2 bg-background/85 px-4 backdrop-blur-md sm:gap-3 sm:px-6">
      <Logo onClick={() => navigate("/")} />
      <div className="min-w-0 flex-1">{children}</div>
      <CreditsPill me={me} />
      {/* The pages plugins added, each behind its icon. */}
      {plugins.nav.map((entry) => (
        <PluginFrame key={entry.serial} of={entry}>
          <IconButton
            label={entry.label()}
            onClick={() => navigate(entry.to)}
            className="ring-1 ring-border-soft"
          >
            <entry.icon className="size-4" />
          </IconButton>
        </PluginFrame>
      ))}
      <IconButton
        label={t("nav.settings")}
        onClick={() => navigate("/settings/project")}
        className="ring-1 ring-border-soft"
      >
        <Settings className="size-4" />
      </IconButton>
      <UserMenu me={me} />
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
    <footer className="mx-auto flex w-full max-w-5xl flex-wrap items-center justify-center gap-x-5 gap-y-1 px-4 py-6 text-[12px] text-ink-4 sm:px-6">
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

/** `wide`: a page that lays out columns of its own takes the screen's width. */
export function AppFrame({ me, wide, children }: { me: Me; wide?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <UpdateBanner />
      <InstallBanner />
      <TopBar me={me} />
      <main
        className={cn(
          "mx-auto w-full flex-1 px-4 pt-6 pb-12 sm:px-6",
          wide ? "max-w-[88rem]" : "max-w-5xl",
        )}
      >
        {children}
      </main>
      <Footer me={me} about />
    </div>
  );
}
