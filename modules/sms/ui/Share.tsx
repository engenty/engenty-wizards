import type { StudioShareSectionProps } from "@engenty-wizards/plugin-sdk/studio";
import { Input } from "@engenty-wizards/web/ui";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { renderSVG } from "uqr";
import { api, type Binding, errorText, KEY, t } from "./app";
import { CopyButton } from "./parts";

/** Under the SMS row of the share dialog: the keyword, the link that types it, its QR code. */
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
      await cache.invalidateQueries({ queryKey: [KEY, "binding", wizard.id] });
    },
  });
  const link = binding.data?.link ?? null;
  const svg = useMemo(
    () => (link ? renderSVG(link, { ecc: "M", border: 1, pixelSize: 6 }) : ""),
    [link],
  );
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
    <div className="flex items-start gap-3 rounded-lg bg-paper-2 p-3 text-[0.8125rem]">
      {svg ? (
        <div
          role="img"
          aria-label={t("link")}
          className="size-20 shrink-0 overflow-hidden rounded bg-white [&>svg]:size-full"
          // uqr writes the SVG from the link alone: no markup of anyone else's goes in.
          // biome-ignore lint/security/noDangerouslySetInnerHtml: generated from the URL only
          dangerouslySetInnerHTML={{ __html: svg }}
        />
      ) : null}
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <label className="flex items-center gap-2">
          <span className="shrink-0 text-ink-3">{t("keyword")}</span>
          <Input
            value={keyword}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className="h-8 max-w-xs text-[0.8125rem]"
          />
        </label>
        {link ? (
          <div className="flex min-w-0 items-center gap-1">
            <span className="select-all truncate text-ink-3">{link}</span>
            <CopyButton text={link} />
          </div>
        ) : null}
        <p className="text-ink-3">{t("keywordHint")}</p>
        {save.error ? <p className="text-rose">{errorText(save.error)}</p> : null}
      </div>
    </div>
  );
}
