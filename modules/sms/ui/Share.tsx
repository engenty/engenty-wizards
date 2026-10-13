import type { StudioShareSectionProps } from "@engenty-wizards/plugin-sdk/studio";
import { Input } from "@engenty-wizards/web/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { api, type Binding, errorText, KEY, t } from "./app";

/**
 * In the share dialog's settings, while SMS is on: the keyword that picks the wizard. Its
 * number, its link and the QR code the dialog shows itself, from the runner's address.
 */
export function ShareSection({ wizard }: StudioShareSectionProps) {
  const cache = useQueryClient();
  const binding = useQuery({
    queryKey: [KEY, "binding", wizard.id],
    queryFn: () => api().get<Binding>(`/binding/${wizard.id}`),
  });
  const [draft, setDraft] = useState<string | null>(null);
  const save = useMutation({
    mutationFn: (keyword: string) => api().put<Binding>(`/binding/${wizard.id}`, { keyword }),
    onSuccess: async () => {
      setDraft(null);
      // The dialog's row shows the keyword and the link that writes it.
      await Promise.all([
        cache.invalidateQueries({ queryKey: [KEY, "binding", wizard.id] }),
        cache.invalidateQueries({ queryKey: ["wizard-runners", wizard.id] }),
      ]);
    },
  });
  if (!binding.data) {
    return null;
  }
  const keyword = draft ?? binding.data.keyword;
  const commit = () => {
    if (draft?.trim() && draft.trim() !== binding.data?.keyword) {
      save.mutate(draft);
    } else {
      setDraft(null);
    }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <label className="flex flex-col gap-1.5">
        <span className="font-medium text-[0.875rem]">{t("keyword")}</span>
        <Input
          value={keyword}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.currentTarget.blur();
            }
          }}
          className="max-w-xs"
        />
      </label>
      <p className="text-[0.8125rem] text-ink-3">{t("keywordHint")}</p>
      {save.error ? <p className="text-[0.8125rem] text-rose">{errorText(save.error)}</p> : null}
    </div>
  );
}
