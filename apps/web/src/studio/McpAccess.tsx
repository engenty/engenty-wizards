import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowRight, Check, Copy, KeyRound, Plus, Trash2 } from "lucide-react";
import { type ReactNode, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { useMe } from "../lib/session";
import { Button, Card, IconButton, Segmented } from "../ui";

const CLIENTS = ["Claude Code", "Codex", "Cursor", "Gemini CLI", "claude.ai"] as const;
type Client = (typeof CLIENTS)[number];

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

/** One numbered step of the setup. */
function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <li className="grid grid-cols-[28px_minmax(0,1fr)] gap-x-3">
      <span className="grid size-7 place-items-center rounded-full bg-paper-2 font-semibold text-[13px] text-ink-2 ring-1 ring-border-soft">
        {n}
      </span>
      <div className="flex min-w-0 flex-col gap-2.5 pt-0.5 pb-7">
        <h3 className="font-medium text-[15px]">{title}</h3>
        {children}
      </div>
    </li>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <p className="text-[14px] text-ink-3">{children}</p>;
}

/**
 * How a client adds the server. Alone, the client signs in with an API key that goes right into
 * the command; managed, it signs in over OAuth at the Manage-App on first use.
 */
function AddServer({ client, url, apiKey }: { client: Client; url: string; apiKey?: string }) {
  const bearer = apiKey ? `Authorization: Bearer ${apiKey}` : null;
  switch (client) {
    case "Claude Code": {
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
    case "Codex":
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
    case "Cursor":
      return (
        <>
          <Hint>{t("mcp.cursor")}</Hint>
          <CopyLine
            text={JSON.stringify(
              {
                mcpServers: {
                  [NAME]: apiKey
                    ? { url, headers: { Authorization: `Bearer ${apiKey}` } }
                    : { url },
                },
              },
              null,
              2,
            )}
          />
        </>
      );
    case "Gemini CLI":
      return (
        <>
          <Hint>{t("mcp.terminal")}</Hint>
          <CopyLine
            text={`gemini mcp add --scope user --transport http ${NAME} ${url}${bearer ? ` -H "${bearer}"` : ""}`}
          />
        </>
      );
    case "claude.ai":
      return (
        <>
          <Hint>{t("mcp.claudeAi")}</Hint>
          <CopyLine text={url} />
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
    <Card className="p-6">
      <h2 className="font-display font-semibold text-lg">{t("mcp.keys")}</h2>
      <p className="mt-1 mb-5 text-[14px] text-ink-3">{t("mcp.keysHint")}</p>
      <div className="flex flex-col gap-2">
        {keys.data.map((k) => (
          <div
            key={k.id}
            className="flex items-center gap-3 rounded-lg bg-paper px-3 py-2 ring-1 ring-border-soft"
          >
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
      </div>
    </Card>
  );
}

/**
 * The studio's MCP server, for the admin's own AI clients: what it is, and the steps to add it to
 * one — on the client's own subscription.
 */
export function McpAccess() {
  const me = useMe();
  const qc = useQueryClient();
  const [client, setClient] = useState<Client>("Claude Code");
  // Per client: a key made here goes straight into that client's command.
  const [keys, setKeys] = useState<Partial<Record<Client, string>>>({});
  const create = useMutation({
    mutationFn: (name: string) =>
      api.post<{ id: string; name: string; key: string }>("/api/studio/api-keys", { name }),
    onSuccess: async (created) => {
      setKeys((all) => ({ ...all, [client]: created.key }));
      await qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
  if (!me.data) {
    return null;
  }
  const managed = me.data.mode === "managed";
  const url = me.data.mcpUrl ?? "";
  const reachable = isPublicHttps(url);
  const apiKey = keys[client];
  // claude.ai connects from Anthropic's servers and signs in over OAuth: a public, managed server.
  const blocked = client === "claude.ai" && !(managed && reachable);
  let n = 1;

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="font-display font-semibold text-lg">{t("mcp.title")}</h2>
        <p className="mt-1 text-[14px] text-ink-2">{t("mcp.lead")}</p>
        <div className="my-6 flex flex-wrap items-center gap-3 text-[14px]">
          <span className="rounded-full bg-paper-2 px-3.5 py-1.5 ring-1 ring-border-soft">
            {t("mcp.yourClient")}
          </span>
          <span className="flex items-center gap-1.5 font-mono text-[12px] text-ink-3">
            MCP <ArrowRight className="size-4" />
          </span>
          <span className="rounded-full bg-ember-tint px-3.5 py-1.5 font-medium text-ember-strong">
            engenty wizards
          </span>
        </div>
        <h3 className="font-medium text-[14px]">{t("mcp.canTitle")}</h3>
        <ul className="mt-2 flex list-disc flex-col gap-1 pl-5 text-[14px] text-ink-2">
          <li>{t("mcp.can1")}</li>
          <li>{t("mcp.can2")}</li>
          <li>{t("mcp.can3")}</li>
          <li>{t("mcp.can4")}</li>
        </ul>
        <p className="mt-5 text-[13px] text-ink-3">{t("mcp.notReverse")}</p>
      </Card>

      <Card className="p-6">
        <h2 className="mb-6 font-display font-semibold text-lg">{t("mcp.setup")}</h2>
        <ol className="flex flex-col">
          <Step n={n++} title={t("mcp.pick")}>
            <div className="overflow-x-auto">
              <Segmented value={client} onChange={setClient} options={[...CLIENTS]} />
            </div>
          </Step>
          {blocked ? (
            <Step n={n++} title={t("mcp.notHere")}>
              <Hint>{managed ? t("mcp.needsPublic") : t("mcp.claudeAiLocal")}</Hint>
            </Step>
          ) : (
            <>
              {managed ? null : (
                <Step n={n++} title={t("mcp.keyTitle")}>
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
                          onClick={() => create.mutate(client)}
                        >
                          <Plus className="size-4" /> {t("mcp.keyCreate", { client })}
                        </Button>
                      </div>
                    </>
                  )}
                </Step>
              )}
              <Step n={n++} title={t("mcp.add")}>
                {managed || apiKey ? (
                  <AddServer client={client} url={url} apiKey={apiKey} />
                ) : (
                  <Hint>{t("mcp.keyFirst")}</Hint>
                )}
                {managed ? <Hint>{t("mcp.oauth")}</Hint> : null}
              </Step>
              <Step n={n++} title={t("mcp.try")}>
                <Hint>{t("mcp.tryHint")}</Hint>
                <CopyLine text={t("mcp.tryPrompt")} />
              </Step>
            </>
          )}
        </ol>
        <div className="border-border-soft border-t pt-5">
          <h3 className="font-medium text-[14px]">{t("mcp.address")}</h3>
          <div className="mt-2">
            <CopyLine text={url} />
          </div>
          <p className="mt-2 text-[13px] text-ink-3">
            {reachable ? t("mcp.addressPublic") : t("mcp.addressLocal")}
          </p>
        </div>
      </Card>

      {managed ? (
        <Card className="p-6">
          <h2 className="font-display font-semibold text-lg">{t("mcp.keys")}</h2>
          <p className="mt-1 mb-4 text-[14px] text-ink-3">{t("setup.keysInAccount")}</p>
          <div>
            <Button
              variant="secondary"
              onClick={() => window.open(`${me.data?.manageUrl}/account`, "_blank", "noopener")}
            >
              {t("setup.openAccount")}
            </Button>
          </div>
        </Card>
      ) : (
        <KeyList />
      )}
    </div>
  );
}
