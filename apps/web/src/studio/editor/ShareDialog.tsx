import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, CloudUpload, Copy, ExternalLink, RefreshCw } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
import { BASE } from "@/lib/base";
import { api } from "../../lib/api";
import { type Key, lang, t } from "../../lib/i18n";
import { type CloudState, type ServerProblem, useMe, type WizardDetail } from "../../lib/session";
import { Button, cn, Dialog, Input, Segmented, Spinner, Switch } from "../../ui";
import { openExternal } from "../LocalRuntime";
import { useEstimate } from "./estimate";
import { WizardQr } from "./WizardQr";

/** A local wizard in the cloud, as this install knows it; `linked`: an account is linked at all. */
type CloudAnswer = CloudState & { linked: boolean };

/** What the cloud would lack for the draft; `documents`: the project's documents are not sent. */
interface CloudCheck {
  problems: ServerProblem[];
  documents: boolean;
}

/** A project of a local install the account's cloud holds. */
interface CloudSpace {
  id: string;
  name: string;
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

/** Where a local wizard stands in the cloud of the linked account. */
function useCloud(wizardId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["cloud", wizardId],
    queryFn: () => api.get<CloudAnswer>(`/api/studio/wizards/${wizardId}/cloud`),
    enabled,
  });
}

const PROBLEM_TEXT: Record<ServerProblem["code"], Key> = {
  sandbox: "cloud.problem.sandbox",
  mcp: "cloud.problem.mcp",
  model: "cloud.problem.model",
  connector: "cloud.problem.connector",
  invalid: "cloud.problem.invalid",
};

/**
 * What the cloud lacks for a wizard, in the studio's words: the steps by their titles, one
 * sentence per kind of problem, and the server's own text where it says more.
 */
function Problems({ problems, quiet }: { problems: ServerProblem[]; quiet?: boolean }) {
  return (
    <ul className={cn("flex flex-col gap-2 text-[13px]", quiet ? "text-ink-3" : "text-ink-2")}>
      {problems.map((problem, i) => (
        <li key={i}>
          {problem.steps.length ? (
            <span className={cn("font-medium", quiet ? "text-ink-2" : "text-ink")}>
              {problem.steps.map((s) => t("cloud.stepName", { title: s.title })).join(", ")}:{" "}
            </span>
          ) : null}
          {t(PROBLEM_TEXT[problem.code] ?? "cloud.problem.invalid", { detail: problem.detail })}
          {/* The MCP sentence names the servers itself; a missing sandbox has nothing to add. */}
          {problem.detail && problem.code !== "mcp" && problem.code !== "sandbox" ? (
            <span className="mt-0.5 block break-words font-mono text-[11px] text-ink-4">
              {problem.detail}
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Why the last try did not arrive. Where the account's cloud holds another install's project,
 * that one can be replaced from here: its wizards and their links go.
 */
function CloudError({ error }: { error: NonNullable<CloudState["error"]> }) {
  const qc = useQueryClient();
  const full = error.reason === "space_limit";
  const spaces = useQuery({
    queryKey: ["cloud-spaces"],
    queryFn: () => api.get<{ spaces: CloudSpace[] }>("/api/studio/cloud/spaces"),
    enabled: full,
    retry: false,
  });
  const replace = useMutation({
    mutationFn: () => api.post<{ sent: number; failed: number }>("/api/studio/cloud/replace"),
    // Every wizard of this install was sent again: each one's state is asked anew.
    onSettled: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["cloud"] }),
        qc.invalidateQueries({ queryKey: ["cloud-spaces"] }),
      ]),
  });
  if (!full) {
    return (
      <p className="text-[13px] text-rose">
        {error.message}{" "}
        {error.reason === "signed_out" ? (
          <Link to="/settings/account" className="font-medium underline underline-offset-2">
            {t("local.toAccount")}
          </Link>
        ) : null}
      </p>
    );
  }
  const names = (spaces.data?.spaces ?? []).map((space) => space.name);
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-rose-tint px-3 py-2.5 text-[13px] text-ink-2">
      <p className="text-rose">{error.message}</p>
      <p>{t("cloud.spaceLimit")}</p>
      {names.length ? (
        <ul className="list-disc pl-5 text-ink">
          {names.map((name, i) => (
            <li key={i}>{name}</li>
          ))}
        </ul>
      ) : null}
      <div>
        <Button
          variant="secondary"
          size="sm"
          busy={replace.isPending}
          onClick={() => window.confirm(t("cloud.replaceConfirm")) && replace.mutate()}
        >
          {t("cloud.replace")}
        </Button>
      </div>
      {replace.error ? <p className="text-rose">{(replace.error as Error).message}</p> : null}
    </div>
  );
}

/**
 * A local wizard in the cloud of the linked account. Publishing sends it there by itself; this
 * shows where it stands: its link there, whether the version runs, what the cloud lacks for it,
 * and why a try did not arrive.
 */
function CloudSection({ wizard }: { wizard: WizardDetail }) {
  const qc = useQueryClient();
  const cloud = useCloud(wizard.id, true);
  const send = useMutation({
    mutationFn: () => api.post<CloudAnswer>(`/api/studio/wizards/${wizard.id}/cloud`),
    onSuccess: (state) => qc.setQueryData(["cloud", wizard.id], state),
  });
  const copy = cloud.data?.copy ?? null;
  const error = cloud.data?.error ?? null;
  const published = wizard.publishedVersion;
  /** The cloud has an older version than the one published here. */
  const behind = copy !== null && published !== null && copy.version < published;
  // What the cloud would lack is asked while it does not have the wizard as it is now.
  const differs = !copy || wizard.dirty || behind;
  const check = useQuery({
    queryKey: ["cloud-check", wizard.id, wizard.revision],
    queryFn: () => api.get<CloudCheck>(`/api/studio/wizards/${wizard.id}/cloud/check`),
    enabled: cloud.data?.linked === true && differs,
    retry: false,
    staleTime: 30_000,
  });
  // Unlinked meanwhile: there is no cloud to speak of.
  if (cloud.data && !cloud.data.linked) {
    return null;
  }
  const blocking = copy?.problems.filter((p) => p.blocking) ?? [];
  const notes = copy?.problems.filter((p) => !p.blocking) ?? [];
  const lacking = differs ? (check.data?.problems ?? []) : [];
  const when = new Intl.DateTimeFormat(lang, { dateStyle: "short", timeStyle: "short" });
  return (
    <div className="mt-6 flex flex-col gap-3 border-border-soft border-t pt-5">
      <div className="flex items-center justify-between gap-4">
        <span className="text-[14px]">{t("cloud.title")}</span>
        {/* Sent by publishing; by hand only after a try that failed or was never made. */}
        {wizard.published && cloud.data && (!copy || behind || error) ? (
          <Button variant="secondary" size="sm" busy={send.isPending} onClick={() => send.mutate()}>
            <CloudUpload className="size-3.5" />
            {copy || error ? t("cloud.resend") : t("cloud.send")}
          </Button>
        ) : null}
      </div>
      {cloud.isLoading ? <Spinner className="size-4 text-ink-4" /> : null}
      {cloud.isError ? (
        <p className="text-[13px] text-rose">{(cloud.error as Error).message}</p>
      ) : null}
      {cloud.data && !copy && !error ? (
        <p className="text-[13px] text-ink-3">
          {t(wizard.published ? "cloud.notSent" : "cloud.onPublish")}
        </p>
      ) : null}
      {copy ? (
        <div className="flex flex-col gap-1">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 self-start break-all text-left font-mono text-[13px] text-ink-2 hover:text-ink"
            onClick={() => openExternal(copy.shareUrl)}
          >
            <ExternalLink className="size-3.5 shrink-0" /> {copy.shareUrl}
          </button>
          <p className="text-[12px] text-ink-4">
            {t(behind ? "cloud.sentBehind" : "cloud.sent", {
              v: copy.version,
              when: when.format(new Date(copy.syncedAt)),
              now: published ?? copy.version,
            })}
          </p>
        </div>
      ) : null}
      {copy && !copy.runnable ? (
        <div className="flex flex-col gap-2 rounded-lg bg-amber-tint px-3 py-2.5">
          <p className="text-[14px]">
            {t("cloud.notRunnable", { v: copy.version })}{" "}
            {copy.publishedVersion === null
              ? t("cloud.nothingRuns")
              : t("cloud.keepsRunning", { v: copy.publishedVersion })}
          </p>
          {blocking.length ? <Problems problems={blocking} /> : null}
        </div>
      ) : null}
      {error ? <CloudError error={error} /> : null}
      {send.error ? <p className="text-[13px] text-rose">{(send.error as Error).message}</p> : null}
      {!differs && notes.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-ink-3">{t("cloud.notes")}</p>
          <Problems problems={notes} quiet />
        </div>
      ) : null}
      {lacking.length ? (
        <div className="flex flex-col gap-2">
          <p className="text-[13px] text-ink-2">
            {t(lacking.some((p) => p.blocking) ? "cloud.checkBlocking" : "cloud.check")}
          </p>
          <Problems problems={lacking} quiet />
        </div>
      ) : null}
      {differs && check.data?.documents ? (
        <p className="text-[13px] text-ink-3">{t("cloud.documents")}</p>
      ) : null}
      {/* The cloud did not answer the question; the failed try above already says so. */}
      {differs && check.error && !error ? (
        <p className="text-[13px] text-ink-3">{(check.error as Error).message}</p>
      ) : null}
      {/* A local runtime answers only on this computer: the QR code and ID are the cloud copy's. */}
      {copy ? <WizardQr url={copy.shareUrl} code={copy.code} title={wizard.draft.title} /> : null}
      {copy ? <EmbedSection url={copy.shareUrl} title={wizard.draft.title} /> : null}
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
  // A local runtime answers only on this computer: its QR code and ID are the cloud copy's.
  const reachable = me.data?.mode === "managed" && wizard.published;
  const code = useQuery({
    queryKey: ["wizard-code", wizard.id, wizard.shareToken],
    queryFn: () => api.get<{ code: string }>(`/api/studio/wizards/${wizard.id}/code`),
    enabled: open && reachable,
  });
  // A local install with an account sends what it publishes on to the account's cloud.
  const linked = me.data?.mode === "local" && Boolean(me.data.account);
  const cloud = useCloud(wizard.id, open && linked);
  /** Shown and run here, changed in the local install: how it is shared is set there. */
  const locked = wizard.readOnly;
  const failed = patch.error ?? rotate.error;
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
      {/* Published here, but not as it should be in the cloud: said first, the rest is below. */}
      {cloud.data?.error || cloud.data?.copy?.runnable === false ? (
        <p className="mb-4 rounded-lg bg-amber-tint px-3 py-2 text-[14px]">
          {t(cloud.data.error ? "cloud.noticeError" : "cloud.noticeNotRunnable")}
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
      {reachable ? <WizardQr url={url} code={code.data?.code} title={wizard.draft.title} /> : null}
      <EmbedSection url={url} title={wizard.draft.title} />
      <div className="mt-6 flex flex-col gap-5 border-border-soft border-t pt-5">
        <div className="flex items-center justify-between">
          <span className="text-[14px]">{t("share.enabled")}</span>
          <Switch
            checked={wizard.shareEnabled}
            disabled={locked}
            onChange={(v) => patch.mutate({ shareEnabled: v })}
          />
        </div>
        <div className="flex items-center justify-between gap-4">
          <span className="whitespace-nowrap text-[14px]">{t("share.limit")}</span>
          <div className="w-24">
            <Input
              inputMode="numeric"
              className="text-right"
              disabled={locked}
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
          <Button
            variant="ghost"
            size="sm"
            busy={rotate.isPending}
            disabled={locked}
            onClick={() => rotate.mutate()}
          >
            <RefreshCw className="size-3.5" /> {t("share.rotate")}
          </Button>
        </div>
        {locked ? <p className="text-[13px] text-ink-3">{t("share.readOnly")}</p> : null}
        {failed ? <p className="text-[13px] text-rose">{(failed as Error).message}</p> : null}
      </div>
      {linked ? <CloudSection wizard={wizard} /> : null}
    </Dialog>
  );
}
