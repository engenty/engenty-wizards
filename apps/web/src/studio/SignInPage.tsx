import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Mascot } from "../brand";
import { EngentyWordmark } from "../engenty/logo";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { signIn } from "../lib/session";
import { Button } from "../ui";

/**
 * The studio's front door. A runtime of a Manage-App sends the person there to sign in (or to
 * create an account); a runtime that runs alone is entered through the link it printed at start.
 * Where the dev login is the only way in, there is nothing to choose: the door opens by itself.
 */
export function SignInPage() {
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<{ mode: "managed" | "local"; devLogin: boolean }>("/api/config"),
  });
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [waiting, setWaiting] = useState(false);
  const failed = new URLSearchParams(window.location.search).get("signin") === "failed";
  const auto = config.data?.mode === "local" && config.data.devLogin;
  const [autoFailed, setAutoFailed] = useState(false);

  useEffect(() => {
    if (!auto || autoFailed) {
      return;
    }
    let alive = true;
    api
      .post("/api/dev/login")
      .then(() => qc.invalidateQueries())
      .catch(() => {
        if (alive) {
          setAutoFailed(true);
        }
      });
    return () => {
      alive = false;
    };
  }, [auto, autoFailed, qc]);

  // Nothing to decide yet, or nothing to decide at all: the engenty alone, until the studio is there.
  if (config.isLoading || (auto && !autoFailed)) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <Mascot kind="round" size={56} />
      </div>
    );
  }

  return (
    <div className="flex min-h-dvh flex-col items-center justify-center px-6 py-16">
      <div className="flex w-full max-w-sm animate-rise flex-col items-center text-center">
        <Mascot kind="round" size={200} fluffy />
        <EngentyWordmark className="mt-2 font-display font-semibold text-[15px] text-ink-3 tracking-tight" />
        <h1 className="mt-3 font-display font-semibold text-[34px] leading-[1.1] tracking-tight">
          {t("brand.tagline")}
        </h1>
        <p className="mt-4 text-[16px] text-ink-2 leading-relaxed">{t("brand.sub")}</p>
        <div className="mt-10 flex w-full flex-col gap-3">
          {failed ? <p className="text-[14px] text-rose">{t("auth.failed")}</p> : null}
          {config.data?.mode === "managed" ? (
            <Button
              size="lg"
              busy={busy}
              className="w-full"
              onClick={async () => {
                setBusy(true);
                const desktop = (window as { engentyDesktop?: { open(url: string): void } })
                  .engentyDesktop;
                if (!desktop) {
                  signIn("/");
                  return;
                }
                // In the desktop app the sign-in runs in the person's own browser and comes
                // back to this window as a link.
                const { url } = await api.post<{ url: string }>("/api/auth/desktop/start");
                desktop.open(url);
                setWaiting(true);
                setBusy(false);
              }}
            >
              {waiting ? t("local.accountWaiting") : t("auth.signIn")}
            </Button>
          ) : null}
          {config.data?.devLogin ? (
            <Button
              size="lg"
              busy={busy}
              className="w-full"
              onClick={async () => {
                setBusy(true);
                await api.post("/api/dev/login");
                await qc.invalidateQueries();
                setBusy(false);
              }}
            >
              {t("auth.dev")}
            </Button>
          ) : null}
          {config.data?.mode === "local" && !config.data.devLogin ? (
            <p className="text-[14px] text-ink-3">{t("auth.localLink")}</p>
          ) : null}
        </div>
        {config.data?.mode === "managed" ? (
          <p className="mt-6 text-[13px] text-ink-3">{t("auth.legal")}</p>
        ) : null}
      </div>
    </div>
  );
}
