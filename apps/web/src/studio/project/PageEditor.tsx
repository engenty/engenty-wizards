import type { SpacePage } from "@engenty-wizards/shared/space-data";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Trash2 } from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api";
import { t } from "../../lib/i18n";
import { Markdown } from "../../runner/outputs";
import { Card, cn, IconButton, Spinner } from "../../ui";
import { useAutosave } from "./data";

/** The page once it is loaded: its title and text, saved a moment after they stop changing. */
function Editor({ page, onGone }: { page: SpacePage; onGone: () => void }) {
  const qc = useQueryClient();
  const [title, setTitle] = useState(page.title);
  const [markdown, setMarkdown] = useState(page.markdown);
  // An empty page opens to be written; a written one opens to be read.
  const [writing, setWriting] = useState(!page.markdown);
  const listed = () => qc.invalidateQueries({ queryKey: ["space-data", page.projectId] });
  const status = useAutosave({ title: title.trim() || page.title, markdown }, async (patch) => {
    await api.patch(`/api/studio/pages/${page.id}`, patch);
    // Opened again later, the page shows what was saved.
    qc.setQueryData<SpacePage>(["space-page", page.id], (old) =>
      old ? { ...old, ...patch } : old,
    );
    if (patch.title !== page.title) {
      await listed();
    }
  });
  const remove = useMutation({
    mutationFn: () => api.del(`/api/studio/pages/${page.id}`),
    onSuccess: async () => {
      await listed();
      onGone();
    },
  });
  const readOnly = page.readOnly;
  const tab = (on: boolean, label: string, onClick: () => void) => (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 text-[0.8125rem] transition",
        on ? "bg-paper-2 font-medium text-ink" : "text-ink-3 hover:text-ink",
      )}
    >
      {label}
    </button>
  );
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-center gap-2 px-1">
        <input
          value={title}
          disabled={readOnly}
          maxLength={200}
          onChange={(e) => setTitle(e.target.value)}
          aria-label={t("data.title")}
          className="-ml-1 min-w-0 flex-1 rounded-md bg-transparent px-1 font-display font-semibold text-lg outline-none hover:bg-accent focus:bg-paper focus:ring-1 focus:ring-ring disabled:hover:bg-transparent"
        />
        {status.state === "saving" ? (
          <Spinner className="size-3.5 text-ink-3" />
        ) : status.state === "saved" ? (
          <Check className="size-4 text-moss" aria-label={t("settings.saved")} />
        ) : null}
        {readOnly ? null : (
          <IconButton
            label={t("data.deletePage")}
            onClick={() =>
              confirm(t("data.confirmDelete", { title: page.title })) && remove.mutate()
            }
            className="hover:text-rose"
          >
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </div>
      <Card className="flex flex-col">
        {readOnly ? null : (
          <div className="flex items-center gap-1 border-border-soft border-b px-2 py-1.5">
            {tab(writing, t("data.write"), () => setWriting(true))}
            {tab(!writing, t("data.preview"), () => setWriting(false))}
            <span className="ml-auto truncate px-2 text-[0.75rem] text-ink-4 max-sm:hidden">
              {t("data.markdownHint")}
            </span>
          </div>
        )}
        {writing && !readOnly ? (
          <textarea
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            aria-label={page.title}
            placeholder={t("data.pageEmpty")}
            className="field-sizing-content min-h-[50vh] w-full resize-none bg-transparent p-4 font-mono text-[0.8125rem] leading-relaxed outline-none placeholder:text-ink-4 sm:p-5"
          />
        ) : (
          <div className="min-h-40 p-4 sm:p-5">
            {markdown.trim() ? (
              <Markdown text={markdown} />
            ) : (
              <p className="text-[0.875rem] text-ink-3">{t("data.pageEmpty")}</p>
            )}
          </div>
        )}
      </Card>
      {status.state === "error" && status.error ? (
        <p className="px-1 text-[0.875rem] text-rose">{status.error}</p>
      ) : null}
    </section>
  );
}

/** A page of the space: a title and markdown, written and read in place. */
export function PageEditor({ pageId, onGone }: { pageId: string; onGone: () => void }) {
  const page = useQuery({
    queryKey: ["space-page", pageId],
    queryFn: () => api.get<SpacePage>(`/api/studio/pages/${pageId}`),
    // What the person writes is the truth while the page is open.
    refetchOnWindowFocus: false,
  });
  if (!page.data) {
    return page.isError ? (
      <p className="text-[0.875rem] text-rose">{(page.error as Error).message}</p>
    ) : null;
  }
  return <Editor key={page.data.id} page={page.data} onGone={onGone} />;
}
