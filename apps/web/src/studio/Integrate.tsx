import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AppWindow,
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
import { useSearchParams } from "react-router";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { useMe } from "../lib/session";
import { Button, Card, Chip, cn, IconButton, Spinner } from "../ui";
import {
  MenuGroup,
  MenuRow,
  type MenuTone,
  SubMenu,
  useDetail,
  useSettingsMenu,
} from "./settings-menu";

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

/** An AI app on this computer, as `wizards connect` sees it. */
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

/** The two things an app can get, in one line: the tools (MCP), the wizard itself (MCP App). */
function Kinds({ widgets }: { widgets: boolean }) {
  return (
    <p className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-[13px] text-ink-3">
      <span className="inline-flex items-center gap-1.5" title={t("integrate.kindMcp")}>
        <Wrench className="size-3.5 text-ember-strong" />
        <span className="font-medium text-ink-2">MCP</span> {t("integrate.kindMcpShort")}
      </span>
      <span
        className={cn("inline-flex items-center gap-1.5", widgets ? null : "opacity-60")}
        title={widgets ? t("integrate.kindApp") : t("integrate.kindAppNo")}
      >
        <AppWindow className={cn("size-3.5", widgets ? "text-ember-strong" : "text-ink-4")} />
        <span className="font-medium text-ink-2">MCP App</span>{" "}
        {widgets ? t("integrate.kindAppShort") : t("integrate.kindAppNoShort")}
      </span>
    </p>
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
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-start gap-x-4 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 className="font-display font-semibold text-[22px] leading-tight tracking-tight">
            {client.name}
          </h2>
          <Kinds widgets={client.widgets} />
        </div>
        <Stages at={stage} done={works} />
      </div>

      <Card className="flex flex-col gap-6 p-5 sm:p-6">
        {canHere || !client.oauth ? (
          <fieldset aria-label={t("integrate.where")} className="min-w-0">
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
                      "flex items-start gap-3 rounded-xl px-3.5 py-2.5 text-left ring-1 transition",
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
          </fieldset>
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
  const [params, setParams] = useSearchParams();
  const { narrow } = useSettingsMenu();
  const show = params.get("show");
  const localOf = (id: string) => apps.data?.find((app) => app.id === id);
  const seenOf = (id: string) => seen.data?.[id];
  // The apps on this computer first. Not by what works: the list stays put while a test runs.
  const rank = (id: string) => {
    const local = localOf(id);
    return local?.installed || local?.connected ? 0 : 1;
  };
  const clients = [...CLIENTS].sort((a, b) => rank(a.id) - rank(b.id));
  const current = clients.find((c) => c.id === show) ?? clients[0];
  useDetail(show || !narrow ? current.name : null);
  if (!me.data || (!managed && !apps.data)) {
    return null;
  }
  const url = me.data.mcpUrl ?? "";
  // A dot says how far an app is: it works, it is entered, it is on this computer.
  const toneOf = (id: string): { tone?: MenuTone; toneLabel?: string } => {
    const local = localOf(id);
    if (seenOf(id)?.toolAt) {
      return { tone: "done", toneLabel: t("integrate.stateWorks") };
    }
    if (local?.connected) {
      return { tone: "on", toneLabel: t("integrate.stateConnected") };
    }
    if (local?.installed) {
      return { tone: "off", toneLabel: t("integrate.stateInstalled") };
    }
    return {};
  };
  // On a phone the menu marks nothing: a row opens the page.
  const selected = (id: string) => Boolean(show || !narrow) && id === current.id;

  return (
    <div className="flex flex-col gap-10">
      <SubMenu>
        <MenuGroup label={t("integrate.groupApps")}>
          {clients.map((c) => (
            <MenuRow
              key={c.id}
              icon={c.widgets ? AppWindow : Wrench}
              label={c.name}
              {...toneOf(c.id)}
              selected={selected(c.id)}
              onPick={() => setParams({ show: c.id }, { replace: !narrow })}
            />
          ))}
        </MenuGroup>
        <MenuGroup label={t("integrate.groupShare")}>
          <MenuRow
            icon={Link2}
            label={t("integrate.shareLink")}
            badge={<span className="text-[11px] text-ink-4">{t("integrate.soon")}</span>}
            selected={false}
            disabled
          />
          <MenuRow
            icon={Globe}
            label={t("integrate.shareSite")}
            badge={<span className="text-[11px] text-ink-4">{t("integrate.soon")}</span>}
            selected={false}
            disabled
          />
        </MenuGroup>
      </SubMenu>
      <ClientPanel
        key={current.id}
        client={current}
        local={localOf(current.id)}
        seen={seenOf(current.id)}
        managed={managed}
        url={url}
      />
      {managed ? null : <KeyList />}
      <p className="flex items-start gap-2 text-[13px] text-ink-3">
        <Link2 className="mt-0.5 size-3.5 shrink-0" />
        {t("mcp.notReverse")}
      </p>
    </div>
  );
}
