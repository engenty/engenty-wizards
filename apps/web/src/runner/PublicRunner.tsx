import type { BrandView, PublicWizard } from "@engenty-wizards/shared/run";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight, Smartphone, SquarePlus } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { BASE, withBase } from "@/lib/base";
import { BRAND, Mascot, ThemeToggle } from "../brand";
import { api, isOffline } from "../lib/api";
import { appLink, appTell, IN_APP } from "../lib/app";
import { EMBED, useEmbed } from "../lib/embed";
import { t } from "../lib/i18n";
import { useStage } from "../lib/theme";
import { Button, cn, Spinner } from "../ui";
import { RunnerBody } from "./RunnerView";

/** The wizard owner's accent recolours the whole palette: every Ember token derives from --raw-primary. */
export function useBrandAccent(accent: string | null | undefined) {
  useEffect(() => {
    if (!accent) {
      return;
    }
    const root = document.documentElement;
    root.style.setProperty("--raw-primary", accent);
    return () => {
      root.style.removeProperty("--raw-primary");
    };
  }, [accent]);
}

/**
 * A wizard's link is an app of its own: the browser's "add to home screen" then installs this
 * wizard — its name, its start address — not the studio.
 */
function useWizardApp(token: string | undefined, title: string | undefined) {
  useEffect(() => {
    const link = document.querySelector<HTMLLinkElement>('link[rel="manifest"]');
    if (!token || !title || !link) {
      return;
    }
    const before = link.getAttribute("href") ?? "/manifest.webmanifest";
    link.setAttribute("href", `/api/public/wizards/${token}/manifest.webmanifest`);
    const name = document.createElement("meta");
    name.name = "apple-mobile-web-app-title";
    name.content = title;
    document.head.appendChild(name);
    return () => {
      link.setAttribute("href", before);
      name.remove();
    };
  }, [token, title]);
}

interface InstallPrompt extends Event {
  prompt(): Promise<unknown>;
}

declare global {
  interface Window {
    /** Chrome's offer to install, kept by the page's first script until the person asks for it. */
    wizardInstall?: InstallPrompt | null;
  }
}

/** "Add to home screen", where the browser offers it; on an iPhone the way through the share menu. */
function InstallHint() {
  const [prompt, setPrompt] = useState(() => window.wizardInstall ?? null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const update = () => setPrompt(window.wizardInstall ?? null);
    window.addEventListener("wizard-install", update);
    return () => window.removeEventListener("wizard-install", update);
  }, []);
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as { standalone?: boolean }).standalone === true;
  // iPadOS calls itself a Mac; its touch screen gives it away.
  const ios =
    /iPhone|iPad|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  if (standalone || (!prompt && !ios)) {
    return null;
  }
  return (
    <div className="mt-6 flex flex-col items-center gap-2 text-[13px] text-ink-3">
      <button
        type="button"
        onClick={() => {
          if (prompt) {
            void prompt.prompt();
            window.wizardInstall = null;
            setPrompt(null);
          } else {
            setShown((s) => !s);
          }
        }}
        className="inline-flex items-center gap-1.5 underline-offset-4 hover:text-ink hover:underline coarse:min-h-11"
      >
        <SquarePlus className="size-4" /> {t("install.add")}
      </button>
      {shown ? <p className="max-w-xs leading-relaxed">{t("install.ios")}</p> : null}
    </div>
  );
}

export function BrandHeader({ brand, toggle = true }: { brand: BrandView; toggle?: boolean }) {
  return (
    <header className="safe-top">
      <div className="relative flex h-14 items-center justify-center px-5">
        {brand.logoUrl ? (
          <img
            src={withBase(brand.logoUrl)}
            alt={brand.name}
            className="h-7 max-w-[160px] object-contain"
          />
        ) : brand.name ? (
          <span className="max-w-[60%] truncate font-display font-semibold text-[15px] text-ink-2 tracking-tight">
            {brand.name}
          </span>
        ) : null}
        {toggle ? (
          <div className="absolute right-3">
            <ThemeToggle />
          </div>
        ) : null}
      </div>
    </header>
  );
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        el: HTMLElement,
        opts: { sitekey: string; callback: (token: string) => void; appearance?: string },
      ) => string;
    };
  }
}

function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (t: string) => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const mount = () => {
      if (ref.current && window.turnstile && !ref.current.childElementCount) {
        window.turnstile.render(ref.current, {
          sitekey: siteKey,
          callback: onToken,
          appearance: "interaction-only",
        });
      }
    };
    if (window.turnstile) {
      mount();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js";
    script.async = true;
    script.onload = mount;
    document.head.appendChild(script);
  }, [siteKey, onToken]);
  return <div ref={ref} className="mt-4 flex justify-center" />;
}

/**
 * On a phone's browser: open the wizard in the mobile app instead. The phone's camera already
 * opens engenty.ai links there; this is for a runtime on another host, whose links it does not know.
 */
function OpenInApp({ token }: { token: string }) {
  const phone = /iPhone|iPad|iPod|Android/.test(navigator.userAgent);
  if (!phone || IN_APP || EMBED) {
    return null;
  }
  return (
    <a
      href={appLink(`${window.location.origin}${BASE}/w/${token}`)}
      className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-ink-3 underline-offset-4 hover:text-ink hover:underline coarse:min-h-11"
    >
      <Smartphone className="size-4" /> {t("install.app")}
    </a>
  );
}

const lastRunKey = (token: string) => `wz.run.${token}`;

/** The app opens `/w/<token>?app=1&start=1` from its own start button: the run starts at once. */
const AUTOSTART = IN_APP && new URLSearchParams(window.location.search).get("start") === "1";

/** Inline in another website the wizard is as tall as its content; everywhere else it fills the screen. */
const PAGE = EMBED === "inline" ? "min-h-80" : "min-h-dvh";

function StartScreen({ wizard }: { wizard: PublicWizard }) {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [captcha, setCaptcha] = useState<string | null>(null);
  const previous = (() => {
    try {
      return localStorage.getItem(lastRunKey(wizard.token));
    } catch {
      return null;
    }
  })();
  const start = async () => {
    setBusy(true);
    setError(null);
    try {
      const { runId } = await api.post<{ runId: string }>(
        `/api/public/wizards/${wizard.token}/runs`,
        {
          turnstileToken: captcha ?? undefined,
          embedded: EMBED !== null,
        },
      );
      try {
        localStorage.setItem(lastRunKey(wizard.token), runId);
      } catch {
        // resuming is a convenience
      }
      navigate(`/w/${wizard.token}/${runId}`, { replace: AUTOSTART });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  const auto = AUTOSTART && wizard.available && !wizard.turnstileSiteKey;
  const started = useRef(false);
  // biome-ignore lint/correctness/useExhaustiveDependencies: once, on the app's start button
  useEffect(() => {
    if (auto && !started.current) {
      started.current = true;
      void start();
    }
  }, [auto]);
  if (auto && !error) {
    return (
      <div className="flex min-h-[60dvh] items-center justify-center text-ink-4">
        <Spinner />
      </div>
    );
  }
  return (
    <div className="mx-auto flex max-w-lg animate-rise flex-col items-center px-6 pt-6 pb-12 text-center sm:pt-16 sm:pb-16">
      <Mascot kind={wizard.avatar} size={190} fluffy />
      <h1 className="mt-2 text-balance font-display font-semibold text-[30px] leading-[1.1] tracking-tight sm:text-[34px]">
        {wizard.title}
      </h1>
      {wizard.description ? (
        <p className="mt-3 text-[16px] text-ink-2 leading-relaxed">{wizard.description}</p>
      ) : null}
      {wizard.available ? (
        <>
          <Button
            size="lg"
            className="mt-10 min-w-48"
            busy={busy}
            disabled={Boolean(wizard.turnstileSiteKey) && !captcha}
            onClick={start}
          >
            {t("run.start")} <ArrowRight className="size-4" />
          </Button>
          {wizard.turnstileSiteKey ? (
            <Turnstile siteKey={wizard.turnstileSiteKey} onToken={setCaptcha} />
          ) : null}
          {previous ? (
            <button
              type="button"
              onClick={() => navigate(`/w/${wizard.token}/${previous}`)}
              className="mt-4 text-[14px] text-ink-3 underline-offset-4 hover:text-ink hover:underline coarse:min-h-11"
            >
              {t("run.resume")}
            </button>
          ) : null}
          {EMBED || IN_APP ? null : <InstallHint />}
          <OpenInApp token={wizard.token} />
        </>
      ) : (
        <p className="mt-10 rounded-xl bg-paper-2 px-5 py-4 text-[15px] text-ink-2">
          {wizard.unavailableReason ?? t("run.unavailable")}
        </p>
      )}
      {error ? <p className="mt-4 text-[14px] text-rose">{error}</p> : null}
    </div>
  );
}

export function PublicRunner() {
  const { token, runId } = useParams();
  const navigate = useNavigate();
  const wizard = useQuery({
    queryKey: ["public", token],
    queryFn: () => api.get<PublicWizard>(`/api/public/wizards/${token}`),
    // A wizard that is gone stays gone; a phone without signal gets a few more tries.
    retry: (count, err) => isOffline(err) && count < 3,
  });
  useBrandAccent(wizard.data?.brand.accent);
  useStage(wizard.data?.avatar);
  useWizardApp(token, wizard.data?.title);
  useEmbed();
  useEffect(() => {
    if (wizard.data) {
      document.title = wizard.data.title;
    }
  }, [wizard.data]);
  // The app keeps every run it saw in its results, also one started or resumed in here.
  useEffect(() => {
    if (token && runId) {
      appTell("run", { token, runId });
    }
  }, [token, runId]);

  if (wizard.isLoading) {
    return (
      <div className={cn("flex items-center justify-center text-ink-4", PAGE)}>
        <Spinner />
      </div>
    );
  }
  if (!wizard.data) {
    const offline = isOffline(wizard.error);
    return (
      <div className={cn("flex flex-col items-center justify-center gap-4 px-6 text-center", PAGE)}>
        <Mascot kind="pebble" size={80} />
        <p className="max-w-xs text-ink-3">{t(offline ? "common.offline" : "run.notFound")}</p>
        {offline ? (
          <Button variant="secondary" onClick={() => void wizard.refetch()}>
            {t("common.retry")}
          </Button>
        ) : null}
      </div>
    );
  }
  return (
    <div className={cn("flex flex-col", PAGE)}>
      {/* The website around an inline wizard carries the brand; in the window its close button takes the corner. */}
      {/* In the app its own top bar names the wizard. */}
      {EMBED === "inline" || IN_APP ? null : (
        <BrandHeader brand={wizard.data.brand} toggle={!EMBED} />
      )}
      <div className="flex-1">
        {runId ? (
          <RunnerBody runId={runId} onRestart={() => navigate(`/w/${token}`)} />
        ) : (
          <StartScreen wizard={wizard.data} />
        )}
      </div>
      {IN_APP ? (
        <div className="safe-bottom" />
      ) : (
        <footer className="safe-bottom pt-6 text-center text-[12px] text-ink-4">
          <a
            href={`${BASE}/`}
            // In a frame the link would load the studio into the website.
            target={EMBED ? "_blank" : undefined}
            rel="noreferrer"
            className="inline-block py-3.5 hover:text-ink-2"
          >
            {t("run.madeWith").replace("engenty wizards", BRAND.name)}
          </a>
        </footer>
      )}
    </div>
  );
}
