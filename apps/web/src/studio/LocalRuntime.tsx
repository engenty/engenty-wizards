import { MODEL_CLASSES, type ModelClass } from "@engenty-wizards/shared/definition";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, ExternalLink, LogOut } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../lib/api";
import { features } from "../lib/features";
import { t } from "../lib/i18n";
import { type LocalModels, type Me, useMe } from "../lib/session";
import { Button, Card, Input, Label, Segmented } from "../ui";
import { HarnessPanel, ModelTest } from "./Harness";

/** Opens a page in the person's own browser — also from inside the desktop app's window. */
export function openExternal(url: string) {
  const desktop = (window as { engentyDesktop?: { open(url: string): void } }).engentyDesktop;
  if (desktop) {
    desktop.open(url);
  } else {
    window.open(url, "_blank", "noopener");
  }
}

const KEY_LABEL = {
  gateway: "Vercel AI Gateway",
  anthropic: "Anthropic",
  openai: "OpenAI",
} as const;
type KeyName = keyof typeof KEY_LABEL;

/** The account a runtime that runs alone can be linked to: its credits and the cloud to publish to. */
function Account({ me }: { me: Me }) {
  const qc = useQueryClient();
  const [waiting, setWaiting] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval>>(undefined);
  const link = useMutation({
    mutationFn: () => api.post<{ url: string }>("/api/studio/account/link"),
    onSuccess: ({ url }) => {
      openExternal(url);
      setWaiting(true);
    },
  });
  const unlink = useMutation({
    mutationFn: () => api.del("/api/studio/account"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  // Sign-in finishes in the browser; the studio notices by asking again.
  useEffect(() => {
    if (!waiting) {
      return;
    }
    timer.current = setInterval(() => void qc.invalidateQueries({ queryKey: ["me"] }), 2000);
    const stop = setTimeout(() => setWaiting(false), 5 * 60_000);
    return () => {
      clearInterval(timer.current);
      clearTimeout(stop);
    };
  }, [waiting, qc]);
  useEffect(() => {
    if (me.account) {
      setWaiting(false);
    }
  }, [me.account]);

  if (!me.account) {
    return (
      <div className="flex flex-col gap-3">
        <p className="text-[14px] text-ink-2">{t("local.accountHint")}</p>
        <div>
          <Button busy={link.isPending || waiting} onClick={() => link.mutate()}>
            {waiting ? t("local.accountWaiting") : t("local.accountSignIn")}
          </Button>
        </div>
        {link.isError ? <p className="text-[13px] text-rose">{t("local.accountFailed")}</p> : null}
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg bg-paper px-3 py-2.5 ring-1 ring-border-soft">
      <div className="min-w-0 flex-1">
        <div className="truncate text-[14px]">{me.account.name || me.account.email}</div>
        <div className="truncate text-[12px] text-ink-3">
          {me.account.signedIn
            ? me.account.credits === null
              ? me.account.email
              : `${me.account.email} · ${t("nav.credits", { n: Math.floor(me.account.credits).toLocaleString() })}`
            : t("local.accountExpired")}
        </div>
      </div>
      <Button variant="ghost" size="sm" onClick={() => openExternal(`${me.account?.url}/billing`)}>
        <ExternalLink className="size-3.5" /> {t("local.topUp")}
      </Button>
      <Button variant="ghost" size="sm" busy={unlink.isPending} onClick={() => unlink.mutate()}>
        <LogOut className="size-3.5" /> {t("nav.logout")}
      </Button>
    </div>
  );
}

export function OwnModels({ models }: { models: LocalModels }) {
  const qc = useQueryClient();
  const [keys, setKeys] = useState<Partial<Record<KeyName, string>>>({});
  const [bindings, setBindings] = useState(models.bindings);
  const [ollamaUrl, setOllamaUrl] = useState(models.ollamaUrl);
  const [saved, setSaved] = useState(false);
  const save = useMutation({
    mutationFn: () => api.put("/api/studio/local/models", { keys, bindings, ollamaUrl }),
    onSuccess: async () => {
      setKeys({});
      setSaved(true);
      setTimeout(() => setSaved(false), 1500);
      await qc.invalidateQueries({ queryKey: ["me"] });
    },
  });
  return (
    <div className="flex flex-col gap-5">
      <div>
        <Label>{t("local.keys")}</Label>
        <p className="mb-3 text-[13px] text-ink-3">{t("local.keysHint")}</p>
        <div className="flex flex-col gap-2">
          {(Object.keys(KEY_LABEL) as KeyName[]).map((name) => (
            <div key={name} className="flex flex-wrap items-center gap-2">
              <span className="w-40 text-[14px] text-ink-2">{KEY_LABEL[name]}</span>
              <Input
                type="password"
                autoComplete="off"
                className="min-w-0 flex-1 font-mono text-[13px]"
                placeholder={models.keys[name] ? t("local.keySet") : t("local.keyEmpty")}
                value={keys[name] ?? ""}
                onChange={(e) => setKeys({ ...keys, [name]: e.target.value })}
              />
              {models.keys[name] ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setKeys({ ...keys, [name]: "" });
                    void api
                      .put("/api/studio/local/models", { keys: { [name]: "" } })
                      .then(() => qc.invalidateQueries({ queryKey: ["me"] }));
                  }}
                >
                  {t("local.keyRemove")}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </div>
      <div>
        <Label>{t("local.classes")}</Label>
        <p className="mb-3 text-[13px] text-ink-3">{t("local.classesHint")}</p>
        <div className="flex flex-col gap-2">
          {MODEL_CLASSES.map((cls: ModelClass) => (
            <div key={cls} className="flex flex-wrap items-center gap-2">
              <span className="w-40 text-[14px] text-ink-2">{t(`class.${cls}`)}</span>
              <Input
                className="min-w-0 flex-1 font-mono text-[13px]"
                value={bindings[cls] ?? ""}
                onChange={(e) => setBindings({ ...bindings, [cls]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-40 text-[14px] text-ink-2">Ollama</span>
            <Input
              className="min-w-0 flex-1 font-mono text-[13px]"
              value={ollamaUrl}
              onChange={(e) => setOllamaUrl(e.target.value)}
            />
          </div>
        </div>
      </div>
      <div>
        <Button variant="secondary" busy={save.isPending} onClick={() => save.mutate()}>
          {saved ? <Check className="size-4" /> : null}
          {saved ? t("local.saved") : t("local.save")}
        </Button>
      </div>
    </div>
  );
}

type Source = LocalModels["source"];

/** Where the models of a runtime that runs alone come from; the choices this machine offers. */
export function SourcePicker({ me }: { me: Me }) {
  const qc = useQueryClient();
  const models = me.models;
  const source = useMutation({
    mutationFn: (next: Source) => api.put("/api/studio/local/models", { source: next }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  if (!models) {
    return null;
  }
  const options: { value: Source; label: string }[] = [
    // The installed clients, and the one chosen even if it went missing.
    ...me.harnesses
      .filter((h) => h.version !== null || models.source === h.id)
      .map((h) => ({ value: h.id, label: h.name })),
    { value: "own", label: t("local.sourceOwn") },
    ...(features.account ? [{ value: "account" as const, label: t("local.sourceAccount") }] : []),
  ];
  if (options.length < 2) {
    return null;
  }
  return (
    <Segmented
      value={options.find((o) => o.value === models.source)?.label ?? options[0].label}
      options={options.map((o) => o.label)}
      onChange={(label: string) => {
        const next = options.find((o) => o.label === label)?.value;
        if (!next || (next === "account" && !me.account)) {
          return;
        }
        source.mutate(next);
      }}
    />
  );
}

/** Settings of a runtime that runs alone: the linked account, and where its models come from. */
export function LocalRuntimeCard() {
  const me = useMe();
  const qc = useQueryClient();
  const chat = useMutation({
    mutationFn: (engine: "models" | "claude") => api.put("/api/studio/local/chat", { engine }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["me"] }),
  });
  if (!me.data?.models || me.data.mode !== "local") {
    return null;
  }
  const models = me.data.models;
  return (
    <Card className="p-6">
      <h2 className="font-display font-semibold text-lg">{t("local.title")}</h2>
      <p className="mt-1 mb-5 text-[14px] text-ink-3">{t("local.hint")}</p>
      {features.account ? (
        <div className="mb-6">
          <Label>{t("local.account")}</Label>
          <Account me={me.data} />
        </div>
      ) : null}
      <Label>{t("local.source")}</Label>
      <SourcePicker me={me.data} />
      {me.data.harnesses.some((h) => h.id === models.source) ? (
        <div className="mt-4 flex flex-col gap-4">
          <HarnessPanel me={me.data} id={models.source as Exclude<Source, "own" | "account">} />
          <div className="mt-2 border-border-soft border-t pt-5">
            <OwnModels models={models} />
          </div>
        </div>
      ) : models.source === "account" ? (
        <p className="mt-3 text-[13px] text-ink-3">{t("local.sourceAccountHint")}</p>
      ) : (
        <div className="mt-5 flex flex-col gap-5">
          <OwnModels models={models} />
          <ModelTest />
        </div>
      )}
      {me.data.subscriptions.includes("claude") ? (
        <div className="mt-6 border-border-soft border-t pt-5">
          <Label>{t("local.chat")}</Label>
          <Segmented
            value={me.data.chatEngine === "claude" ? t("local.chatClaude") : t("local.chatModels")}
            options={[t("local.chatModels"), t("local.chatClaude")]}
            onChange={(label: string) =>
              chat.mutate(label === t("local.chatClaude") ? "claude" : "models")
            }
          />
          <p className="mt-3 text-[13px] text-ink-3">{t("local.subscription")}</p>
        </div>
      ) : null}
    </Card>
  );
}
