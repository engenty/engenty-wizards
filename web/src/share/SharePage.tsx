import type { ShareView } from "@shared/run";
import { useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useEffect } from "react";
import { useParams } from "react-router";
import { BRAND, Mascot } from "../brand";
import { api } from "../lib/api";
import { lang, t } from "../lib/i18n";
import { useStage } from "../lib/theme";
import { DownloadButtons, OutputView } from "../runner/outputs";
import { BrandHeader, useBrandAccent } from "../runner/PublicRunner";
import { Card, Spinner } from "../ui";

/** A shared result, read-only: the deliverables, their downloads, and a way to make your own. */
export function SharePage() {
  const { token } = useParams();
  const share = useQuery({
    queryKey: ["share", token],
    queryFn: () => api.get<ShareView>(`/api/shares/${token}`),
    retry: false,
  });
  useBrandAccent(share.data?.brand.accent);
  useStage(share.data?.wizard.avatar);
  useEffect(() => {
    if (share.data) {
      document.title = `${share.data.title} · ${share.data.wizard.title}`;
    }
  }, [share.data]);

  if (share.isLoading) {
    return (
      <div className="flex min-h-dvh items-center justify-center text-ink-4">
        <Spinner />
      </div>
    );
  }
  const view = share.data;
  if (!view) {
    return (
      <div className="flex min-h-dvh flex-col items-center justify-center gap-4 px-6 text-center">
        <Mascot kind="pebble" size={80} />
        <p className="max-w-sm text-ink-3">{t("sharePage.gone")}</p>
      </div>
    );
  }
  const base = `/api/shares/${view.token}`;
  const date = (iso: string) =>
    new Intl.DateTimeFormat(lang, { dateStyle: "long" }).format(new Date(iso));
  return (
    <div className="flex min-h-dvh flex-col">
      <BrandHeader brand={view.brand} />
      <main className="mx-auto w-full max-w-3xl flex-1 animate-rise px-4 pt-6 pb-12 sm:px-6">
        <div className="mb-8 flex flex-wrap items-center gap-4">
          <Mascot kind={view.wizard.avatar} size={64} />
          <div className="min-w-0 flex-1">
            <p className="text-[13px] text-ink-4">
              {view.expiresAt
                ? t("sharePage.until", { date: date(view.expiresAt) })
                : t("sharePage.shared", { date: date(view.createdAt) })}
            </p>
            <h1 className="font-display font-semibold text-[28px] leading-tight tracking-tight sm:text-[32px]">
              {view.title}
            </h1>
            {view.message ? <p className="mt-1 text-[15px] text-ink-3">{view.message}</p> : null}
          </div>
        </div>
        <div className="flex flex-col gap-6">
          {view.shown.map(({ step, output, formats, label }) => (
            <Card key={step.id} className="p-4 sm:p-5">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display font-semibold text-[17px]">{label ?? step.title}</h2>
                <DownloadButtons base={base} stepId={step.id} formats={formats} />
              </div>
              <OutputView base={base} step={step} output={output} />
            </Card>
          ))}
        </div>
        {view.wizardUrl ? (
          <a
            href={view.wizardUrl}
            className="mt-10 flex items-center gap-4 rounded-2xl bg-card p-5 shadow-soft ring-1 ring-border-soft transition hover:shadow-elevated"
          >
            <Mascot kind={view.wizard.avatar} size={44} interactive={false} />
            <div className="min-w-0 flex-1">
              <div className="font-display font-semibold text-[16px]">{view.wizard.title}</div>
              {view.wizard.description ? (
                <div className="truncate text-[14px] text-ink-3">{view.wizard.description}</div>
              ) : null}
            </div>
            <span className="inline-flex items-center gap-1.5 font-medium text-[14px] text-ember-strong">
              {t("sharePage.own")} <ArrowRight className="size-4" />
            </span>
          </a>
        ) : null}
      </main>
      <footer className="py-6 text-center text-[12px] text-ink-4">
        <a href="/" className="hover:text-ink-2">
          {t("run.madeWith").replace("engenty wizards", BRAND.name)}
        </a>
      </footer>
    </div>
  );
}
