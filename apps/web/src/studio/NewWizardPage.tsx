import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import { useState } from "react";
import { useNavigate, useSearchParams } from "react-router";
import { Mascot } from "../brand";
import { api } from "../lib/api";
import { lang, t } from "../lib/i18n";
import { useCurrentProject } from "../lib/session";
import { Button, Textarea } from "../ui";
import { ImportWizard } from "./ImportWizard";
import { MarketplaceBrowser } from "./Marketplace";

const IDEAS = {
  de: [
    "Stellenanzeige aus ein paar Stichworten, als PDF und LinkedIn-Post",
    "Produktbeschreibung für den Onlineshop mit drei Bildvarianten",
    "Wettbewerbsanalyse zu einer Firma mit Quellen",
    "Lead aus einem Formular in unser CRM eintragen",
  ],
  en: [
    "A job ad from a few keywords, as PDF and LinkedIn post",
    "A shop product description with three image variants",
    "A competitor analysis for a company, with sources",
    "Put a lead from a form into our CRM",
  ],
};

export function NewWizardPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { project } = useCurrentProject();
  const [prompt, setPrompt] = useState("");
  // A link from the gallery names the template to open.
  const [params] = useSearchParams();

  const create = useMutation({
    mutationFn: (starterId?: string) =>
      api.post<{ id: string }>("/api/studio/wizards", { projectId: project!.id, starterId, lang }),
    onSuccess: async ({ id }, starterId) => {
      await qc.invalidateQueries({ queryKey: ["projects"] });
      await qc.invalidateQueries({ queryKey: ["wizards"] });
      navigate(
        starterId ? `/edit/${id}` : `/edit/${id}?prompt=${encodeURIComponent(prompt.trim())}`,
      );
    },
  });

  const submit = () => {
    if (prompt.trim() && project) {
      create.mutate(undefined);
    }
  };

  return (
    <div className="animate-rise pt-4">
      <div className="mx-auto max-w-2xl">
        <div className="flex flex-col items-center text-center">
          <Mascot kind="sprout" size={150} fluffy />
          <h1 className="mt-2 font-display font-semibold text-[32px] leading-tight tracking-tight sm:text-[38px]">
            {t("new.title")}
          </h1>
        </div>
        <div className="mt-8 rounded-2xl bg-card p-2 shadow-elevated ring-1 ring-border-soft focus-within:ring-focus">
          <Textarea
            autoFocus
            minRows={4}
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                submit();
              }
            }}
            placeholder={t("new.placeholder")}
            className="border-0 bg-transparent text-[16px] shadow-none focus:ring-0"
          />
          <div className="flex items-center justify-between gap-3 px-2 pb-1">
            <span className="hidden text-[12px] text-ink-4 sm:block">{t("new.hint")}</span>
            <Button
              size="md"
              onClick={submit}
              busy={create.isPending && !create.variables}
              disabled={!prompt.trim()}
            >
              {t("new.build")} <ArrowRight className="size-4" />
            </Button>
          </div>
        </div>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {IDEAS[lang].map((idea) => (
            <button
              key={idea}
              type="button"
              onClick={() => setPrompt(idea)}
              className="rounded-full bg-paper-2 px-3.5 py-1.5 text-[13px] text-ink-2 transition hover:bg-paper-3 hover:text-ink"
            >
              {idea}
            </button>
          ))}
        </div>
      </div>

      <section className="mx-auto max-w-5xl">
        <h2 className="mt-16 mb-5 text-center font-medium text-[13px] text-ink-3 uppercase tracking-[0.08em]">
          {t("new.orStarter")}
        </h2>
        <MarketplaceBrowser
          open={params.get("starter")}
          busy={create.isPending && Boolean(create.variables)}
          onUse={(entry) => project && !create.isPending && create.mutate(entry.id)}
        />
        {create.error ? (
          <p className="mt-3 text-center text-[14px] text-rose">
            {(create.error as Error).message}
          </p>
        ) : null}
      </section>
      <div className="mt-8 flex justify-center">
        <ImportWizard variant="ghost" label={t("new.import")} />
      </div>
    </div>
  );
}
