import { MODEL_CLASSES, type ModelClass } from "@engenty-wizards/shared/definition";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router";
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
  const [needsAccount, setNeedsAccount] = useState(false);
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
    <div>
      <Segmented
        value={options.find((o) => o.value === models.source)?.label ?? options[0].label}
        options={options.map((o) => o.label)}
        onChange={(label: string) => {
          const next = options.find((o) => o.label === label)?.value;
          if (!next) {
            return;
          }
          // The account's credits need an account: the way to it, not a click that does nothing.
          if (next === "account" && !me.account) {
            setNeedsAccount(true);
            return;
          }
          setNeedsAccount(false);
          source.mutate(next);
        }}
      />
      {needsAccount && !me.account ? (
        <p className="mt-3 text-[13px] text-ink-2">
          {t("local.sourceNeedsAccount")} <AccountLink />
        </p>
      ) : null}
    </div>
  );
}

/** The way to the one place the account of a local install is linked: Settings → Account. */
function AccountLink() {
  return (
    <Link
      to="/settings/account"
      className="font-medium text-ember-strong underline-offset-2 hover:underline"
    >
      {t("local.toAccount")}
    </Link>
  );
}

/** Settings of a runtime that runs alone: where its models come from. */
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
        me.data.account?.signedIn === false ? (
          // The models run on an account whose sign-in is gone: it is renewed where it was made.
          <p className="mt-3 text-[13px] text-rose">
            {t("local.accountExpired")} <AccountLink />
          </p>
        ) : (
          <p className="mt-3 text-[13px] text-ink-3">{t("local.sourceAccountHint")}</p>
        )
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
