import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { lazy, Suspense, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";

const ChangelogDialog = lazy(() =>
  import("./ChangelogDialog").then((m) => ({ default: m.ChangelogDialog })),
);
const CreditsDialog = lazy(() =>
  import("./CreditsDialog").then((m) => ({ default: m.CreditsDialog })),
);

/** The release this app is: the version of the root package.json. */
export const APP_VERSION = import.meta.env.VITE_APP_VERSION;

interface UpdateStatus {
  latest: string | null;
  newer: boolean;
  url: string | null;
  canApply: boolean;
  applying: "idle" | "running" | "done" | "failed";
}

/**
 * A newer release is out. A runtime that runs alone can install it from here; one that cannot
 * (npm, a checkout) links to the release.
 */
function UpdateNotice() {
  const qc = useQueryClient();
  const status = useQuery({
    queryKey: ["update"],
    queryFn: () => api.get<UpdateStatus>("/api/studio/update"),
    // The runtime asks GitHub at most every few hours; the page asks it once an hour.
    staleTime: 60 * 60_000,
    retry: false,
    refetchInterval: (query) => (query.state.data?.applying === "running" ? 2000 : false),
  });
  const apply = useMutation({
    mutationFn: () => api.post<UpdateStatus>("/api/studio/update"),
    onSuccess: (next) => qc.setQueryData(["update"], next),
  });
  const data = status.data;
  if (!data?.newer || !data.latest) {
    return null;
  }
  const v = data.latest;
  if (data.applying === "running") {
    return <span className="text-ink-2">{t("about.update.running")}</span>;
  }
  if (data.applying === "done") {
    return <span className="text-ink-2">{t("about.update.done", { v })}</span>;
  }
  if (data.applying === "failed") {
    return <span className="text-ember-strong">{t("about.update.failed")}</span>;
  }
  return (
    <span className="flex items-center gap-2 text-ink-2">
      {t("about.update.available", { v })}
      {data.canApply ? (
        <button
          type="button"
          className="underline transition hover:text-ink"
          disabled={apply.isPending}
          onClick={() => apply.mutate()}
        >
          {t("about.update.install")}
        </button>
      ) : data.url ? (
        <a
          href={data.url}
          target="_blank"
          rel="noreferrer"
          className="underline transition hover:text-ink"
        >
          {t("about.update.release")}
        </a>
      ) : null}
    </span>
  );
}

/**
 * The app's version and the two things about it — its changelog and its open-source credits —
 * as inline links that open a dialog each. Sits wherever a line of quiet links is.
 */
export function AboutLinks() {
  const [dialog, setDialog] = useState<"changelog" | "credits" | null>(null);
  const link = "transition hover:text-ink-2";
  return (
    <>
      <span className="tabular-nums">{t("about.version", { v: APP_VERSION })}</span>
      <UpdateNotice />
      <button type="button" className={link} onClick={() => setDialog("changelog")}>
        {t("about.changelog")}
      </button>
      <button type="button" className={link} onClick={() => setDialog("credits")}>
        {t("about.credits")}
      </button>
      {dialog ? (
        <Suspense fallback={null}>
          {dialog === "changelog" ? (
            <ChangelogDialog open onClose={() => setDialog(null)} />
          ) : (
            <CreditsDialog open onClose={() => setDialog(null)} />
          )}
        </Suspense>
      ) : null}
    </>
  );
}
