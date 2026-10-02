import type { BrandView, PublicWizard } from "@shared/run";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router";
import { BRAND, Mascot } from "../brand";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { Button, Spinner } from "../ui";
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

export function BrandHeader({ brand }: { brand: BrandView }) {
  return (
    <header className="flex h-14 items-center justify-center px-5">
      {brand.logoUrl ? (
        <img src={brand.logoUrl} alt={brand.name} className="h-7 max-w-[160px] object-contain" />
      ) : brand.name ? (
        <span className="font-display font-semibold text-[15px] text-ink-2 tracking-tight">
          {brand.name}
        </span>
      ) : null}
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

const lastRunKey = (token: string) => `wz.run.${token}`;

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
        },
      );
      try {
        localStorage.setItem(lastRunKey(wizard.token), runId);
      } catch {
        // resuming is a convenience
      }
      navigate(`/r/${wizard.token}/${runId}`);
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };
  return (
    <div className="mx-auto flex max-w-lg animate-rise flex-col items-center px-6 pt-10 pb-16 text-center sm:pt-16">
      <Mascot kind={wizard.avatar} size={190} fluffy />
      <h1 className="mt-2 font-display font-semibold text-[34px] leading-[1.1] tracking-tight">
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
              onClick={() => navigate(`/r/${wizard.token}/${previous}`)}
              className="mt-4 text-[14px] text-ink-3 underline-offset-4 hover:text-ink hover:underline"
            >
              {t("run.resume")}
            </button>
          ) : null}
        </>
      ) : (
        <p className="mt-10 rounded-2xl bg-paper-2 px-5 py-4 text-[15px] text-ink-2">
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
    retry: false,
  });
  useBrandAccent(wizard.data?.brand.accent);
  useEffect(() => {
    if (wizard.data) {
      document.title = wizard.data.title;
    }
  }, [wizard.data]);

  if (wizard.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-4">
        <Spinner />
      </div>
    );
  }
  if (!wizard.data) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <Mascot kind="pebble" size={80} />
        <p className="text-ink-3">{t("run.notFound")}</p>
      </div>
    );
  }
  return (
    <div className="flex min-h-dvh flex-col">
      <BrandHeader brand={wizard.data.brand} />
      <div className="flex-1">
        {runId ? (
          <RunnerBody runId={runId} onRestart={() => navigate(`/r/${token}`)} />
        ) : (
          <StartScreen wizard={wizard.data} />
        )}
      </div>
      <footer className="py-6 text-center text-[12px] text-ink-4">
        <a href="/" className="hover:text-ink-2">
          {t("run.madeWith").replace("engenty wizards", BRAND.name)}
        </a>
      </footer>
    </div>
  );
}
