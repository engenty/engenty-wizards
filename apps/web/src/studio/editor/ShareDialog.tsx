import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CloudUpload, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { BASE } from "@/lib/base";
import { ApiError, api } from "../../lib/api";
import { t } from "../../lib/i18n";
import { useMe, type WizardDetail } from "../../lib/session";
import { Button, Dialog, Input, Segmented, Switch } from "../../ui";
import { openExternal } from "../LocalRuntime";
import { useEstimate } from "./estimate";

interface CloudCopy {
  shareUrl: string;
  version: number;
  publishedAt: string;
}

const attr = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * The tag that shows the wizard behind `url` (…/w/<token>) in a website (`public/embed.js`):
 * in the page, or behind a button that opens it in a window.
 */
function EmbedSection({ url, title }: { url: string; title: string }) {
  const [modal, setModal] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, app, token] = url.match(/^(.*)\/w\/([^/]+)$/) ?? [];
  if (!token) {
    return null;
  }
  const button = modal ? ` data-mode="modal" data-label="${attr(title)}"` : "";
  const tag = `<script async src="${app}/embed.js" data-wizard="${token}"${button}></script>`;
  const modes = [t("embed.inline"), t("embed.modal")];
  return (
    <div className="mt-6 flex flex-col gap-3 border-border-soft border-t pt-5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[14px]">{t("embed.title")}</span>
        <Button
          variant="secondary"
          size="sm"
          onClick={() => {
            void navigator.clipboard.writeText(tag);
            setCopied(true);
            setTimeout(() => setCopied(false), 1500);
          }}
        >
          {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
          {copied ? t("share.copied") : t("share.copy")}
        </Button>
      </div>
      <p className="text-[13px] text-ink-3">{t(modal ? "embed.modalHint" : "embed.inlineHint")}</p>
      <Segmented
        value={modes[modal ? 1 : 0]}
        onChange={(v) => setModal(v === modes[1])}
        options={modes}
      />
      <pre className="select-all whitespace-pre-wrap break-all rounded-lg bg-paper-2 px-3 py-2.5 font-mono text-[12px] text-ink-2 leading-relaxed">
        {tag}
      </pre>
    </div>
  );
}

/** A local wizard's copy in the cloud of the linked account: publish it there, get its link. */
function CloudSection({ wizard }: { wizard: WizardDetail }) {
  const qc = useQueryClient();
  const copy = useQuery({
    queryKey: ["cloud", wizard.id],
    queryFn: () => api.get<{ copy: CloudCopy | null }>(`/api/studio/wizards/${wizard.id}/cloud`),
  });
  const publish = useMutation({
    mutationFn: () => api.post<CloudCopy>(`/api/studio/wizards/${wizard.id}/cloud`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["cloud", wizard.id] }),
  });
  const url = copy.data?.copy?.shareUrl;
  return (
    <div className="mt-6 flex flex-col gap-3 border-border-soft border-t pt-5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[14px]">{t("cloud.title")}</span>
        <Button
          variant="secondary"
          size="sm"
          busy={publish.isPending}
          onClick={() => publish.mutate()}
        >
          <CloudUpload className="size-3.5" />
          {url ? t("cloud.update") : t("cloud.publish")}
        </Button>
      </div>
      <p className="text-[13px] text-ink-3">{t("cloud.hint")}</p>
      {url ? (
        <button
          type="button"
          className="inline-flex items-center gap-1.5 self-start font-mono text-[13px] text-ink-2 hover:text-ink"
          onClick={() => openExternal(url)}
        >
          <ExternalLink className="size-3.5" /> {url}
        </button>
      ) : null}
      {url ? <EmbedSection url={url} title={wizard.draft.title} /> : null}
      {publish.isError ? (
        <p className="text-[13px] text-rose">
          {publish.error instanceof ApiError ? publish.error.message : t("cloud.failed")}
        </p>
      ) : null}
    </div>
  );
}

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
  const url = `${window.location.origin}${BASE}/w/${wizard.shareToken}`;
  const me = useMe();
  const estimate = useEstimate(wizard.id, wizard.draft);
  const perDay =
    estimate.data?.available && estimate.data.reserve > 0
      ? Math.round(estimate.data.reserve * wizard.dailyRunLimit)
      : null;
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
      <EmbedSection url={url} title={wizard.draft.title} />
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
        {perDay !== null && estimate.data ? (
          <p className="text-[13px] text-ink-3 tabular-nums">
            {t("estimate.share", {
              run: Math.round(estimate.data.credits).toLocaleString(),
              day: perDay.toLocaleString(),
            })}
          </p>
        ) : null}
        <div className="flex items-center justify-between gap-4">
          <span className="text-[13px] text-ink-3">{t("share.rotateHint")}</span>
          <Button variant="ghost" size="sm" busy={rotate.isPending} onClick={() => rotate.mutate()}>
            <RefreshCw className="size-3.5" /> {t("share.rotate")}
          </Button>
        </div>
      </div>
      {me.data?.mode === "local" && me.data.account ? <CloudSection wizard={wizard} /> : null}
    </Dialog>
  );
}
