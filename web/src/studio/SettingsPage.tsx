import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Copy, KeyRound, Plug, Plus, Trash2, Upload } from "lucide-react";
import { type ReactNode, useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import { type Project, useCurrentProject, useMe } from "../lib/session";
import { Button, Card, IconButton, Input, Label, Segmented, Swatch, Textarea } from "../ui";
import { Connectors } from "./Connectors";
import { ProjectSwitcher } from "./HomePage";

type Server = Project["mcpServers"][number] & { auth?: string };

function slugId(name: string, taken: string[]): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .replace(/^[^a-z]+/, "")
      .slice(0, 24) || "system";
  let id = base;
  let i = 2;
  while (taken.includes(id)) {
    id = `${base}_${i++}`;
  }
  return id;
}

function ProjectForm({ project }: { project: Project }) {
  const qc = useQueryClient();
  const [name, setName] = useState(project.name);
  const [brandName, setBrandName] = useState(project.brand.name ?? "");
  const [details, setDetails] = useState(project.brand.details ?? "");
  const [accent, setAccent] = useState(project.brand.accent ?? "");
  const [servers, setServers] = useState<Server[]>(
    project.mcpServers.map((s) => ({
      ...s,
      auth: s.headers?.Authorization ?? s.headers?.authorization ?? "",
    })),
  );
  const [saved, setSaved] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const save = useMutation({
    mutationFn: () =>
      api.patch(`/api/studio/projects/${project.id}`, {
        name,
        brand: { name: brandName, details, accent },
        mcpServers: servers
          .filter((s) => s.name && s.url)
          .map(({ auth, headers, ...s }) => ({
            ...s,
            headers: auth ? { ...headers, Authorization: auth } : undefined,
          })),
      }),
    onSuccess: async () => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
      setSaved(true);
      setTimeout(() => setSaved(false), 1800);
    },
  });
  const logo = useMutation({
    mutationFn: (file: File) => api.upload(`/api/studio/projects/${project.id}/logo`, file),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/api/studio/projects/${project.id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["projects"] }),
  });

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6">
        <h2 className="mb-5 font-display font-semibold text-lg">{t("settings.project")}</h2>
        <Label>{t("settings.name")}</Label>
        <Input value={name} onChange={(e) => setName(e.target.value)} />
      </Card>

      <Card className="p-6">
        <h2 className="font-display font-semibold text-lg">{t("settings.brand")}</h2>
        <p className="mt-1 mb-5 text-[14px] text-ink-3">{t("settings.brandHint")}</p>
        <div className="flex flex-col gap-5">
          <div>
            <Label>{t("settings.brandName")}</Label>
            <Input value={brandName} onChange={(e) => setBrandName(e.target.value)} />
          </div>
          <div>
            <Label>{t("settings.brandDetails")}</Label>
            <Textarea minRows={4} value={details} onChange={(e) => setDetails(e.target.value)} />
          </div>
          <div className="flex flex-wrap gap-8">
            <div>
              <Label>{t("settings.accent")}</Label>
              <div className="flex items-center gap-3">
                <Swatch value={accent || "#e0531b"} onChange={(e) => setAccent(e.target.value)} />
                <Input
                  value={accent}
                  placeholder="#e0531b"
                  onChange={(e) => setAccent(e.target.value)}
                  className="w-32"
                />
              </div>
            </div>
            <div>
              <Label>{t("settings.logo")}</Label>
              <div className="flex items-center gap-3">
                {project.brand.logoAssetId ? (
                  <img
                    src={`/api/public/logos/${project.brand.logoAssetId}`}
                    alt=""
                    className="h-11 max-w-[140px] rounded-md object-contain"
                  />
                ) : null}
                <Button
                  variant="secondary"
                  busy={logo.isPending}
                  onClick={() => fileInput.current?.click()}
                >
                  <Upload className="size-4" /> {t("settings.logo")}
                </Button>
                <input
                  ref={fileInput}
                  hidden
                  type="file"
                  accept="image/*"
                  onChange={(e) => e.target.files?.[0] && logo.mutate(e.target.files[0])}
                />
              </div>
            </div>
          </div>
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display font-semibold text-lg">{t("settings.mcp")}</h2>
        <p className="mt-1 mb-5 text-[14px] text-ink-3">{t("settings.mcpHint")}</p>
        <div className="flex flex-col gap-3">
          {servers.map((s, i) => (
            <div
              key={i}
              className="grid gap-2 rounded-lg bg-paper p-3 ring-1 ring-border-soft sm:grid-cols-[1fr_2fr_auto]"
            >
              <Input
                placeholder={t("settings.serverName")}
                value={s.name}
                onChange={(e) =>
                  setServers((all) =>
                    all.map((x, j) =>
                      j === i
                        ? {
                            ...x,
                            name: e.target.value,
                            id:
                              x.id ||
                              slugId(
                                e.target.value,
                                all.map((y) => y.id),
                              ),
                          }
                        : x,
                    ),
                  )
                }
              />
              <Input
                placeholder={`${t("settings.serverUrl")} (https://…/mcp)`}
                value={s.url}
                onChange={(e) =>
                  setServers((all) =>
                    all.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)),
                  )
                }
              />
              <IconButton
                label="Entfernen"
                onClick={() => setServers((all) => all.filter((_, j) => j !== i))}
                className="hover:text-rose"
              >
                <Trash2 className="size-4" />
              </IconButton>
              <Input
                className="sm:col-span-2"
                placeholder={t("settings.serverHeader")}
                value={s.auth ?? ""}
                onChange={(e) =>
                  setServers((all) =>
                    all.map((x, j) => (j === i ? { ...x, auth: e.target.value } : x)),
                  )
                }
              />
              {s.id ? (
                <span className="self-center font-mono text-[11px] text-ink-4">{s.id}</span>
              ) : null}
            </div>
          ))}
          <Button
            variant="secondary"
            className="self-start"
            onClick={() => setServers((all) => [...all, { id: "", name: "", url: "", auth: "" }])}
          >
            <Plus className="size-4" /> {t("settings.addServer")}
          </Button>
        </div>
      </Card>

      <div className="flex items-center justify-between">
        <Button
          variant="danger"
          busy={remove.isPending}
          onClick={() => confirm(`${t("settings.delete")}?`) && remove.mutate()}
        >
          {t("settings.delete")}
        </Button>
        <Button busy={save.isPending} onClick={() => save.mutate()}>
          {saved ? t("settings.saved") : t("settings.save")}
        </Button>
      </div>
      {save.error ? <p className="text-[14px] text-rose">{(save.error as Error).message}</p> : null}
    </div>
  );
}

interface ApiKeyRow {
  id: string;
  name: string | null;
  start: string | null;
  createdAt: string;
  lastRequest: string | null;
}

function CopyLine({ text }: { text: string }) {
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

interface ConnectionRow {
  clientId: string;
  name: string | null;
  uri: string | null;
  scopes: string[];
  connectedAt: string;
  lastUsed: string;
}

/** Apps connected over OAuth; disconnecting removes the consent and the app's tokens at once. */
function ConnectedClients() {
  const qc = useQueryClient();
  const list = useQuery({
    queryKey: ["connections"],
    queryFn: () => api.get<ConnectionRow[]>("/api/studio/connections"),
  });
  const disconnect = useMutation({
    mutationFn: (clientId: string) =>
      api.del(`/api/studio/connections/${encodeURIComponent(clientId)}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["connections"] }),
  });
  if (!list.data?.length) {
    return null;
  }
  return (
    <div className="mt-6">
      <Label>{t("settings.connectedClients")}</Label>
      <div className="flex flex-col gap-2">
        {list.data.map((c) => (
          <div
            key={c.clientId}
            className="flex items-center gap-3 rounded-lg bg-paper px-3 py-2 ring-1 ring-border-soft"
          >
            <Plug className="size-4 shrink-0 text-ink-4" />
            <div className="min-w-0 flex-1">
              <div className="truncate text-[14px]">{c.name ?? c.clientId}</div>
              <div className="text-[12px] text-ink-4">
                {t("settings.lastUsed", { when: new Date(c.lastUsed).toLocaleString() })}
              </div>
            </div>
            <Button
              variant="ghost"
              busy={disconnect.isPending && disconnect.variables === c.clientId}
              onClick={() => disconnect.mutate(c.clientId)}
            >
              {t("settings.disconnect")}
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}

const CLIENTS = ["Claude Code", "claude.ai & Desktop", "Codex", "Cursor", "Scripts"] as const;
type ClientTab = (typeof CLIENTS)[number];

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

function Step({ text, children }: { text: string; children?: ReactNode }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-[14px] text-ink-2">{text}</p>
      {children}
    </div>
  );
}

/** What to paste where, per client. All of them sign in over OAuth on first use. */
function ClientSetup({ client, url }: { client: Exclude<ClientTab, "Scripts">; url: string }) {
  const publicHttps = isPublicHttps(url);
  const plugin = url.replace(/\/api\/mcp$/, "/api/claude-plugin");
  const local = publicHttps ? null : (
    <p className="text-[13px] text-ink-3">{t("setup.needsPublic")}</p>
  );
  switch (client) {
    case "Claude Code":
      return (
        <div className="flex flex-col gap-5">
          {publicHttps ? (
            <Step text={t("setup.ccPlugin")}>
              <CopyLine text={`claude plugin marketplace add ${plugin}/marketplace.json`} />
              <CopyLine text="claude plugin install engenty-wizards@engenty" />
            </Step>
          ) : null}
          <Step text={publicHttps ? t("setup.ccServerOnly") : t("setup.ccServer")}>
            <CopyLine
              text={`claude mcp add --transport http --scope user engenty-wizards ${url}`}
            />
          </Step>
          <p className="text-[13px] text-ink-3">{t("setup.ccAuth")}</p>
        </div>
      );
    case "claude.ai & Desktop":
      return (
        <div className="flex flex-col gap-5">
          <Step text={t("setup.claudeAi")}>
            <CopyLine text={url} />
          </Step>
          {local}
        </div>
      );
    case "Codex":
      return (
        <div className="flex flex-col gap-5">
          <Step text={t("setup.codex")}>
            <CopyLine text={`codex mcp add engenty-wizards --url ${url}`} />
            <CopyLine text="codex mcp login engenty-wizards" />
          </Step>
        </div>
      );
    case "Cursor":
      return (
        <div className="flex flex-col gap-5">
          <Step text={t("setup.cursor")}>
            <CopyLine
              text={JSON.stringify({ mcpServers: { "engenty-wizards": { url } } }, null, 2)}
            />
          </Step>
          <p className="text-[13px] text-ink-3">{t("setup.cursorFallback")}</p>
        </div>
      );
  }
}

/** Personal keys for scripts and clients without OAuth; they act with every right. */
function ApiKeys({ url }: { url: string }) {
  const qc = useQueryClient();
  const [name, setName] = useState("Script");
  const [created, setCreated] = useState<{ name: string; key: string } | null>(null);
  const keys = useQuery({
    queryKey: ["api-keys"],
    queryFn: () => api.get<ApiKeyRow[]>("/api/studio/api-keys"),
  });
  const create = useMutation({
    mutationFn: () =>
      api.post<{ id: string; name: string; key: string }>("/api/studio/api-keys", { name }),
    onSuccess: async (key) => {
      setCreated({ name: key.name, key: key.key });
      await qc.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });
  const revoke = useMutation({
    mutationFn: (id: string) => api.del(`/api/studio/api-keys/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["api-keys"] }),
  });
  return (
    <div className="flex flex-col gap-2">
      <p className="mb-2 text-[14px] text-ink-2">{t("setup.scripts")}</p>
      {(keys.data ?? []).map((k) => (
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
      <div className="mt-2 flex flex-wrap items-end gap-3">
        <div className="min-w-48 flex-1">
          <Label>{t("settings.keyName")}</Label>
          <Input value={name} maxLength={32} onChange={(e) => setName(e.target.value)} />
        </div>
        <Button
          variant="secondary"
          busy={create.isPending}
          disabled={!name.trim()}
          onClick={() => create.mutate()}
        >
          <Plus className="size-4" /> {t("settings.createKey")}
        </Button>
      </div>
      {created ? (
        <div className="mt-5 flex flex-col gap-3">
          <p className="text-[14px] text-ink-2">{t("settings.keyOnce")}</p>
          <CopyLine
            text={`claude mcp add --transport http engenty-wizards ${url} --header "Authorization: Bearer ${created.key}"`}
          />
          <p className="text-[13px] text-ink-3">{t("settings.keyOther", { url })}</p>
        </div>
      ) : null}
    </div>
  );
}

/** The admin's own MCP clients build the wizards — on their own subscription. */
function ConnectCard() {
  const me = useMe();
  const [client, setClient] = useState<ClientTab>("Claude Code");
  const url = me.data?.mcpUrl ?? "";
  return (
    <Card className="p-6">
      <h2 className="font-display font-semibold text-lg">{t("settings.connect")}</h2>
      <p className="mt-1 mb-5 text-[14px] text-ink-3">{t("settings.connectHint")}</p>
      <div className="mb-5 overflow-x-auto">
        <Segmented value={client} onChange={setClient} options={[...CLIENTS]} />
      </div>
      {client === "Scripts" ? <ApiKeys url={url} /> : <ClientSetup client={client} url={url} />}
      <ConnectedClients />
    </Card>
  );
}

export function SettingsPage() {
  const { project } = useCurrentProject();
  const [key, setKey] = useState(project?.id);
  useEffect(() => setKey(project?.id), [project?.id]);
  return (
    <div className="mx-auto max-w-2xl animate-rise">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="font-display font-semibold text-[28px] tracking-tight">
          {t("settings.title")}
        </h1>
        <ProjectSwitcher />
      </div>
      <div className="mt-8">{project ? <ProjectForm key={key} project={project} /> : null}</div>
      {project ? (
        <div className="mt-6">
          <Connectors key={key} projectId={project.id} />
        </div>
      ) : null}
      <div className="mt-6">
        <ConnectCard />
      </div>
    </div>
  );
}
