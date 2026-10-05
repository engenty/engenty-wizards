import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppWindow,
  ArrowRight,
  Check,
  Copy,
  Globe,
  KeyRound,
  Link2,
  Monitor,
  Plus,
  Trash2,
  Wrench,
} from "lucide-react";
import { type ReactNode, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { useMe } from "../lib/session";
import { Button, Card, Chip, cn, IconButton, Spinner } from "../ui";

/** The name the server gets in every client's config. */
const NAME = "engenty-wizards";
/** The variable Codex reads the key from. */
const KEY_VAR = "ENGENTY_WIZARDS_KEY";

interface ApiKeyRow {
  id: string;
  name: string | null;
  start: string | null;
  createdAt: string;
  lastRequest: string | null;
}

/** An AI app on this computer, as `engenty-wizards connect` sees it. */
interface LocalApp {
  id: string;
  name: string;
  widgets: boolean;
  where: string;
  installed: boolean;
  connected: boolean;
}

/** What a client did with the MCP server since the runtime started. */
interface Seen {
  at: number;
  toolAt: number | null;
  widgetAt: number | null;
}

type Outcome = { ok: boolean; message: string; snippet?: string };

/** How a client reaches the server: started as a command here, or at its address. */
type Way = "here" | "address";

/**
 * The AI apps the wizards go into. `widgets`: it shows MCP Apps, so a run shows the wizard itself.
 * `oauth`: it connects from its maker's servers and signs in over OAuth — a public, managed server.
 */
const CLIENTS: { id: string; name: string; widgets: boolean; oauth?: boolean }[] = [
  { id: "claude-desktop", name: "Claude Desktop", widgets: true },
  { id: "claude-code", name: "Claude Code", widgets: false },
  { id: "codex", name: "Codex · ChatGPT app", widgets: false },
  { id: "cursor", name: "Cursor", widgets: true },
  { id: "vscode", name: "VS Code (Copilot)", widgets: true },
  { id: "windsurf", name: "Windsurf", widgets: false },
  { id: "gemini", name: "Gemini CLI", widgets: false },
  { id: "goose", name: "Goose", widgets: true },
  { id: "openclaw", name: "OpenClaw", widgets: false },
  { id: "lm-studio", name: "LM Studio", widgets: false },
  { id: "claude-ai", name: "claude.ai", widgets: true, oauth: true },
  { id: "chatgpt", name: "ChatGPT", widgets: true, oauth: true },
];

export function CopyLine({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-start gap-2 rounded-lg bg-paper-2 p-3">
      <code className="min-w-0 flex-1 whitespace-pre-wrap break-all font-mono text-[12px] leading-relaxed">
        {text}
      </code>
      <IconButton
        label={copied ? t("settings.copied") : t("settings.copy")}
        onClick={async () => {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
      >
        {copied ? <Check className="size-4" /> : <Copy className="size-4" />}
      </IconButton>
    </div>
  );
}

/** Claude Code fetches no plugin archive from a local host, and claude.ai cannot reach one. */
function isPublicHttps(href: string): boolean {
  try {
    const url = new URL(href);
    return (
      url.protocol === "https:" &&
      !/(^|\.)localhost$/.test(url.hostname) &&
      !/^(127\.|10\.|192\.168\.|\[::1\])/.test(url.hostname)
    );
  } catch {
    return false;
  }
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[14px] text-ink-3">{children}</p>;
}

/** A heading of the panel, with its hint below. */
function Part({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5 border-border-soft border-t pt-5 first:border-t-0 first:pt-0">
      <h3 className="font-medium text-[15px]">{title}</h3>
      {children}
    </section>
  );
}

/** A JSON file entry with the server at its address. */
function jsonEntry(at: string, entry: Record<string, unknown>) {
  return JSON.stringify({ [at]: { [NAME]: entry } }, null, 2);
}

/**
 * How a client adds the server at its address. Alone, the client signs in with an API key that
 * goes right into the command; managed, it signs in over OAuth at the Manage-App on first use.
 */
function AddByAddress({ id, url, apiKey }: { id: string; url: string; apiKey?: string }) {
  const bearer = apiKey ? `Authorization: Bearer ${apiKey}` : null;
  const headers = apiKey ? { headers: { Authorization: `Bearer ${apiKey}` } } : {};
  switch (id) {
    case "claude-code": {
      const plugin = url.replace(/\/api\/mcp$/, "/api/claude-plugin");
      return (
        <>
          <Hint>{t("mcp.terminal")}</Hint>
          <CopyLine
            text={`claude mcp add --transport http --scope user ${NAME} ${url}${bearer ? ` --header "${bearer}"` : ""}`}
          />
          {!apiKey && isPublicHttps(url) ? (
            <>
              <Hint>{t("mcp.ccPlugin")}</Hint>
              <CopyLine text={`claude plugin marketplace add ${plugin}/marketplace.json`} />
              <CopyLine text={`claude plugin install ${NAME}@engenty`} />
            </>
          ) : null}
        </>
      );
    }
    case "codex":
      return apiKey ? (
        <>
          <Hint>{t("mcp.codexKey")}</Hint>
          <CopyLine text={`echo 'export ${KEY_VAR}=${apiKey}' >> ~/.zshrc && source ~/.zshrc`} />
          <CopyLine text={`codex mcp add ${NAME} --url ${url} --bearer-token-env-var ${KEY_VAR}`} />
        </>
      ) : (
        <>
          <Hint>{t("mcp.terminal")}</Hint>
          <CopyLine text={`codex mcp add ${NAME} --url ${url}`} />
          <CopyLine text={`codex mcp login ${NAME}`} />
        </>
      );
    case "gemini":
      return (
        <>
          <Hint>{t("mcp.terminal")}</Hint>
          <CopyLine
            text={`gemini mcp add --scope user --transport http ${NAME} ${url}${bearer ? ` -H "${bearer}"` : ""}`}
          />
        </>
      );
    case "cursor":
      return (
        <>
          <Hint>{t("integrate.file", { file: "~/.cursor/mcp.json" })}</Hint>
          <CopyLine text={jsonEntry("mcpServers", { url, ...headers })} />
        </>
      );
    case "vscode":
      return (
        <>
          <Hint>{t("integrate.vscode")}</Hint>
          <CopyLine text={jsonEntry("servers", { type: "http", url, ...headers })} />
        </>
      );
    case "windsurf":
      return (
        <>
          <Hint>{t("integrate.file", { file: "~/.codeium/windsurf/mcp_config.json" })}</Hint>
          <CopyLine text={jsonEntry("mcpServers", { serverUrl: url, ...headers })} />
        </>
      );
    case "lm-studio":
      return (
        <>
          <Hint>{t("integrate.file", { file: "~/.lmstudio/mcp.json" })}</Hint>
          <CopyLine text={jsonEntry("mcpServers", { url, ...headers })} />
        </>
      );
    case "claude-desktop":
    case "claude-ai":
      return (
        <>
          <Hint>{t("mcp.claudeAi")}</Hint>
          <CopyLine text={url} />
        </>
      );
    case "chatgpt":
      return (
        <>
          <Hint>{t("integrate.chatgpt")}</Hint>
          <CopyLine text={url} />
        </>
      );
    default:
      return (
        <>
          <Hint>{t("integrate.generic")}</Hint>
          <CopyLine text={url} />
          {bearer ? <CopyLine text={bearer} /> : null}
        </>
      );
  }
}

/** The keys this runtime has handed out; each one signs one client in. */
function KeyList() {
  const qc = useQueryClient();
  const keys = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.get<ApiKeyRow[]>("/api/studio/api-keys"),
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/api/studio/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });
  if (!keys.data?.length) {
    return null;
  }
  return (
    <section>
      <h2 className="font-display font-semibold text-lg">{t("mcp.keys")}</h2>
      <p className="mt-1 mb-4 text-[14px] text-ink-3">{t("mcp.keysHint")}</p>
      <Card className="flex flex-col gap-2 p-3">
        {keys.data.map((k) => (
          <div key={k.id} className="flex items-center gap-3 rounded-lg px-3 py-2">
            <KeyRound className="size-4 shrink-0 text-ink-4" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px]">{k.name}</div>
              <div className="font-mono text-[11px] text-ink-4">
                {k.start}… ·{" "}
                {k.lastRequest
                  ? t("settings.lastUsed", { when: new Date(k.lastRequest).toLocaleString() })
                  : t("settings.neverUsed")}
              </div>
            </div>
            <IconButton
              label={t("settings.revoke")}
              onClick={() => revoke.mutate(k.id)}
              className="hover:text-rose"
            >
              <Trash2 className="size-4" />
            </IconButton>
          </div>
        ))}
      </Card>
    </section>
  );
}

/** One check of the test: done, the one it waits for, or still ahead. */
function Check3({
  state,
  title,
  children,
}: {
  state: "done" | "now" | "later";
  title: string;
  children?: ReactNode;
}) {
  return (
    <li className="grid grid-cols-[22px_minmax(0,1fr)] gap-x-3">
      <span
        className={cn(
          "mt-0.5 grid size-[22px] place-items-center rounded-full",
          state === "done" && "bg-moss text-white",
          state === "now" && "bg-amber-tint text-ink-2",
          state === "later" && "bg-paper-2 ring-1 ring-border-soft",
        )}
      >
        {state === "done" ? (
          <Check className="size-3.5" strokeWidth={3} />
        ) : state === "now" ? (
          <Spinner className="size-3" />
        ) : null}
      </span>
      <div className="flex min-w-0 flex-col gap-2 pb-4">
        <span className={cn("text-[14px]", state === "later" ? "text-ink-3" : "font-medium")}>
          {title}
        </span>
        {state === "now" ? children : null}
      </div>
    </li>
  );
}

/** The two things an app can get: the tools (MCP) and the wizard itself as a widget (MCP App). */
function Kinds({ widgets }: { widgets: boolean }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-xl bg-paper p-4 ring-1 ring-border-soft">
        <div className="flex items-center gap-2 font-medium text-[14px]">
          <Wrench className="size-4 text-ember-strong" /> MCP
        </div>
        <p className="mt-1.5 text-[13px] text-ink-3">{t("integrate.kindMcp")}</p>
      </div>
      <div
        className={cn(
          "rounded-xl p-4 ring-1",
          widgets ? "bg-paper ring-border-soft" : "bg-paper-2/60 ring-border-soft/60",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-2 font-medium text-[14px]",
            widgets ? null : "text-ink-3",
          )}
        >
          <AppWindow className={cn("size-4", widgets ? "text-ember-strong" : "text-ink-4")} /> MCP
          App
        </div>
        <p className="mt-1.5 text-[13px] text-ink-3">
          {widgets ? t("integrate.kindApp") : t("integrate.kindAppNo")}
        </p>
      </div>
    </div>
  );
}

/** A row of the list on the left. */
function Row({
  selected,
  title,
  note,
  tone,
  widgets,
  disabled,
  onPick,
}: {
  selected: boolean;
  title: string;
  note?: string;
  tone?: "done" | "ok" | "dim";
  widgets?: boolean;
  disabled?: boolean;
  onPick?: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      aria-pressed={selected}
      className={cn(
        "group flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-left transition",
        selected ? "bg-card shadow-soft ring-1 ring-border-soft" : "hover:bg-accent",
        disabled && "cursor-default opacity-55 hover:bg-transparent",
      )}
    >
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-2">
          <span className="truncate font-medium text-[14px]">{title}</span>
          {widgets ? (
            <span
              title="MCP App"
              className="rounded bg-ember-tint px-1 font-semibold text-[10px] text-ember-strong leading-4"
            >
              APP
            </span>
          ) : null}
        </span>
        {note ? (
          <span
            className={cn(
              "flex items-center gap-1 text-[12px]",
              tone === "done" ? "text-moss" : tone === "ok" ? "text-ink-2" : "text-ink-4",
            )}
          >
            {tone === "done" ? <Check className="size-3" strokeWidth={3} /> : null}
            {note}
          </span>
        ) : null}
      </span>
      {disabled ? null : (
        <ArrowRight
          className={cn(
            "size-3.5 shrink-0 transition",
            selected ? "text-ink-3" : "text-ink-4 opacity-0 group-hover:opacity-100",
          )}
        />
      )}
    </button>
  );
}

/** Connect, test, done: where an app stands, one dash per stage. */
function Stages({ at, done }: { at: number; done: boolean }) {
  const stages = [t("setup.stage.connect"), t("setup.stage.test"), t("setup.stage.done")];
  return (
    <ol className="flex flex-wrap items-center gap-x-3 gap-y-1 font-medium text-[11px] uppercase tracking-[0.14em]">
      {stages.map((stage, i) => {
        const reached = done || i < at;
        return (
          <li
            key={stage}
            aria-current={!reached && i === at ? "step" : undefined}
            className={cn(
              "flex items-center gap-1",
              reached ? "text-moss" : i === at ? "text-ember-strong" : "text-ink-4",
            )}
          >
            {reached ? <Check className="size-3" strokeWidth={3} /> : null}
            {stage}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * One app, opened: what it gets (MCP, MCP App), the way in — one click on this computer, or the
 * address with a key from anywhere — and a test that waits until the app has really used it.
 */
function ClientPanel({
  client,
  local,
  seen,
  managed,
  url,
}: {
  client: (typeof CLIENTS)[number];
  local: LocalApp | undefined;
  seen: Seen | undefined;
  managed: boolean;
  url: string;
}) {
  const qc = useQueryClient();
  const reachable = isPublicHttps(url);
  const canHere = !managed && Boolean(local) && !client.oauth;
  const [way, setWay] = useState<Way>(canHere && local?.installed !== false ? "here" : "address");
  const [said, setSaid] = useState<Outcome | null>(null);
  const [apiKey, setApiKey] = useState<string>();
  const change = useMutation({
    mutationFn: (connect: boolean) =>
      api.post<Outcome>(`/api/studio/local/apps/${client.id}`, { connect }),
    onSuccess: (outcome) => setSaid(outcome),
    onError: (error) => setSaid({ ok: false, message: (error as Error).message }),
    onSettled: () => qc.invalidateQueries({ queryKey: ["local-apps"] }),
  });
  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string; name: string; key: string }>("/api/studio/api-keys", {
        name: client.name.slice(0, 32),
      }),
    onSuccess: async (created) => {
      setApiKey(created.key);
      await qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
  // claude.ai, ChatGPT and the connectors of Claude Desktop connect from their maker's servers.
  const connector = client.oauth === true || client.id === "claude-desktop";
  const blocked = way === "address" && connector && !(managed && reachable);
  const connected = way === "here" ? Boolean(local?.connected) : managed || Boolean(apiKey);
  const works = Boolean(seen?.toolAt);
  const stage = works ? 2 : connected || seen ? 1 : 0;
  const ask = (text: string) => <CopyLine text={text} />;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <Stages at={stage} done={works} />
        <h2 className="mt-1.5 font-display font-semibold text-[26px] leading-tight tracking-tight">
          {client.name}
        </h2>
        <p className="mt-1 text-[14px] text-ink-3">
          {client.widgets ? t("integrate.leadApp") : t("integrate.leadMcp")}
        </p>
      </div>

      <Kinds widgets={client.widgets} />

      <Card className="flex flex-col gap-6 p-6">
        {canHere || !client.oauth ? (
          <Part title={t("integrate.where")}>
            <div className="grid gap-2 sm:grid-cols-2">
              {(["here", "address"] as const).map((w) => {
                const off = w === "here" && !canHere;
                return (
                  <button
                    key={w}
                    type="button"
                    disabled={off}
                    onClick={() => setWay(w)}
                    aria-pressed={way === w}
                    className={cn(
                      "flex items-start gap-3 rounded-xl p-3.5 text-left ring-1 transition",
                      way === w
                        ? "bg-ember-tint/50 ring-ember-strong/40"
                        : "ring-border-soft hover:bg-accent",
                      off && "cursor-not-allowed opacity-50 hover:bg-transparent",
                    )}
                  >
                    {w === "here" ? (
                      <Monitor className="mt-0.5 size-4 shrink-0 text-ink-3" />
                    ) : (
                      <Globe className="mt-0.5 size-4 shrink-0 text-ink-3" />
                    )}
                    <span className="min-w-0">
                      <span className="block font-medium text-[14px]">
                        {t(w === "here" ? "integrate.here" : "integrate.address")}
                      </span>
                      <span className="block text-[12px] text-ink-3">
                        {w === "here"
                          ? managed
                            ? t("integrate.hereManaged")
                            : t("integrate.hereHint")
                          : t("integrate.addressHint")}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Part>
        ) : null}

        {blocked ? (
          <Part title={t("mcp.notHere")}>
            <Hint>{managed ? t("mcp.needsPublic") : t("integrate.oauthLocal")}</Hint>
          </Part>
        ) : way === "here" ? (
          <Part title={t("integrate.connectTitle")}>
            {local?.installed === false && !local.connected ? (
              <Hint>{t("integrate.notInstalled", { app: client.name })}</Hint>
            ) : null}
            {local?.connected ? (
              <div className="flex flex-wrap items-center gap-3">
                <span className="flex items-center gap-2 text-[14px] text-ink-2">
                  <Check className="size-4 text-moss" />
                  {t("integrate.connected", { app: client.name })}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  busy={change.isPending && change.variables === false}
                  onClick={() => change.mutate(false)}
                >
                  {t("mcp.appsDisconnect")}
                </Button>
              </div>
            ) : (
              <>
                <Hint>{t("integrate.connectHint", { app: client.name })}</Hint>
                <div>
                  <Button busy={change.isPending} onClick={() => change.mutate(true)}>
                    <Plus className="size-4" /> {t("integrate.connect", { app: client.name })}
                  </Button>
                </div>
              </>
            )}
            {said && !said.ok ? <p className="text-[13px] text-rose">{said.message}</p> : null}
            {said?.snippet ? <CopyLine text={said.snippet} /> : null}
            {local?.where ? (
              <p className="font-mono text-[11px] text-ink-4">{local.where}</p>
            ) : null}
          </Part>
        ) : (
          <>
            {managed || connector ? null : (
              <Part title={t("mcp.keyTitle")}>
                {apiKey ? (
                  <p className="flex items-center gap-2 text-[14px] text-ink-2">
                    <Check className="size-4 text-moss" /> {t("mcp.keyReady")}
                  </p>
                ) : (
                  <>
                    <Hint>{t("mcp.keyHint")}</Hint>
                    <div>
                      <Button
                        variant="secondary"
                        busy={create.isPending}
                        onClick={() => create.mutate()}
                      >
                        <Plus className="size-4" /> {t("mcp.keyCreate", { client: client.name })}
                      </Button>
                    </div>
                  </>
                )}
              </Part>
            )}
            <Part title={t("mcp.add")}>
              {managed || apiKey || connector ? (
                <AddByAddress id={client.id} url={url} apiKey={apiKey} />
              ) : (
                <Hint>{t("mcp.keyFirst")}</Hint>
              )}
              {managed ? <Hint>{t("mcp.oauth")}</Hint> : null}
              <p className="text-[12px] text-ink-4">
                {reachable ? t("mcp.addressPublic") : t("mcp.addressLocal")}
              </p>
            </Part>
          </>
        )}

        {blocked ? null : (
          <Part title={t("integrate.test")}>
            <ol className="flex flex-col">
              <Check3
                state={seen ? "done" : connected ? "now" : "later"}
                title={t("integrate.seen", { app: client.name })}
              >
                <Hint>
                  {way === "here"
                    ? t("integrate.restart", { app: client.name })
                    : t("integrate.reload", { app: client.name })}
                </Hint>
              </Check3>
              <Check3
                state={seen?.toolAt ? "done" : seen ? "now" : "later"}
                title={t("integrate.tool")}
              >
                <Hint>{t("integrate.askHint", { app: client.name })}</Hint>
                {ask(t("integrate.askTool"))}
              </Check3>
              {client.widgets ? (
                <Check3
                  state={seen?.widgetAt ? "done" : seen?.toolAt ? "now" : "later"}
                  title={t("integrate.widget")}
                >
                  <Hint>{t("integrate.widgetHint")}</Hint>
                  {ask(t("integrate.askWidget"))}
                </Check3>
              ) : null}
            </ol>
            {works ? (
              <p className="flex items-center gap-2 font-medium text-[14px] text-moss">
                <Check className="size-4" strokeWidth={3} />
                {t("integrate.works", { app: client.name })}
              </p>
            ) : null}
          </Part>
        )}
      </Card>
    </div>
  );
}

/**
 * "Integrate": the wizards in other places. Today the AI apps — each as MCP (the tools) and,
 * where the app shows them, as MCP App (the wizard itself) — on this computer with one click or
 * anywhere at the server's address, each with a test that waits until the app has really used
 * it. Sharing by link and on a website come later.
 */
export function Integrate() {
  const me = useMe();
  const managed = me.data?.mode === "managed";
  const apps = useQuery({
    queryKey: ["local-apps"],
    queryFn: () => api.get<LocalApp[]>("/api/studio/local/apps"),
    enabled: me.data?.mode === "local",
  });
  const seen = useQuery({
    queryKey: ["integrations-seen"],
    queryFn: () => api.get<Record<string, Seen>>("/api/studio/integrations/seen"),
    refetchInterval: 2500,
  });
  const [picked, setPicked] = useState<string | null>(null);
  if (!me.data || (!managed && !apps.data)) {
    return null;
  }
  const url = me.data.mcpUrl ?? "";
  const localOf = (id: string) => apps.data?.find((app) => app.id === id);
  const seenOf = (id: string) => seen.data?.[id];
  // The apps on this computer first. Not by what works: the list stays put while a test runs.
  const rank = (id: string) => {
    const local = localOf(id);
    return local?.installed || local?.connected ? 0 : 1;
  };
  const clients = [...CLIENTS].sort((a, b) => rank(a.id) - rank(b.id));
  const current = clients.find((c) => c.id === picked) ?? clients[0];
  const noteOf = (id: string): { note?: string; tone?: "done" | "ok" | "dim" } => {
    const local = localOf(id);
    if (seenOf(id)?.toolAt) {
      return { note: t("integrate.stateWorks"), tone: "done" };
    }
    if (local?.connected) {
      return { note: t("integrate.stateConnected"), tone: "ok" };
    }
    if (local?.installed) {
      return { note: t("integrate.stateInstalled"), tone: "dim" };
    }
    return {};
  };

  return (
    <div className="flex flex-col gap-10">
      <div>
        <h2 className="font-display font-semibold text-[22px] tracking-tight">
          {t("integrate.title")}
        </h2>
        <p className="mt-1 max-w-2xl text-[14px] text-ink-2">{t("integrate.lead")}</p>
      </div>
      <div className="grid gap-8 lg:grid-cols-[16rem_minmax(0,1fr)]">
        <nav className="flex flex-col gap-5 lg:sticky lg:top-24 lg:self-start">
          <div>
            <p className="mb-1.5 px-3 font-medium text-[11px] text-ink-4 uppercase tracking-[0.14em]">
              {t("integrate.groupApps")}
            </p>
            <div className="flex flex-col gap-0.5">
              {clients.map((c) => (
                <Row
                  key={c.id}
                  selected={c.id === current.id}
                  title={c.name}
                  widgets={c.widgets}
                  onPick={() => setPicked(c.id)}
                  {...noteOf(c.id)}
                />
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 px-3 font-medium text-[11px] text-ink-4 uppercase tracking-[0.14em]">
              {t("integrate.groupShare")}
            </p>
            <div className="flex flex-col gap-0.5">
              <Row
                selected={false}
                disabled
                title={t("integrate.shareLink")}
                note={t("integrate.soon")}
              />
              <Row
                selected={false}
                disabled
                title={t("integrate.shareSite")}
                note={t("integrate.soon")}
              />
            </div>
          </div>
        </nav>
        <ClientPanel
          key={current.id}
          client={current}
          local={localOf(current.id)}
          seen={seenOf(current.id)}
          managed={managed}
          url={url}
        />
      </div>
      {managed ? null : <KeyList />}
      <p className="flex items-start gap-2 text-[13px] text-ink-3">
        <Link2 className="mt-0.5 size-3.5 shrink-0" />
        {t("mcp.notReverse")}
      </p>
    </div>
  );
}
