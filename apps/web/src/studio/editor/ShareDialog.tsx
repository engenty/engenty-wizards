import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Check,
  ChevronRight,
  Cloud,
  CloudCheck as CloudCheckIcon,
  CloudUpload,
  Code,
  Copy,
  ExternalLink,
  Laptop,
  QrCode,
  RefreshCw,
} from "lucide-react";
import { useState } from "react";
import { Link, useNavigate } from "react-router";
import { api } from "../../lib/api";
import { features } from "../../lib/features";
import { type Key, lang, t } from "../../lib/i18n";
import {
  type CloudAnswer,
  type CloudState,
  type Me,
  type ServerProblem,
  useCloud,
  useMe,
  type WizardDetail,
} from "../../lib/session";
import { PluginFrame, useStudioPlugins } from "../../plugins/host";
import { Button, cn, Dialog, Input, Segmented, Spinner, Switch } from "../../ui";
import { LinkStatus, useAccountLink } from "../Account";
import { openExternal } from "../LocalRuntime";
import { hostOf, ownLink, sharedLink, type WhereItRuns, whereItRuns } from "../where";
import { useEstimate } from "./estimate";
import { WizardQr } from "./WizardQr";

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

/** The editor's publishing, offered where the draft is not published as it is. */
interface Publish {
  run: () => void;
  busy: boolean;
  disabled: boolean;
}

const attr = (text: string) =>
  text.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

const shortTime = () => new Intl.DateTimeFormat(lang, { timeStyle: "short" });

/**
 * The tag that shows the wizard behind `url` (…/w/<token>) in a website (`public/embed.js`):
 * page by page or as a chat; in the page, or behind a button that opens it.
 */
function Embed({ url, title }: { url: string; title: string }) {
  const [chat, setChat] = useState(false);
  const [button, setButton] = useState(false);
  const [copied, setCopied] = useState(false);
  const [, app, token] = url.match(/^(.*)\/w\/([^/]+)$/) ?? [];
  if (!token) {
    return null;
  }
  const extra = chat
    ? button
      ? ' data-mode="popout"'
      : ' data-runner="chat"'
    : button
      ? ` data-mode="modal" data-label="${attr(title)}"`
      : "";
  const tag = `<script async src="${app}/embed.js" data-wizard="${token}"${extra}></script>`;
  const looks = [t("embed.steps"), t("embed.chat")];
  const places = [t("embed.inline"), t(chat ? "embed.popout" : "embed.modal")];
  const hint: Key = chat
    ? button
      ? "embed.popoutHint"
      : "embed.chatInlineHint"
    : button
      ? "embed.modalHint"
      : "embed.inlineHint";
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-4">
        <p className="text-[0.8125rem] text-ink-3">{t(hint)}</p>
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
      <div className="flex flex-wrap gap-x-5 gap-y-2">
        <Segmented
          value={looks[chat ? 1 : 0]}
          onChange={(v) => setChat(v === looks[1])}
          options={looks}
        />
        <Segmented
          value={places[button ? 1 : 0]}
          onChange={(v) => setButton(v === places[1])}
          options={places}
        />
      </div>
      <pre className="select-all whitespace-pre-wrap break-all rounded-lg bg-paper-2 px-3 py-2.5 font-mono text-[0.75rem] text-ink-2 leading-relaxed">
        {tag}
      </pre>
    </div>
  );
}

/** The ways to hand a link out beside opening it: in a website, as a QR code. */
type Way = "website" | "qr";

const pill = (on: boolean) =>
  cn(
    "inline-flex h-8 items-center gap-1.5 rounded-full px-3 font-medium text-[0.8125rem] transition",
    on ? "bg-paper-2 text-ink" : "text-ink-3 hover:text-ink",
  );

/**
 * The one link others open, and the ways to hand it out: opened, in a website, as a QR code.
 * Website and QR code fold out one at a time.
 */
function ShareLink({ url, code, title }: { url: string; code?: string; title: string }) {
  const [copied, setCopied] = useState(false);
  const [panel, setPanel] = useState<Way | null>(null);
  const toggle = (next: Way) => setPanel((now) => (now === next ? null : next));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex gap-2">
        <Input
          readOnly
          value={url}
          onFocus={(e) => e.target.select()}
          className="font-mono text-[0.8125rem]"
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
      <div className="-ml-3 flex flex-wrap gap-1">
        <button type="button" className={pill(false)} onClick={() => openExternal(url)}>
          <ExternalLink className="size-3.5" /> {t("share.open")}
        </button>
        <button
          type="button"
          aria-pressed={panel === "website"}
          className={pill(panel === "website")}
          onClick={() => toggle("website")}
        >
          <Code className="size-3.5" /> {t("share.website")}
        </button>
        <button
          type="button"
          aria-pressed={panel === "qr"}
          className={pill(panel === "qr")}
          onClick={() => toggle("qr")}
        >
          <QrCode className="size-3.5" /> {t("share.qr")}
        </button>
      </div>
      {panel === "website" ? <Embed url={url} title={title} /> : null}
      {panel === "qr" ? <WizardQr url={url} code={code} title={title} /> : null}
    </div>
  );
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
 * sentence per kind of problem; the server's own text folds out where it says more.
 */
function Problems({ problems, quiet }: { problems: ServerProblem[]; quiet?: boolean }) {
  return (
    <ul className={cn("flex flex-col gap-2 text-[0.8125rem]", quiet ? "text-ink-3" : "text-ink-2")}>
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
            <details className="mt-0.5">
              <summary className="cursor-pointer text-[0.75rem] text-ink-4 hover:text-ink-3">
                {t("share.details")}
              </summary>
              <span className="mt-0.5 block break-words font-mono text-[0.6875rem] text-ink-4">
                {problem.detail}
              </span>
            </details>
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
        qc.invalidateQueries({ queryKey: ["wizards"] }),
      ]),
  });
  if (!full) {
    return (
      <p>
        {error.message}{" "}
        {error.reason === "signed_out" ? (
          <Link to="/settings/account" className="font-medium underline underline-offset-2">
            {t("local.toAccount")}
          </Link>
        ) : null}
        {error.again ? (
          <span className="text-ink-3">
            {t("cloud.again", { when: shortTime().format(new Date(error.again)) })}
          </span>
        ) : null}
      </p>
    );
  }
  const names = (spaces.data?.spaces ?? []).map((space) => space.name);
  return (
    <div className="flex flex-col gap-2">
      <p>{error.message}</p>
      <p className="text-ink-2">{t("cloud.spaceLimit")}</p>
      {names.length ? (
        <ul className="list-disc pl-5">
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
 * One line on top: where the published wizard runs. Where the cloud does not run this version,
 * the line says why, what it lacks, and — where sending again helps — offers it.
 */
function Status({
  wizard,
  where,
  me,
  cloud,
}: {
  wizard: WizardDetail;
  where: WhereItRuns;
  me: Me;
  cloud: CloudAnswer | undefined;
}) {
  const qc = useQueryClient();
  const send = useMutation({
    mutationFn: () => api.post<CloudAnswer>(`/api/studio/wizards/${wizard.id}/cloud`),
    onSuccess: (state) => {
      qc.setQueryData(["cloud", wizard.id], state);
      void qc.invalidateQueries({ queryKey: ["wizards"] });
    },
  });
  const line = "flex items-start gap-2 text-[0.875rem] text-ink-2";
  switch (where.kind) {
    case "draft":
      return null;
    case "unknown":
      return <Spinner className="size-4 text-ink-4" />;
    case "here":
      return (
        <p className={line}>
          <Laptop className="mt-0.5 size-4 shrink-0 text-ink-3" /> {t("where.hereHint")}
        </p>
      );
    case "live":
      return (
        <p
          className={line}
          title={
            cloud?.copy
              ? t("cloud.sent", {
                  v: cloud.copy.version,
                  when: new Intl.DateTimeFormat(lang, {
                    dateStyle: "short",
                    timeStyle: "short",
                  }).format(new Date(cloud.copy.syncedAt)),
                })
              : undefined
          }
        >
          {where.cloud ? (
            <CloudCheckIcon className="mt-0.5 size-4 shrink-0 text-moss" />
          ) : (
            <span className="mt-[7px] size-1.5 shrink-0 rounded-full bg-moss" />
          )}
          {where.cloud
            ? t("where.liveAt", { host: hostOf(me.account?.cloudUrl ?? ""), v: where.runs })
            : t("editor.published", { v: where.runs })}
        </p>
      );
  }
  const copy = cloud?.copy ?? null;
  const error = cloud?.error ?? null;
  const blocking = copy && !copy.runnable ? copy.problems.filter((p) => p.blocking) : [];
  /** Sent by publishing; by hand after a try that failed or was never made — not after a refusal only the person mends. */
  const resend =
    wizard.published &&
    (!copy || copy.version < (wizard.publishedVersion ?? 0) || error) &&
    error?.reason !== "space_limit" &&
    error?.reason !== "signed_out";
  return (
    <div className="flex flex-col gap-2 rounded-lg bg-amber-tint px-3 py-2.5 text-[0.875rem]">
      {error ? <CloudError error={error} /> : where.kind === "missing" ? <p>{where.why}</p> : null}
      {error && where.runs !== null ? (
        <p className="text-[0.8125rem] text-ink-3">{t("cloud.keepsRunning", { v: where.runs })}</p>
      ) : null}
      {blocking.length ? <Problems problems={blocking} /> : null}
      {resend ? (
        <div>
          <Button variant="secondary" size="sm" busy={send.isPending} onClick={() => send.mutate()}>
            <CloudUpload className="size-3.5" />
            {copy || error ? t("cloud.resend") : t("cloud.send")}
          </Button>
        </div>
      ) : null}
      {send.error ? (
        <p className="text-[0.8125rem] text-rose">{(send.error as Error).message}</p>
      ) : null}
    </div>
  );
}

/**
 * What the cloud of a linked account runs differently, or would lack for the draft as it is
 * now — asked while the cloud does not have the wizard as it is.
 */
function CloudNotes({ wizard, cloud }: { wizard: WizardDetail; cloud: CloudAnswer | undefined }) {
  const copy = cloud?.copy ?? null;
  const published = wizard.publishedVersion;
  const behind = copy !== null && published !== null && copy.version < published;
  const differs = !copy || wizard.dirty || behind;
  const check = useQuery({
    queryKey: ["cloud-check", wizard.id, wizard.revision],
    queryFn: () => api.get<CloudCheck>(`/api/studio/wizards/${wizard.id}/cloud/check`),
    enabled: cloud?.linked === true && differs,
    retry: false,
    staleTime: 30_000,
  });
  const notes = !differs && copy ? copy.problems.filter((p) => !p.blocking) : [];
  const lacking = differs ? (check.data?.problems ?? []) : [];
  if (!(notes.length || lacking.length || (differs && check.data?.documents))) {
    // The cloud did not answer the question; a failed try above already says so.
    return differs && check.error && !cloud?.error ? (
      <p className="text-[0.8125rem] text-ink-3">{(check.error as Error).message}</p>
    ) : null;
  }
  return (
    <div className="flex flex-col gap-2">
      {notes.length ? (
        <>
          <p className="text-[0.8125rem] text-ink-3">{t("cloud.notes")}</p>
          <Problems problems={notes} quiet />
        </>
      ) : null}
      {lacking.length ? (
        <>
          <p className="text-[0.8125rem] text-ink-2">
            {t(lacking.some((p) => p.blocking) ? "cloud.checkBlocking" : "cloud.check")}
          </p>
          <Problems problems={lacking} quiet />
        </>
      ) : null}
      {differs && check.data?.documents ? (
        <p className="text-[0.8125rem] text-ink-3">{t("cloud.documents")}</p>
      ) : null}
    </div>
  );
}

/** What the studio asks about a wizard's runners: each with its fit, and how the wizard is offered. */
interface RunnersAnswer {
  runners: {
    id: string;
    label: { de: string; en: string };
    kind: "page" | "channel";
    problem?: string | null;
    fit: { outcome: "full" | "handoff" | "no"; steps: { title: string; why: string }[] };
  }[];
  settings: { default: string; enabled: string[] };
}

/**
 * The channels a wizard runs through: the page, the chat, and what plugins add. The link opens
 * the default; the rest is switched on beside it. Each says how far it gets with this draft.
 */
function Channels({ wizard }: { wizard: WizardDetail }) {
  const qc = useQueryClient();
  // A plugin's runner may draw its own part under its row: a keyword, a number, a QR code.
  const { shareSections } = useStudioPlugins();
  const runners = useQuery({
    queryKey: ["wizard-runners", wizard.id, wizard.revision],
    queryFn: () => api.get<RunnersAnswer>(`/api/studio/wizards/${wizard.id}/runners`),
  });
  const patch = useMutation({
    mutationFn: (settings: RunnersAnswer["settings"]) =>
      api.patch(`/api/studio/wizards/${wizard.id}`, { runners: settings }),
    onSuccess: () =>
      Promise.all([
        qc.invalidateQueries({ queryKey: ["wizard-runners", wizard.id] }),
        qc.invalidateQueries({ queryKey: ["wizard", wizard.id] }),
      ]),
  });
  if (!runners.data || runners.data.runners.length < 2) {
    return null;
  }
  const { settings } = runners.data;
  const locked = wizard.readOnly;
  return (
    <div className="flex flex-col gap-2 border-border-soft border-t pt-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-[0.875rem]">{t("share.channels")}</span>
        <span className="text-[0.75rem] text-ink-3">{t("share.channelsHint")}</span>
      </div>
      <ul className="flex flex-col">
        {runners.data.runners.map((r) => {
          const on = settings.enabled.includes(r.id);
          const isDefault = settings.default === r.id;
          const steps = r.fit.steps.map((s) => s.title).join(", ");
          const fit = r.problem
            ? t("share.notSetUp", { problem: r.problem })
            : r.fit.outcome === "full"
              ? t("share.fit.full")
              : t(r.fit.outcome === "handoff" ? "share.fit.handoff" : "share.fit.no", { steps });
          const section = on && !r.problem ? shareSections.find((s) => s.runner === r.id) : null;
          return (
            <li key={r.id} className="flex flex-col py-2">
              <div className="flex items-center gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2 text-[0.875rem]">
                    <span className="font-medium">{r.label[lang]}</span>
                    {isDefault ? (
                      <span className="rounded-full bg-paper-2 px-2 py-px text-[0.6875rem] text-ink-3">
                        {t("share.default")}
                      </span>
                    ) : on &&
                      r.kind === "page" &&
                      r.fit.outcome !== "no" &&
                      !r.problem &&
                      !locked ? (
                      <button
                        type="button"
                        className="text-[0.75rem] text-ink-4 hover:text-ink"
                        onClick={() => patch.mutate({ default: r.id, enabled: settings.enabled })}
                      >
                        {t("share.makeDefault")}
                      </button>
                    ) : null}
                  </div>
                  <div className="truncate text-[0.75rem] text-ink-3" title={fit}>
                    {fit}
                  </div>
                </div>
                <Switch
                  checked={on}
                  disabled={locked || isDefault || r.fit.outcome === "no" || Boolean(r.problem)}
                  onChange={(v) =>
                    patch.mutate({
                      default: settings.default,
                      enabled: v
                        ? [...settings.enabled, r.id]
                        : settings.enabled.filter((id) => id !== r.id),
                    })
                  }
                />
              </div>
              {section ? (
                <div className="mt-2">
                  <PluginFrame of={section}>
                    <section.component wizard={{ id: wizard.id, title: wizard.draft.title }} />
                  </PluginFrame>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>
      {patch.error ? (
        <p className="text-[0.8125rem] text-rose">{(patch.error as Error).message}</p>
      ) : null}
    </div>
  );
}

/** A local install without an account: its link answers here only; an account shares it. */
function SignInOffer({ way }: { way: Way | null }) {
  const navigate = useNavigate();
  const linking = useAccountLink(false);
  return (
    <div
      className={cn(
        "flex flex-col gap-3",
        // Asked for by a way of sharing that needs the cloud: it answers that one.
        way ? "rounded-lg bg-cobalt-tint px-3 py-3" : "border-border-soft border-t pt-5",
      )}
    >
      <div>
        <div className="font-medium text-[0.875rem]">{t("share.others")}</div>
        <p className="mt-1 text-[0.8125rem] text-ink-2 leading-relaxed">
          {t(
            way === "website" ? "teaser.website" : way === "qr" ? "teaser.qr" : "share.othersHint",
          )}
        </p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" busy={linking.link.isPending} onClick={() => linking.link.mutate({})}>
          {t("account.signIn")}
        </Button>
        <Button size="sm" variant="secondary" onClick={() => navigate("/settings/account")}>
          {t("account.create")}
        </Button>
      </div>
      <LinkStatus {...linking} />
    </div>
  );
}

/**
 * How the link is shared — on or off, runs a day, a new address — folded into one line. With an
 * account linked the copy in the cloud follows each change.
 */
function Settings({ wizard, cloud }: { wizard: WizardDetail; cloud: CloudAnswer | undefined }) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(String(wizard.dailyRunLimit));
  const refresh = () =>
    Promise.all([
      qc.invalidateQueries({ queryKey: ["wizard", wizard.id] }),
      qc.invalidateQueries({ queryKey: ["wizards"] }),
    ]);
  const patch = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      api.patch(`/api/studio/wizards/${wizard.id}`, body),
    onSuccess: refresh,
  });
  const rotate = useMutation({
    mutationFn: () =>
      api.post<{ cloud: CloudState | null }>(`/api/studio/wizards/${wizard.id}/rotate-link`),
    onSuccess: ({ cloud: next }) => {
      if (next) {
        qc.setQueryData(["cloud", wizard.id], { linked: true, ...next });
      }
      return refresh();
    },
  });
  /** Shown and run here, changed in the local install: how it is shared is set there. */
  const locked = wizard.readOnly;
  const failed = patch.error ?? rotate.error;
  const estimate = useEstimate(wizard.id, wizard.draft);
  const perDay =
    estimate.data?.available && estimate.data.reserve > 0
      ? Math.round(estimate.data.reserve * wizard.dailyRunLimit)
      : null;
  const shown = open || Boolean(failed);
  return (
    <div className="border-border-soft border-t pt-4">
      <button
        type="button"
        aria-expanded={shown}
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-4 text-left text-[0.875rem]"
      >
        <span className="flex items-center gap-1.5">
          <ChevronRight className={cn("size-4 text-ink-3 transition", shown && "rotate-90")} />
          {t("share.settings")}
        </span>
        <span className="text-[0.8125rem] text-ink-3 tabular-nums">
          {t(wizard.shareEnabled ? "share.on" : "share.off")} ·{" "}
          {t("share.perDay", { n: wizard.dailyRunLimit })}
        </span>
      </button>
      {shown ? (
        <div className="mt-4 flex flex-col gap-5">
          <div className="flex items-center justify-between">
            <span className="text-[0.875rem]">{t("share.enabled")}</span>
            <Switch
              checked={wizard.shareEnabled}
              disabled={locked}
              onChange={(v) => patch.mutate({ shareEnabled: v })}
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <span className="whitespace-nowrap text-[0.875rem]">{t("share.limit")}</span>
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
            <p className="text-[0.8125rem] text-ink-3 tabular-nums">
              {t("estimate.share", {
                run: Math.round(estimate.data.credits).toLocaleString(),
                day: perDay.toLocaleString(),
              })}
            </p>
          ) : null}
          <div className="flex items-center justify-between gap-4">
            <span className="text-[0.8125rem] text-ink-3">
              {t(cloud?.copy ? "share.rotateCloud" : "share.rotateHint")}
            </span>
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
          {failed ? (
            <p className="text-[0.8125rem] text-rose">{(failed as Error).message}</p>
          ) : null}
        </div>
      ) : null}
      {locked ? <p className="mt-3 text-[0.8125rem] text-ink-3">{t("share.readOnly")}</p> : null}
    </div>
  );
}

/**
 * Hands out a wizard: on top where it runs, then the one link others open — this server's own,
 * or for a local install with an account its copy's in the cloud. A local install's own link
 * answers only on this computer: it is there to test, never to hand out.
 */
export function ShareDialog({
  wizard,
  open,
  onClose,
  publish,
}: {
  wizard: WizardDetail;
  open: boolean;
  onClose: () => void;
  /** Publishing from here, where the draft is not published as it is. */
  publish?: Publish;
}) {
  const me = useMe();
  const local = me.data?.mode === "local";
  // A local install with an account sends what it publishes on to the account's cloud.
  const linked = local && Boolean(me.data?.account);
  const cloud = useCloud(wizard.id, open && linked);
  const where: WhereItRuns = me.data
    ? whereItRuns(wizard, me.data, linked ? cloud.data : null)
    : { kind: "unknown" };
  const link = sharedLink(where);
  // A local runtime answers only on this computer: its QR code and ID are the cloud copy's.
  const own = me.data?.mode === "managed" && wizard.published;
  const code = useQuery({
    queryKey: ["wizard-code", wizard.id, wizard.shareToken],
    queryFn: () => api.get<{ code: string }>(`/api/studio/wizards/${wizard.id}/code`),
    enabled: open && own,
  });
  const unpublished = !wizard.published || (wizard.dirty && !wizard.readOnly);
  /** Without an account: the way of sharing someone tried, which the offer below answers. */
  const [teaser, setTeaser] = useState<Way | null>(null);
  return (
    <Dialog open={open} onClose={onClose} title={t("share.title")}>
      <div className="flex flex-col gap-5">
        {unpublished ? (
          <div className="flex flex-col gap-2 rounded-lg bg-amber-tint px-3 py-2.5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-[0.875rem]">
                {t(wizard.published ? "share.unpublished" : "share.publishFirst")}
              </p>
              {publish ? (
                <Button
                  size="sm"
                  busy={publish.busy}
                  disabled={publish.disabled}
                  onClick={publish.run}
                >
                  {t("editor.publish")}
                </Button>
              ) : null}
            </div>
            {linked && !wizard.published ? (
              <p className="text-[0.8125rem] text-ink-3">{t("cloud.onPublish")}</p>
            ) : null}
          </div>
        ) : null}
        {me.data && wizard.published ? (
          <Status wizard={wizard} where={where} me={me.data} cloud={cloud.data} />
        ) : null}
        {cloud.isError ? (
          <p className="text-[0.8125rem] text-rose">{(cloud.error as Error).message}</p>
        ) : null}
        {link ? (
          <ShareLink
            url={link}
            code={own ? code.data?.code : cloud.data?.copy?.code}
            title={wizard.draft.title}
          />
        ) : null}
        {local && !linked && wizard.published ? (
          <div className="flex flex-col gap-3">
            <div className="flex gap-2">
              <Input
                readOnly
                value={ownLink(wizard)}
                onFocus={(e) => e.target.select()}
                className="font-mono text-[0.8125rem] text-ink-3"
              />
              <Button variant="secondary" onClick={() => openExternal(ownLink(wizard))}>
                <ExternalLink className="size-4" /> {t("share.open")}
              </Button>
            </div>
            {features.account ? (
              // The ways that need a link everyone reaches stay in sight: each says what it takes.
              <div className="-ml-3 flex flex-wrap gap-1">
                {(["website", "qr"] as const).map((w) => (
                  <button
                    key={w}
                    type="button"
                    aria-pressed={teaser === w}
                    className={pill(teaser === w)}
                    onClick={() => setTeaser((now) => (now === w ? null : w))}
                  >
                    {w === "website" ? (
                      <Code className="size-3.5" />
                    ) : (
                      <QrCode className="size-3.5" />
                    )}
                    {t(w === "website" ? "share.website" : "share.qr")}
                    <Cloud className="size-3 text-cobalt" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        ) : null}
        {linked ? <CloudNotes wizard={wizard} cloud={cloud.data} /> : null}
        {local && !linked && features.account ? <SignInOffer way={teaser} /> : null}
        {wizard.published ? <Channels wizard={wizard} /> : null}
        <Settings wizard={wizard} cloud={linked ? cloud.data : undefined} />
        {linked && wizard.published ? (
          <button
            type="button"
            onClick={() => openExternal(ownLink(wizard))}
            className="inline-flex items-center gap-1.5 self-start text-[0.8125rem] text-ink-3 hover:text-ink"
          >
            <Laptop className="size-3.5" /> {t("share.openHere")}
            <ExternalLink className="size-3" />
          </button>
        ) : null}
      </div>
    </Dialog>
  );
}
