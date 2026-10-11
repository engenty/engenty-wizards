import { ChevronRight, Download, ExternalLink, RefreshCw } from "lucide-react";
import { useEffect, useState } from "react";
import { EngentyLogoMark } from "../engenty/logo";
import { t } from "../lib/i18n";
import type { Me } from "../lib/session";
import { useUpdate } from "../lib/update";
import { stepClass, useStepDirection } from "../studio/settings-menu";
import { Button, cn, Dialog, Segmented, Spinner } from "../ui";
import { APP_VERSION } from "./AboutLinks";
import {
  type ChangelogRelease,
  loadReleases,
  ReleaseNotes,
  releaseDate,
  releaseLabel,
} from "./ChangelogDialog";
import { Credits } from "./CreditsDialog";

type Tab = "new" | "earlier" | "credits";
const TABS: Tab[] = ["new", "earlier", "credits"];
const label = (tab: Tab) =>
  tab === "new" ? t("about.tab.new") : tab === "earlier" ? t("about.history") : t("about.credits");

/** `1 Änderung`, `12 Änderungen`. */
const changes = (n: number) => (n === 1 ? t("about.change") : t("about.changes", { n }));

/**
 * Behind the mark in the app bar: which release this is and how it got here; on a runtime that
 * runs alone, whether a newer one is out — checked now on a word, installed from here where it
 * can be — then three tabs: what is new in the newest release known, the earlier releases (each
 * unfolding to its changes), and the credits.
 */
export function AboutDialog({ open, onClose, me }: { open: boolean; onClose: () => void; me: Me }) {
  const local = me.mode === "local";
  const { status, data, latest, check, apply, busy, progress } = useUpdate(local && open);
  const [releases, setReleases] = useState<ChangelogRelease[] | null>(null);
  const [tab, setTab] = useState<Tab>("new");
  const step = useStepDirection(TABS.indexOf(tab));
  // The notes of the newest release known: the newer one from GitHub, else this build's own.
  const shown = data?.newer && latest ? latest : APP_VERSION;
  useEffect(() => {
    if (!open) {
      return;
    }
    let cancelled = false;
    setReleases(null);
    void loadReleases(shown === APP_VERSION ? undefined : shown).then((next) => {
      if (!cancelled) {
        setReleases(next);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [open, shown]);
  const newest = releases?.find((r) => r.version === `v${shown}`) ?? releases?.[0] ?? null;
  const earlier = releases?.filter((r) => r !== newest) ?? [];
  const kind = local ? (data?.kind ?? null) : "cloud";
  const checkedAt = data?.checkedAt
    ? new Date(data.checkedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })
    : null;
  return (
    <Dialog open={open} onClose={onClose} title={t("about.title")} wide height="tall">
      <div className="flex items-center gap-4">
        <EngentyLogoMark size={56} />
        <div className="min-w-0">
          <div className="font-display font-semibold text-[1.125rem] tracking-tight">
            engenty<span className="text-ember">.</span>
            <span className="ml-1 font-normal text-ink-3">wizards</span>
          </div>
          <div className="text-[0.875rem] text-ink-3 tabular-nums">
            {t("about.version", { v: APP_VERSION })}
            {kind ? ` · ${t(`about.kind.${kind}`)}` : ""}
          </div>
        </div>
      </div>

      {local ? (
        <div className="mt-5 flex flex-col gap-3 rounded-xl bg-paper-2 p-4 text-[0.875rem] text-ink-2">
          {status.isPending || check.isPending ? (
            <div className="flex items-center gap-2.5">
              <Spinner className="size-4 text-ember-strong" />
              {t("about.update.checking")}
            </div>
          ) : progress ? (
            <div className="flex items-center gap-2.5">
              {busy ? <Spinner className="size-4 text-ember-strong" /> : null}
              {progress}
            </div>
          ) : data?.newer && latest ? (
            <>
              <div className="flex items-center gap-2.5 font-medium text-ink">
                <Download className="size-4 shrink-0 text-ember-strong" />
                {t("about.update.available", { v: latest })}
              </div>
              {data.canApply ? null : <p className="text-ink-3">{t("about.update.manual")}</p>}
            </>
          ) : !data?.enabled ? (
            <p>{t("about.update.off")}</p>
          ) : data.latest === null ? (
            <p>{t("about.update.unknown")}</p>
          ) : (
            <p>
              {t("about.update.upToDate")}
              {checkedAt ? (
                <span className="text-ink-4">
                  {" "}
                  · {t("about.update.checkedAt", { when: checkedAt })}
                </span>
              ) : null}
            </p>
          )}
          {busy || status.isPending ? null : (
            <div className="flex flex-wrap gap-2">
              {data?.newer && data.canApply && data.applying !== "running" ? (
                <Button size="sm" disabled={apply.isPending} onClick={() => apply.mutate()}>
                  <Download className="size-4" /> {t("about.update.install")}
                </Button>
              ) : null}
              {data?.newer && data.url ? (
                <Button
                  size="sm"
                  variant="secondary"
                  onClick={() => window.open(data.url ?? "", "_blank")}
                >
                  {t("about.update.release")} <ExternalLink className="size-4" />
                </Button>
              ) : null}
              {data?.enabled === false ? null : (
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={check.isPending}
                  onClick={() => check.mutate()}
                >
                  <RefreshCw className={cn("size-4", check.isPending && "animate-spin")} />{" "}
                  {t("about.update.check")}
                </Button>
              )}
            </div>
          )}
        </div>
      ) : null}

      {/* One of the three at a time, sliding in from the side it stands on. */}
      <div className="mt-6">
        <Segmented
          value={label(tab)}
          options={TABS.map(label)}
          onChange={(picked: string) => setTab(TABS.find((x) => label(x) === picked) ?? "new")}
        />
      </div>
      <div key={tab} className={cn("mt-5", stepClass(step))}>
        {tab === "new" ? (
          releases === null ? (
            <div className="flex justify-center py-6 text-ink-3">
              <Spinner />
            </div>
          ) : newest ? (
            <>
              <h3 className="flex items-baseline gap-3 border-border-soft border-b pb-2 font-display font-semibold text-[1rem]">
                {releaseLabel(newest)}
                <span className="font-normal font-sans text-[0.8125rem] text-ink-3 tabular-nums">
                  {releaseDate(newest)}
                </span>
              </h3>
              <div className="mt-3">
                <ReleaseNotes release={newest} />
              </div>
            </>
          ) : (
            <p className="text-[0.875rem] text-ink-3">{t("about.changelogEmpty")}</p>
          )
        ) : null}
        {tab === "earlier" ? (
          <div className="flex flex-col divide-y divide-border-soft">
            {earlier.map((release) => (
              <details key={release.version ?? "unreleased"} className="group/r py-2">
                <summary className="flex cursor-pointer list-none items-baseline gap-3 text-[0.875rem] [&::-webkit-details-marker]:hidden">
                  <ChevronRight className="size-3.5 shrink-0 self-center text-ink-4 transition group-open/r:rotate-90" />
                  <span className="font-medium text-ink tabular-nums">{releaseLabel(release)}</span>
                  <span className="text-[0.8125rem] text-ink-3 tabular-nums">
                    {releaseDate(release)}
                  </span>
                  <span className="ml-auto text-[0.8125rem] text-ink-4">
                    {changes(release.commits.length)}
                  </span>
                </summary>
                <div className="mt-2 pl-6">
                  <ReleaseNotes release={release} />
                </div>
              </details>
            ))}
          </div>
        ) : null}
        {tab === "credits" ? <Credits active /> : null}
      </div>
    </Dialog>
  );
}
