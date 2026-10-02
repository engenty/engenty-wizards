import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Mascot } from "../brand";
import { EngentyWordmark } from "../engenty/logo";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { signInSocial } from "../lib/session";
import { Button } from "../ui";

const PROVIDER_LABEL: Record<string, string> = {
  google: "Google",
  github: "GitHub",
  microsoft: "Microsoft",
};

function ProviderIcon({ id }: { id: string }) {
  if (id === "google") {
    return (
      <svg viewBox="0 0 24 24" className="size-[18px]">
        <path
          fill="#4285F4"
          d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.5h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.8z"
        />
        <path
          fill="#34A853"
          d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24z"
        />
        <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6h-4a12 12 0 0 0 0 10.8l4-3.1z" />
        <path
          fill="#EA4335"
          d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9z"
        />
      </svg>
    );
  }
  if (id === "github") {
    return (
      <svg viewBox="0 0 24 24" className="size-[18px]" fill="currentColor">
        <path d="M12 .5a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 .1-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.3.5-2.4 1.2-3.2-.1-.3-.5-1.5.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0C17.3 4.7 18.3 5 18.3 5c.7 1.7.2 2.9.1 3.2.8.8 1.2 1.9 1.2 3.2 0 4.6-2.8 5.6-5.5 5.9.4.4.8 1.1.8 2.2v3.3c0 .3.2.7.8.6A12 12 0 0 0 12 .5z" />
      </svg>
    );
  }
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]">
      <path fill="#F25022" d="M1 1h10.5v10.5H1z" />
      <path fill="#7FBA00" d="M12.5 1H23v10.5H12.5z" />
      <path fill="#00A4EF" d="M1 12.5h10.5V23H1z" />
      <path fill="#FFB900" d="M12.5 12.5H23V23H12.5z" />
    </svg>
  );
}

export function SignInPage() {
  const config = useQuery({
    queryKey: ["config"],
    queryFn: () => api.get<{ devLogin: boolean; providers: string[] }>("/api/config"),
  });
  const qc = useQueryClient();
  const [busy, setBusy] = useState<string | null>(null);
  const providers = config.data?.providers ?? [];

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
          {providers.map((p) => (
            <Button
              key={p}
              variant="secondary"
              size="lg"
              busy={busy === p}
              className="w-full"
              onClick={async () => {
                setBusy(p);
                await signInSocial(p).finally(() => setBusy(null));
              }}
            >
              <ProviderIcon id={p} />
              {t("auth.continueWith", { provider: PROVIDER_LABEL[p] ?? p })}
            </Button>
          ))}
          {config.data?.devLogin ? (
            <Button
              variant={providers.length ? "ghost" : "primary"}
              size="lg"
              busy={busy === "dev"}
              className="w-full"
              onClick={async () => {
                setBusy("dev");
                await api.post("/api/dev/login");
                await qc.invalidateQueries();
                setBusy(null);
              }}
            >
              {t("auth.dev")}
            </Button>
          ) : null}
          {config.data && !providers.length && !config.data.devLogin ? (
            <p className="text-[14px] text-ink-3">{t("auth.none")}</p>
          ) : null}
        </div>
        <p className="mt-6 text-[13px] text-ink-3">{t("auth.legal")}</p>
      </div>
    </div>
  );
}
