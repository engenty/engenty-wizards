import { MODEL_CLASSES, type ModelClass } from "@engenty-wizards/shared/definition";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Check } from "lucide-react";
import { useState } from "react";
import { api } from "../lib/api";
import { t } from "../lib/i18n";
import type { LocalModels } from "../lib/session";
import { Button, Input, Label } from "../ui";

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
        <p className="mb-3 text-[0.8125rem] text-ink-3">{t("local.keysHint")}</p>
        <div className="flex flex-col gap-2">
          {(Object.keys(KEY_LABEL) as KeyName[]).map((name) => (
            <div key={name} className="flex flex-wrap items-center gap-2">
              <span className="w-40 text-[0.875rem] text-ink-2">{KEY_LABEL[name]}</span>
              <Input
                type="password"
                autoComplete="off"
                className="min-w-0 flex-1 font-mono text-[0.8125rem]"
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
        <p className="mb-3 text-[0.8125rem] text-ink-3">{t("local.classesHint")}</p>
        <div className="flex flex-col gap-2">
          {MODEL_CLASSES.map((cls: ModelClass) => (
            <div key={cls} className="flex flex-wrap items-center gap-2">
              <span className="w-40 text-[0.875rem] text-ink-2">{t(`class.${cls}`)}</span>
              <Input
                className="min-w-0 flex-1 font-mono text-[0.8125rem]"
                value={bindings[cls] ?? ""}
                onChange={(e) => setBindings({ ...bindings, [cls]: e.target.value })}
              />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-2">
            <span className="w-40 text-[0.875rem] text-ink-2">Ollama</span>
            <Input
              className="min-w-0 flex-1 font-mono text-[0.8125rem]"
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
