import { Cloud, CloudOff, CreditCard, Folder, Laptop, LogOut, Settings } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { NavLink, useNavigate } from "react-router";
import { AboutLinks } from "../about/AboutLinks";
import { Logo } from "../brand";
import { features } from "../lib/features";
import { t } from "../lib/i18n";
import { initialsOf, type Me, signOut, spendableCredits } from "../lib/session";
import { PluginFrame, useStudioPlugins } from "../plugins/host";
import { cn, IconButton } from "../ui";
import { InstallBanner } from "./InstallBanner";
import { LangSwitch } from "./LangSwitch";
import { settingsSections } from "./settings-sections";
import { ThemeSwitch } from "./ThemeSwitch";
import { UpdateBanner } from "./UpdateBanner";
import { hostOf } from "./where";

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
  const state = accountState(me);
  const item =
    "flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[14px] text-ink-2 hover:bg-accent hover:text-ink";
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex size-9 shrink-0 items-center justify-center rounded-full bg-ember-tint font-semibold text-[13px] text-ember-strong ring-1 ring-border-soft"
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
        <div className="absolute top-11 right-0 z-50 w-72 animate-rise rounded-xl bg-card p-1.5 shadow-overlay ring-1 ring-border-soft">
          <div className="px-3 pt-2 pb-2.5">
            <div className="truncate font-medium text-[14px]">
              {me.user.name}
              {/* A local install without an account: the person is this computer's. */}
              {state === "alone" ? (
                <span className="font-normal text-ink-4"> ({t("nav.local")})</span>
              ) : null}
            </div>
            <div className="truncate text-[12px] text-ink-3">{me.user.email}</div>
          </div>
          {state ? (
            // Whether what is published here runs for others: where it runs, and what to do.
            <button
              type="button"
              className="mx-1.5 mb-1.5 flex w-[calc(100%-0.75rem)] items-start gap-2.5 rounded-lg bg-paper-2 px-2.5 py-2 text-left text-[13px] text-ink-2 hover:text-ink"
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
      <NavLink
        to="/space"
        title={t("nav.project")}
        aria-label={t("nav.project")}
        className={({ isActive }) =>
          cn(
            "flex h-9 shrink-0 items-center gap-2 rounded-full px-3 font-medium text-[14px] ring-1 ring-border-soft transition coarse:h-11 sm:px-3.5",
            isActive ? "bg-paper-2 text-ink" : "text-ink-2 hover:bg-accent hover:text-ink",
          )
        }
      >
        <Folder className="size-4" />
        <span className="max-sm:hidden">{t("nav.project")}</span>
      </NavLink>
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
        onClick={() => navigate("/settings/account")}
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
