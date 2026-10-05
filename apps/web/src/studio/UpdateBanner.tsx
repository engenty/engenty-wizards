import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Download, X } from "lucide-react";
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { Button, IconButton, Spinner } from "../ui";

interface UpdateStatus {
  current: string;
  latest: string | null;
  newer: boolean;
  url: string | null;
  canApply: boolean;
  restarts: boolean;
  applying: "idle" | "running" | "done" | "failed";
}

const DISMISSED_KEY = "wizards.update-banner";

function dismissedFor(): string | null {
  try {
    return localStorage.getItem(DISMISSED_KEY);
  } catch {
    return null;
  }
}

/**
 * A newer release is out. A runtime installed by install.sh installs it from here and starts
 * the new version; the page waits for it and loads again. One that cannot (npm, a checkout)
 * links to the release. Closing it hides this release; the next one shows again.
 */
export function UpdateBanner() {
  const qc = useQueryClient();
  const [closed, setClosed] = useState(dismissedFor);
  const [waiting, setWaiting] = useState<string | null>(null);
  const status = useQuery({
    queryKey: ["update"],
    queryFn: () => api.get<UpdateStatus>("/api/studio/update"),
    // The runtime asks GitHub at most every few hours; the page asks it once an hour.
    staleTime: 60 * 60_000,
    refetchInterval: 60 * 60_000,
    retry: false,
  });
  const apply = useMutation({
    mutationFn: () => api.post<UpdateStatus>("/api/studio/update"),
    onSuccess: (next) => qc.setQueryData(["update"], next),
  });
  const data = status.data;
  const latest = data?.latest ?? null;
  const restarting = data?.restarts && (data.applying === "running" || data.applying === "done");

  const from = data?.current;
  // While it installs and restarts, ask until another version answers, then load it.
  useEffect(() => {
    if (!(restarting || data?.applying === "running") || !latest) {
      return;
    }
    const timer = setInterval(async () => {
      try {
        const next = await api.get<UpdateStatus>("/api/studio/update");
        if (next.current !== from) {
          window.location.reload();
          return;
        }
        qc.setQueryData(["update"], next);
        if (next.applying === "done" && next.restarts) {
          setWaiting(latest);
        }
      } catch {
        // Down between the old version and the new one.
        setWaiting(latest);
      }
    }, 2000);
    return () => clearInterval(timer);
  }, [restarting, data?.applying, latest, from, qc]);

  if (!(data?.newer && latest) || (closed === latest && data.applying === "idle")) {
    return null;
  }
  const close = () => {
    try {
      localStorage.setItem(DISMISSED_KEY, latest);
    } catch {
      // Private window: it shows again next time.
    }
    setClosed(latest);
  };
  const busy = data.applying === "running" || waiting !== null;
  const line =
    waiting !== null
      ? t("about.update.restarting", { v: latest })
      : data.applying === "running"
        ? t("about.update.installing", { v: latest })
        : data.applying === "done"
          ? t("about.update.done", { v: latest })
          : data.applying === "failed"
            ? t("about.update.failed")
            : t("about.update.available", { v: latest });
  return (
    <div className="flex items-center gap-3 border-border-soft border-b bg-ember-tint px-4 py-2 text-[13px] text-ink-2 sm:px-6">
      {busy ? (
        <Spinner className="size-4 shrink-0 text-ember-strong" />
      ) : (
        <Download className="size-4 shrink-0 text-ember-strong" />
      )}
      <p className="min-w-0 flex-1">{line}</p>
      {data.url && !busy ? (
        <a
          href={data.url}
          target="_blank"
          rel="noreferrer"
          className="shrink-0 underline transition hover:text-ink"
        >
          {t("about.update.notes")}
        </a>
      ) : null}
      {data.canApply && (data.applying === "idle" || data.applying === "failed") ? (
        <Button size="sm" disabled={apply.isPending} onClick={() => apply.mutate()}>
          {t("about.update.install")}
        </Button>
      ) : null}
      {busy ? null : (
        <IconButton label={t("install.app.close")} onClick={close} className="size-8">
          <X className="size-4" />
        </IconButton>
      )}
    </div>
  );
}
