import { useMutation } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useSearchParams } from "react-router";
import { api } from "../lib/api";
import { lang, t } from "../lib/i18n";
import { useMe } from "../lib/session";
import { Button, Card, Chip } from "../ui";

export function BillingPage() {
  const me = useMe();
  const [params] = useSearchParams();
  const go = useMutation({
    mutationFn: ({ path, body }: { path: string; body?: unknown }) =>
      api.post<{ url: string }>(path, body),
    onSuccess: ({ url }) => {
      window.location.href = url;
    },
  });
  if (!me.data) {
    return null;
  }
  const b = me.data.billing;
  const resetAt = b.resetAt
    ? new Intl.DateTimeFormat(lang, { dateStyle: "long" }).format(new Date(b.resetAt))
    : "—";
  const pct = Math.min(100, Math.round((b.allowance / Math.max(1, b.monthly)) * 100));
  return (
    <div className="mx-auto max-w-2xl animate-rise">
      <h1 className="font-display font-semibold text-[28px] tracking-tight">
        {t("billing.title")}
      </h1>
      {params.get("ok") ? (
        <div className="mt-6 flex items-center gap-2 rounded-2xl bg-moss-tint px-4 py-3 text-[14px] text-moss">
          <Check className="size-4" /> Danke! Deine Zahlung ist eingegangen.
        </div>
      ) : null}
      <Card className="mt-8 p-6">
        <div className="flex items-center justify-between">
          <span className="text-[14px] text-ink-3">{t("billing.plan")}</span>
          <Chip tone={b.plan === "pro" ? "ember" : "neutral"}>
            {b.plan === "pro" ? t("billing.pro") : t("billing.free")}
          </Chip>
        </div>
        <div className="mt-6 flex items-baseline gap-2">
          <span className="font-display font-semibold text-[44px] tabular-nums tracking-tight">
            {b.credits.toLocaleString(lang)}
          </span>
          <span className="text-ink-3">{t("billing.credits")}</span>
        </div>
        <div className="mt-4 h-2 overflow-hidden rounded-full bg-paper-2">
          <div className="h-full rounded-full bg-ember" style={{ width: `${pct}%` }} />
        </div>
        <div className="mt-3 text-[13px] text-ink-3">
          {t("billing.monthly", { n: b.monthly.toLocaleString(lang), d: resetAt })}
        </div>
        {b.topup ? (
          <div className="text-[13px] text-ink-3">
            {t("billing.topup", { n: b.topup.toLocaleString(lang) })}
          </div>
        ) : null}
        <p className="mt-6 text-[13px] text-ink-4">{t("billing.explain")}</p>
      </Card>
      {me.data.billingEnabled ? (
        <div className="mt-6 flex flex-wrap gap-3">
          {b.plan !== "pro" ? (
            <Button
              size="lg"
              busy={go.isPending}
              onClick={() => go.mutate({ path: "/api/billing/checkout", body: { kind: "pro" } })}
            >
              {t("billing.upgrade")}
            </Button>
          ) : null}
          <Button
            variant="secondary"
            size="lg"
            busy={go.isPending}
            onClick={() => go.mutate({ path: "/api/billing/checkout", body: { kind: "topup" } })}
          >
            {t("billing.buy")}
          </Button>
          {b.hasCustomer ? (
            <Button
              variant="ghost"
              size="lg"
              onClick={() => go.mutate({ path: "/api/billing/portal" })}
            >
              {t("billing.manage")}
            </Button>
          ) : null}
        </div>
      ) : (
        <p className="mt-6 rounded-2xl bg-paper-2 px-4 py-3 text-[14px] text-ink-3">
          {t("billing.notConfigured")}
        </p>
      )}
      {go.error ? (
        <p className="mt-3 text-[14px] text-rose">{(go.error as Error).message}</p>
      ) : null}
    </div>
  );
}
