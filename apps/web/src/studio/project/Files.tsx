import type { ProjectFileView } from "@engenty-wizards/shared/projects";
import {
  FileSpreadsheet,
  FileText,
  Film,
  Music,
  Plus,
  RefreshCw,
  Search,
  Star,
  Trash2,
  Upload,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../lib/api";
import { t } from "../../lib/i18n";
import { Chip, cn, IconButton, Input, Spinner, Textarea } from "../../ui";
import { fileSize, fileUrl, type ProjectFiles, useFileActions } from "./data";
import { DropArea, Section } from "./Section";

type Actions = ReturnType<typeof useFileActions>;

/** A grid both dark and light logos stand out on, as image editors show transparency. */
const CHECKER = {
  backgroundImage: "repeating-conic-gradient(#c9c9c9 0% 25%, #dedede 0% 50%)",
  backgroundSize: "16px 16px",
};

/** The file's description: the person's text, or what the model wrote once it had looked. */
function Description({ file, actions }: { file: ProjectFileView; actions: Actions }) {
  const [text, setText] = useState(file.description);
  const server = useRef(file.description);
  useEffect(() => {
    if (file.description !== server.current) {
      // What arrives from the server replaces the field unless the person is writing in it.
      setText((mine) => (mine === server.current ? file.description : mine));
      server.current = file.description;
    }
  }, [file.description]);
  const looking = file.status === "pending" && !text;
  return (
    <Textarea
      rows={1}
      minRows={1}
      maxRows={5}
      value={text}
      placeholder={looking ? t("project.describing") : t("project.description")}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text.trim() !== file.description) {
          server.current = text.trim();
          void actions.describe(file.id, text.trim());
        }
      }}
      className="px-2.5 py-1.5 text-[13px]"
    />
  );
}

function remove(file: ProjectFileView, actions: Actions) {
  if (confirm(t("project.removeConfirm", { name: file.name }))) {
    void actions.remove(file.id);
  }
}

function Preview({ projectId, file }: { projectId: string; file: ProjectFileView }) {
  const src = fileUrl(projectId, file.id);
  if (file.mime.startsWith("image/")) {
    return (
      <img
        src={src}
        alt=""
        loading="lazy"
        className={cn("size-full", file.kind === "logo" ? "object-contain p-3" : "object-cover")}
      />
    );
  }
  if (file.mime.startsWith("video/")) {
    return (
      // biome-ignore lint/a11y/useMediaCaption: a preview of the admin's own clip
      <video src={`${src}#t=0.1`} preload="metadata" controls className="size-full object-cover" />
    );
  }
  return (
    <div className="flex size-full items-center justify-center text-ink-3">
      {file.mime.startsWith("audio/") ? <Music className="size-7" /> : <Film className="size-7" />}
    </div>
  );
}

function Tiles({
  projectId,
  kind,
  files,
  actions,
  accept,
  addLabel,
}: {
  projectId: string;
  kind: "logo" | "asset";
  files: ProjectFileView[];
  actions: Actions;
  accept: string;
  addLabel: string;
}) {
  return (
    <>
      <div className="grid grid-cols-[repeat(auto-fill,minmax(160px,1fr))] gap-3">
        {files.map((file, i) => (
          <div
            key={file.id}
            className="group flex flex-col gap-2 rounded-lg bg-paper p-2 ring-1 ring-border-soft"
          >
            <div
              className="relative h-28 overflow-hidden rounded-md bg-paper-2"
              style={kind === "logo" ? CHECKER : undefined}
            >
              <Preview projectId={projectId} file={file} />
              {kind === "logo" && i === 0 ? (
                <span className="absolute top-1.5 left-1.5">
                  <Chip tone="ember">{t("project.logoMain")}</Chip>
                </span>
              ) : null}
              <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100 coarse:opacity-100">
                {kind === "logo" && i > 0 ? (
                  <IconButton
                    label={t("project.logoMakeMain")}
                    onClick={() =>
                      actions.order("logo", [
                        file.id,
                        ...files.filter((f) => f.id !== file.id).map((f) => f.id),
                      ])
                    }
                    className="size-8 bg-card shadow-soft"
                  >
                    <Star className="size-4" />
                  </IconButton>
                ) : null}
                <IconButton
                  label={t("project.remove")}
                  onClick={() => remove(file, actions)}
                  className="size-8 bg-card shadow-soft hover:text-rose"
                >
                  <Trash2 className="size-4" />
                </IconButton>
              </div>
            </div>
            {kind === "asset" ? (
              <div className="truncate px-0.5 text-[12px] text-ink-3" title={file.name}>
                {file.name}
              </div>
            ) : null}
            <Description file={file} actions={actions} />
          </div>
        ))}
        <DropArea
          accept={accept}
          multiple={kind === "asset"}
          onFiles={(picked) => actions.upload(kind, picked)}
          className="min-h-28 flex-col p-3"
        >
          {actions.busy ? <Spinner className="size-5" /> : <Plus className="size-5" />}
          {addLabel}
        </DropArea>
      </div>
      {actions.error ? <p className="mt-3 text-[14px] text-rose">{actions.error}</p> : null}
    </>
  );
}

export function Logos({ projectId, data }: { projectId: string; data: ProjectFiles }) {
  const actions = useFileActions(projectId);
  return (
    <Section title={t("project.logos")} hint={t("project.logosHint")}>
      <Tiles
        projectId={projectId}
        kind="logo"
        files={data.files.filter((f) => f.kind === "logo")}
        actions={actions}
        accept="image/*"
        addLabel={t("project.logoAdd")}
      />
    </Section>
  );
}

export function Assets({ projectId, data }: { projectId: string; data: ProjectFiles }) {
  const actions = useFileActions(projectId);
  return (
    <Section title={t("project.assets")} hint={t("project.assetsHint")}>
      <Tiles
        projectId={projectId}
        kind="asset"
        files={data.files.filter((f) => f.kind === "asset")}
        actions={actions}
        accept="image/*,video/*,audio/*"
        addLabel={t("project.assetAdd")}
      />
    </Section>
  );
}

function typeLabel(file: ProjectFileView): string {
  const ext = file.name.includes(".") ? file.name.split(".").pop() : "";
  return (ext || file.mime.split("/").pop() || "").toUpperCase().slice(0, 5);
}

function DocumentRow({ file, actions }: { file: ProjectFileView; actions: Actions }) {
  const table = /sheet|csv|excel/.test(file.mime);
  return (
    <li className="flex gap-3 rounded-lg bg-paper p-3 ring-1 ring-border-soft">
      <div className="mt-0.5 text-ink-3">
        {table ? <FileSpreadsheet className="size-5" /> : <FileText className="size-5" />}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="min-w-0 truncate font-medium text-[14px]" title={file.name}>
            {file.name}
          </span>
          <span className="text-[12px] text-ink-3">
            {[
              typeLabel(file),
              file.pages ? t("project.pages", { n: file.pages }) : null,
              fileSize(file.size),
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
          {file.status === "pending" ? (
            <span className="inline-flex items-center gap-1.5 text-[12px] text-ink-3">
              <Spinner className="size-3" /> {t("project.reading")}
            </span>
          ) : file.status === "failed" ? (
            <span className="text-[12px] text-rose">{file.error}</span>
          ) : file.indexed ? (
            <Chip tone="live">
              {file.indexed === "embeddings" ? t("project.indexed") : t("project.indexedKeywords")}
            </Chip>
          ) : (
            <Chip tone="warn">{t("project.notIndexed")}</Chip>
          )}
        </div>
        <Description file={file} actions={actions} />
      </div>
      <div className="flex shrink-0 flex-col">
        <IconButton
          label={t("project.remove")}
          onClick={() => remove(file, actions)}
          className="hover:text-rose"
        >
          <Trash2 className="size-4" />
        </IconButton>
        {file.status !== "pending" ? (
          <IconButton label={t("project.reindex")} onClick={() => actions.reindex(file.id)}>
            <RefreshCw className="size-4" />
          </IconButton>
        ) : null}
      </div>
    </li>
  );
}

/** Asks the index what an agent step would ask it, and shows the passages it would get. */
function SearchTest({ projectId }: { projectId: string }) {
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
    <div className="mt-4">
      <div className="relative">
        <Search className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-3 size-4 text-ink-4" />
        <Input
          value={query}
          placeholder={t("project.searchTest")}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void search()}
          className="pl-9"
        />
        {busy ? (
          <Spinner className="-translate-y-1/2 absolute top-1/2 right-3 size-4 text-ink-3" />
        ) : null}
      </div>
      {hits ? (
        hits.length ? (
          <ul className="mt-3 flex flex-col gap-2">
            {hits.map((hit, i) => (
              <li key={i} className="rounded-lg bg-paper-2 px-3 py-2 text-[13px]">
                <div className="mb-0.5 font-medium text-[12px] text-ink-3">{hit.name}</div>
                <p className="line-clamp-3 whitespace-pre-line text-ink-2">{hit.text}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-[13px] text-ink-3">{t("project.searchNone")}</p>
        )
      ) : null}
    </div>
  );
}

export function Documents({ projectId, data }: { projectId: string; data: ProjectFiles }) {
  const actions = useFileActions(projectId);
  const docs = data.files.filter((f) => f.kind === "document");
  return (
    <Section title={t("project.documents")} hint={t("project.documentsHint")}>
      {docs.length ? (
        <ul className="mb-3 flex flex-col gap-2">
          {docs.map((file) => (
            <DocumentRow key={file.id} file={file} actions={actions} />
          ))}
        </ul>
      ) : null}
      <DropArea
        accept=".pdf,.docx,.doc,.xlsx,.csv,.tsv,.txt,.md,.json,.html,.eml,image/*"
        onFiles={(picked) => actions.upload("document", picked)}
        className="h-16 w-full"
      >
        {actions.busy ? <Spinner className="size-4" /> : <Upload className="size-4" />}
        {t("project.drop")} <span className="underline">{t("project.documentAdd")}</span>
      </DropArea>
      {actions.error ? <p className="mt-3 text-[14px] text-rose">{actions.error}</p> : null}
      {docs.length && !data.embeddings ? (
        <p className="mt-3 text-[13px] text-ink-3">{t("project.keywordsOnly")}</p>
      ) : null}
      {docs.some((f) => f.indexed) ? <SearchTest projectId={projectId} /> : null}
    </Section>
  );
}
