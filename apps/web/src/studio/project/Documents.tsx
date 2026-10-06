import type { ProjectFileView } from "@engenty-wizards/shared/projects";
import { useQuery } from "@tanstack/react-query";
import {
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  RefreshCw,
  Trash2,
  Upload,
} from "lucide-react";
import { useState } from "react";
import { api } from "../../lib/api";
import { t } from "../../lib/i18n";
import { Markdown } from "../../runner/outputs";
import { Chip, cn, Dialog, IconButton, Spinner } from "../../ui";
import { fileSize, fileUrl, type ProjectFiles, useFileActions, useLayout } from "./data";
import { type Actions, Description, remove } from "./Files";
import { DropArea, ListControls, SearchField, Section } from "./Section";

/** A document as the models read it: its text as Markdown, or the start of it. */
function useDocumentText(projectId: string, file: ProjectFileView, limit: number) {
  return useQuery({
    // A document read again has another length: its text is fetched again.
    queryKey: ["project-file-text", file.id, file.chars, limit],
    queryFn: () =>
      api.get<{ text: string; chars: number }>(
        `/api/studio/projects/${projectId}/files/${file.id}/text?limit=${limit}`,
      ),
    enabled: file.status === "ready",
    staleTime: 60_000,
  });
}

function typeLabel(file: ProjectFileView): string {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  return (ext || file.mime.split("/").pop() || "").toUpperCase().slice(0, 5);
}

const meta = (file: ProjectFileView) =>
  [typeLabel(file), file.pages ? t("project.pages", { n: file.pages }) : null, fileSize(file.size)]
    .filter(Boolean)
    .join(" · ");

function Status({ file }: { file: ProjectFileView }) {
  if (file.status === "pending") {
    return (
      <span className="inline-flex items-center gap-1.5 text-[0.75rem] text-ink-3">
        <Spinner className="size-3" /> {t("project.reading")}
      </span>
    );
  }
  if (file.status === "failed") {
    return <span className="text-[0.75rem] text-rose">{file.error}</span>;
  }
  return file.indexed ? (
    <Chip tone="live">
      {file.indexed === "embeddings" ? t("project.indexed") : t("project.indexedKeywords")}
    </Chip>
  ) : (
    <Chip tone="warn">{t("project.notIndexed")}</Chip>
  );
}

interface ItemProps {
  projectId: string;
  file: ProjectFileView;
  actions: Actions;
  onPreview: () => void;
}

function RowActions({ file, actions, onPreview }: Omit<ItemProps, "projectId">) {
  return (
    <>
      <IconButton label={t("project.preview")} onClick={onPreview}>
        <Eye className="size-4" />
      </IconButton>
      {file.status !== "pending" && !actions.readOnly ? (
        <IconButton label={t("project.reindex")} onClick={() => actions.reindex(file.id)}>
          <RefreshCw className="size-4" />
        </IconButton>
      ) : null}
      {actions.readOnly ? null : (
        <IconButton
          label={t("project.remove")}
          onClick={() => remove(file, actions)}
          className="hover:text-rose"
        >
          <Trash2 className="size-4" />
        </IconButton>
      )}
    </>
  );
}

function DocumentRow({ file, actions, onPreview }: ItemProps) {
  const table = /sheet|csv|excel/.test(file.mime);
  return (
    <li className="flex gap-3 rounded-lg bg-paper p-3 ring-1 ring-border-soft">
      <div className="mt-0.5 text-ink-3">
        {table ? <FileSpreadsheet className="size-5" /> : <FileText className="size-5" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <button
            type="button"
            onClick={onPreview}
            title={file.name}
            className="min-w-0 truncate font-medium text-[0.875rem] hover:underline"
          >
            {file.name}
          </button>
          <span className="text-[0.75rem] text-ink-3">{meta(file)}</span>
          <Status file={file} />
        </div>
        <Description file={file} actions={actions} />
      </div>
      <div className="-my-1 flex shrink-0 items-start">
        <RowActions file={file} actions={actions} onPreview={onPreview} />
      </div>
    </li>
  );
}

/** The start of the document as a small page: what opening it would show. */
function Page({ projectId, file }: { projectId: string; file: ProjectFileView }) {
  const start = useDocumentText(projectId, file, 1500);
  if (file.mime.startsWith("image/")) {
    return <img src={fileUrl(projectId, file.id)} alt="" className="size-full object-cover" />;
  }
  if (file.status === "pending" || start.isLoading) {
    return (
      <div className="flex size-full items-center justify-center text-ink-4">
        <Spinner className="size-5" />
      </div>
    );
  }
  return (
    <>
      <div className="w-[222%] origin-top-left scale-[0.45] p-6">
        <Markdown text={start.data?.text ?? ""} />
      </div>
      <div className="absolute inset-x-0 bottom-0 h-12 bg-linear-to-t from-card to-transparent" />
    </>
  );
}

function DocumentCard({ projectId, file, actions, onPreview }: ItemProps) {
  return (
    <li className="group flex flex-col gap-1.5 rounded-lg bg-paper p-2 pb-2.5 ring-1 ring-border-soft">
      <div className="relative">
        <button
          type="button"
          onClick={onPreview}
          aria-label={`${t("project.preview")}: ${file.name}`}
          className="relative block h-44 w-full overflow-hidden rounded-md bg-card text-left ring-1 ring-border-soft transition hover:ring-border"
        >
          <Page projectId={projectId} file={file} />
        </button>
        <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100 coarse:opacity-100 [&>button]:size-8 [&>button]:bg-card [&>button]:shadow-soft">
          <RowActions file={file} actions={actions} onPreview={onPreview} />
        </div>
      </div>
      <div className="mt-1 flex flex-col gap-1 px-0.5">
        <div className="truncate font-medium text-[0.8125rem]" title={file.name}>
          {file.name}
        </div>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <span className="text-[0.75rem] text-ink-3">{meta(file)}</span>
          <Status file={file} />
        </div>
      </div>
      <Description file={file} actions={actions} />
    </li>
  );
}

const TEXT_LIMIT = 200_000;

/**
 * A document, opened: the file itself where the browser can show it (a PDF, a picture), and
 * the text the models read of it.
 */
function DocumentPreview({
  projectId,
  file,
  onClose,
}: {
  projectId: string;
  file: ProjectFileView;
  onClose: () => void;
}) {
  const shown = file.mime === "application/pdf" || file.mime.startsWith("image/");
  const [view, setView] = useState<"original" | "text">(shown ? "original" : "text");
  const text = useDocumentText(projectId, file, TEXT_LIMIT);
  const src = fileUrl(projectId, file.id);
  const tab = (id: typeof view, label: string) => (
    <button
      type="button"
      aria-pressed={view === id}
      onClick={() => setView(id)}
      className={cn(
        "h-8 rounded-full px-3 text-[0.8125rem] transition",
        view === id ? "bg-paper-2 font-medium text-ink" : "text-ink-3 hover:text-ink",
      )}
    >
      {label}
    </button>
  );
  return (
    <Dialog open onClose={onClose} wide="page" title={file.name}>
      <div className="-mt-2 mb-4 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-[0.8125rem] text-ink-3">{meta(file)}</span>
        <Status file={file} />
        <div className="ml-auto flex items-center gap-1">
          {shown ? (
            <>
              {tab("original", t("project.original"))}
              {tab("text", t("project.readText"))}
            </>
          ) : null}
          <a
            href={src}
            target="_blank"
            rel="noreferrer"
            aria-label={t("project.openOriginal")}
            title={t("project.openOriginal")}
            className="inline-flex size-9 items-center justify-center rounded-full text-ink-3 transition hover:bg-accent hover:text-ink"
          >
            <ExternalLink className="size-4" />
          </a>
        </div>
      </div>
      {view === "original" ? (
        file.mime === "application/pdf" ? (
          <iframe
            src={src}
            title={file.name}
            className="h-[70dvh] w-full rounded-lg bg-paper-2 ring-1 ring-border-soft"
          />
        ) : (
          <img src={src} alt="" className="mx-auto max-h-[70dvh] rounded-lg object-contain" />
        )
      ) : text.isLoading ? (
        <div className="flex h-40 items-center justify-center text-ink-3">
          <Spinner />
        </div>
      ) : text.data?.text ? (
        <>
          <div className="overflow-x-auto rounded-lg bg-paper p-5 ring-1 ring-border-soft">
            <Markdown text={text.data.text} className="text-[0.875rem]" />
          </div>
          {text.data.chars > text.data.text.length ? (
            <p className="mt-3 text-[0.8125rem] text-ink-3">
              {t("project.textCut", {
                shown: text.data.text.length.toLocaleString(),
                total: text.data.chars.toLocaleString(),
              })}
            </p>
          ) : null}
        </>
      ) : (
        <p className="py-8 text-center text-[0.875rem] text-ink-3">{t("project.noText")}</p>
      )}
    </Dialog>
  );
}

/**
 * Asks the index what an agent step would ask it, and shows the passages it would get. An
 * empty field shows nothing.
 */
function IndexSearch({ projectId }: { projectId: string }) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<{ name: string; text: string }[] | null>(null);
  const [busy, setBusy] = useState(false);
  const search = async () => {
    if (!query.trim()) {
      setHits(null);
      return;
    }
    setBusy(true);
    try {
      const found = await api.post<{ hits: { name: string; text: string }[] }>(
        `/api/studio/projects/${projectId}/search`,
        { query },
      );
      setHits(found.hits);
    } catch {
      setHits([]);
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SearchField
        value={query}
        placeholder={t("project.searchTest")}
        busy={busy}
        onEnter={() => void search()}
        onChange={(next) => {
          setQuery(next);
          if (!next.trim()) {
            setHits(null);
          }
        }}
      />
      {hits ? (
        hits.length ? (
          <ul className="mt-2 flex flex-col gap-2">
            {hits.map((hit, i) => (
              <li key={i} className="rounded-lg bg-paper-2 px-3 py-2 text-[0.8125rem]">
                <div className="mb-0.5 font-medium text-[0.75rem] text-ink-3">{hit.name}</div>
                <p className="line-clamp-3 whitespace-pre-line text-ink-2">{hit.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 text-[0.8125rem] text-ink-3">{t("project.searchNone")}</p>
        )
      ) : null}
    </>
  );
}

export function Documents({
  projectId,
  data,
  readOnly,
}: {
  projectId: string;
  data: ProjectFiles;
  readOnly?: boolean;
}) {
  const actions = useFileActions(projectId, readOnly);
  const [layout, toggleLayout] = useLayout("documents", "list");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const docs = data.files.filter((f) => f.kind === "document");
  const preview = docs.find((f) => f.id === previewId);
  const Item = layout === "cards" ? DocumentCard : DocumentRow;
  return (
    <Section title={t("project.documents")} hint={t("project.documentsHint")}>
      {docs.length ? (
        <ListControls layout={layout} onToggle={toggleLayout}>
          <IndexSearch projectId={projectId} />
        </ListControls>
      ) : null}
      {docs.length ? (
        <ul
          className={cn(
            "mb-3",
            layout === "cards"
              ? "grid grid-cols-[repeat(auto-fill,minmax(220px,1fr))] gap-3"
              : "flex flex-col gap-2",
          )}
        >
          {docs.map((file) => (
            <Item
              key={file.id}
              projectId={projectId}
              file={file}
              actions={actions}
              onPreview={() => setPreviewId(file.id)}
            />
          ))}
        </ul>
      ) : null}
      {readOnly ? (
        // A local install sends its wizards; the project's documents stay with it.
        docs.length ? null : (
          <p className="text-[0.875rem] text-ink-3">{t("project.staysLocal")}</p>
        )
      ) : (
        <DropArea
          accept=".pdf,.docx,.doc,.xlsx,.csv,.tsv,.txt,.md,.json,.html,.eml,image/*"
          onFiles={(picked) => actions.upload("document", picked)}
          className="h-16 w-full"
        >
          {actions.busy ? <Spinner className="size-4" /> : <Upload className="size-4" />}
          {t("project.drop")} <span className="underline">{t("project.documentAdd")}</span>
        </DropArea>
      )}
      {actions.error ? <p className="mt-3 text-[0.875rem] text-rose">{actions.error}</p> : null}
      {docs.length && !data.embeddings ? (
        <p className="mt-3 text-[0.8125rem] text-ink-3">{t("project.keywordsOnly")}</p>
      ) : null}
      {preview ? (
        <DocumentPreview projectId={projectId} file={preview} onClose={() => setPreviewId(null)} />
      ) : null}
    </Section>
  );
}
