import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api";
import { t } from "../../lib/i18n";
import type { WizardDetail } from "../../lib/session";
import { Button, Dialog, Input, Switch } from "../../ui";

export function ShareDialog({
  wizard,
  open,
  onClose,
}: {
  wizard: WizardDetail;
  open: boolean;
  onClose: () => void;
}) {
  const qc = useQueryClient();
  const [copied, setCopied] = useState(false);
  const [limit, setLimit] = useState(String(wizard.dailyRunLimit));
  const refresh = () => qc.invalidateQueries({ queryKey: ["wizard", wizard.id] });
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/api/studio/wizards/${wizard.id}`, body),
    onSuccess: refresh,
  });
  const rotate = useMutation({
    mutationFn: () => api.post(`/api/studio/wizards/${wizard.id}/rotate-link`),
    onSuccess: refresh,
  });
  const url = `${window.location.origin}/r/${wizard.shareToken}`;
  return (
    <Dialog open={open} onClose={onClose} title={t("share.title")}>
      {!wizard.published ? (
        <p className="mb-4 rounded-lg bg-amber-tint px-3 py-2 text-[14px]">
          {t("share.publishFirst")}
        </p>
      ) : null}
      <div className="flex gap-2">
        <Input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="font-mono text-[13px]"
        />
        <Button
          variant="secondary"
          onClick={() => {
            void navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
          {copied ? t("share.copied") : t("share.copy")}
        </Button>
      </div>
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="mt-2 inline-flex items-center gap-1.5 text-[13px] text-ink-3 hover:text-ink"
      >
        <ExternalLink className="size-3.5" /> {t("share.open")}
      </a>
      <div className="mt-6 flex flex-col gap-5 border-border-soft border-t pt-5">
        <div className="flex items-center justify-between">
          <span className="text-[14px]">{t("share.enabled")}</span>
          <Switch
            checked={wizard.shareEnabled}
            onChange={(v) => patch.mutate({ shareEnabled: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="whitespace-nowrap text-[14px]">{t("share.limit")}</span>
          <div className="w-24">
            <Input
              inputMode="numeric"
              className="text-right"
              value={limit}
              onChange={(e) => setLimit(e.target.value.replace(/\D/g, ""))}
              onBlur={() => {
                const n = Number(limit);
                if (n >= 1 && n !== wizard.dailyRunLimit) {
                  patch.mutate({ dailyRunLimit: n });
                }
              }}
            />
          </div>
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="text-[13px] text-ink-3">{t("share.rotateHint")}</span>
          <Button variant="ghost" size="sm" busy={rotate.isPending} onClick={() => rotate.mutate()}>
            <RefreshCw className="size-3.5" /> {t("share.rotate")}
          </Button>
        </div>
      </div>
    </Dialog>
  );
}
