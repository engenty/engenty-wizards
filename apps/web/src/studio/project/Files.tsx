import type { ProjectFileView } from "@engenty-wizards/shared/projects";
import { ExternalLink, Eye, Film, Music, Plus, Star, Trash2, Upload } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { t } from "../../lib/i18n";
import { Chip, cn, Dialog, IconButton, Spinner } from "../../ui";
import { fileSize, fileUrl, type ProjectFiles, useFileActions, useLayout } from "./data";
import { DropArea, ListControls, SearchField, Section } from "./Section";

export type Actions = ReturnType<typeof useFileActions>;

/** A grid both dark and light logos stand out on, as image editors show transparency. */
const CHECKER = {
  backgroundImage: "repeating-conic-gradient(#c9c9c9 0% 25%, #dedede 0% 50%)",
  backgroundSize: "16px 16px",
};

/**
 * The file's description: the person's text, or what the model wrote once it had looked. It
 * reads as text and is edited in place; a click into it is all it takes.
 */
export function Description({ file, actions }: { file: ProjectFileView; actions: Actions }) {
  const [text, setText] = useState(file.description);
  const server = useRef(file.description);
  const area = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    if (file.description !== server.current) {
      // What arrives from the server replaces the text unless the person is writing in it.
      setText((mine) => (mine === server.current ? file.description : mine));
      server.current = file.description;
    }
  }, [file.description]);
  // biome-ignore lint/correctness/useExhaustiveDependencies: the height follows the text
  useLayoutEffect(() => {
    const el = area.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${el.scrollHeight}px`;
    }
  }, [text]);
  const looking = file.status === "pending" && !text;
  // Where the project is not changed, the description reads as plain text; none is no line.
  if (actions.readOnly) {
    return text ? <p className="text-[13px] text-ink-2 leading-snug">{text}</p> : null;
  }
  return (
    <textarea
      ref={area}
      rows={1}
      value={text}
      maxLength={600}
      placeholder={looking ? t("project.describing") : t("project.description")}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        if (text.trim() !== file.description) {
          server.current = text.trim();
          void actions.describe(file.id, text.trim());
        }
      }}
      className="-mx-1 block w-[calc(100%+0.5rem)] resize-none overflow-hidden rounded-md bg-transparent px-1 py-0.5 text-[13px] text-ink-2 leading-snug outline-none transition placeholder:text-ink-4 hover:bg-paper-2 focus:bg-card focus:text-ink focus:ring-1 focus:ring-border"
    />
  );
}

export function remove(file: ProjectFileView, actions: Actions) {
  if (confirm(t("project.removeConfirm", { name: file.name }))) {
    void actions.remove(file.id);
  }
}

function Preview({
  projectId,
  file,
  small,
}: {
  projectId: string;
  file: ProjectFileView;
  /** A thumbnail in a list row: a clip shows its first frame without controls. */
  small?: boolean;
}) {
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
      <video
        src={`${src}#t=0.1`}
        preload="metadata"
        controls={!small}
        className="size-full object-cover"
      />
    );
  }
  return (
    <div className="flex size-full items-center justify-center text-ink-3">
      {file.mime.startsWith("audio/") ? (
        <Music className={small ? "size-5" : "size-7"} />
      ) : (
        <Film className={small ? "size-5" : "size-7"} />
      )}
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
  onPreview,
}: {
  projectId: string;
  kind: "logo" | "asset";
  files: ProjectFileView[];
  actions: Actions;
  /** With these, the grid ends in a tile that takes new files. */
  accept?: string;
  addLabel?: string;
  /** Opens a file large; without it the tiles are not clickable. */
  onPreview?: (file: ProjectFileView) => void;
}) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(184px,1fr))] gap-3">
      {files.map((file, i) => (
        <div
          key={file.id}
          className="group relative flex flex-col gap-1.5 rounded-lg bg-paper p-2 pb-2.5 ring-1 ring-border-soft"
        >
          {kind === "logo" && i === 0 ? (
            <span className="absolute -top-3 left-3 z-10 rounded-full ring-2 ring-card">
              <Chip tone="ember">{t("project.logoMain")}</Chip>
            </span>
          ) : null}
          <div
            className="relative h-28 overflow-hidden rounded-md bg-paper-2"
            style={kind === "logo" ? CHECKER : undefined}
          >
            {onPreview && file.mime.startsWith("image/") ? (
              <button
                type="button"
                aria-label={`${t("project.preview")}: ${file.name}`}
                onClick={() => onPreview(file)}
                className="block size-full cursor-zoom-in"
              >
                <Preview projectId={projectId} file={file} />
              </button>
            ) : (
              <Preview projectId={projectId} file={file} />
            )}
            <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100 coarse:opacity-100">
              {onPreview ? (
                <IconButton
                  label={t("project.preview")}
                  onClick={() => onPreview(file)}
                  className="size-8 bg-card shadow-soft"
                >
                  <Eye className="size-4" />
                </IconButton>
              ) : null}
              {kind === "logo" && i > 0 && !actions.readOnly ? (
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
              {actions.readOnly ? null : (
                <IconButton
                  label={t("project.remove")}
                  onClick={() => remove(file, actions)}
                  className="size-8 bg-card shadow-soft hover:text-rose"
                >
                  <Trash2 className="size-4" />
                </IconButton>
              )}
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
      {addLabel && !actions.readOnly ? (
        <DropArea
          accept={accept}
          multiple={false}
          onFiles={(picked) => actions.upload(kind, picked)}
          className="min-h-28 flex-col p-3"
        >
          {actions.busy ? <Spinner className="size-5" /> : <Plus className="size-5" />}
          {addLabel}
        </DropArea>
      ) : null}
    </div>
  );
}

export function Logos({
  projectId,
  data,
  readOnly,
}: {
  projectId: string;
  data: ProjectFiles;
  readOnly?: boolean;
}) {
  const actions = useFileActions(projectId, readOnly);
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
      {actions.error ? <p className="mt-3 text-[14px] text-rose">{actions.error}</p> : null}
    </Section>
  );
}

const assetMeta = (file: ProjectFileView) =>
  [
    (file.name.includes(".") ? file.name.split(".").pop() : file.mime.split("/").pop())
      ?.toUpperCase()
      .slice(0, 5),
    fileSize(file.size),
  ]
    .filter(Boolean)
    .join(" · ");

/** An asset, opened: the picture large, a clip or a recording with its player. */
function AssetPreview({
  projectId,
  file,
  actions,
  onClose,
}: {
  projectId: string;
  file: ProjectFileView;
  actions: Actions;
  onClose: () => void;
}) {
  const src = fileUrl(projectId, file.id);
  return (
    <Dialog open onClose={onClose} wide="page" title={file.name}>
      <div className="-mt-2 mb-4 flex items-center justify-between gap-3">
        <span className="text-[13px] text-ink-3">{assetMeta(file)}</span>
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
      {file.mime.startsWith("image/") ? (
        <div className="overflow-hidden rounded-lg" style={CHECKER}>
          <img src={src} alt="" className="mx-auto max-h-[68dvh] object-contain" />
        </div>
      ) : file.mime.startsWith("video/") ? (
        // biome-ignore lint/a11y/useMediaCaption: the admin's own clip
        <video src={src} controls className="max-h-[68dvh] w-full rounded-lg bg-black" />
      ) : (
        // biome-ignore lint/a11y/useMediaCaption: the admin's own recording
        <audio src={src} controls className="w-full" />
      )}
      <div className="mt-4">
        <Description file={file} actions={actions} />
      </div>
    </Dialog>
  );
}

function AssetRow({
  projectId,
  file,
  actions,
  onPreview,
}: {
  projectId: string;
  file: ProjectFileView;
  actions: Actions;
  onPreview: () => void;
}) {
  return (
    <li className="flex items-start gap-3 rounded-lg bg-paper p-2 ring-1 ring-border-soft">
      <button
        type="button"
        aria-label={`${t("project.preview")}: ${file.name}`}
        onClick={onPreview}
        className="size-14 shrink-0 cursor-zoom-in overflow-hidden rounded-md bg-paper-2"
      >
        <Preview projectId={projectId} file={file} small />
      </button>
      <div className="flex min-w-0 flex-1 flex-col gap-1 py-0.5">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <button
            type="button"
            onClick={onPreview}
            title={file.name}
            className="min-w-0 truncate font-medium text-[14px] hover:underline"
          >
            {file.name}
          </button>
          <span className="text-[12px] text-ink-3">{assetMeta(file)}</span>
        </div>
        <Description file={file} actions={actions} />
      </div>
      <div className="flex shrink-0 items-start">
        <IconButton label={t("project.preview")} onClick={onPreview}>
          <Eye className="size-4" />
        </IconButton>
        {actions.readOnly ? null : (
          <IconButton
            label={t("project.remove")}
            onClick={() => remove(file, actions)}
            className="hover:text-rose"
          >
            <Trash2 className="size-4" />
          </IconButton>
        )}
      </div>
    </li>
  );
}

export function Assets({
  projectId,
  data,
  readOnly,
}: {
  projectId: string;
  data: ProjectFiles;
  readOnly?: boolean;
}) {
  const actions = useFileActions(projectId, readOnly);
  const [layout, toggleLayout] = useLayout("assets", "cards");
  const [filter, setFilter] = useState("");
  const [previewId, setPreviewId] = useState<string | null>(null);
  const all = data.files.filter((f) => f.kind === "asset");
  const preview = all.find((f) => f.id === previewId);
  const words = filter.trim().toLowerCase();
  const files = words
    ? all.filter((f) => `${f.name} ${f.description}`.toLowerCase().includes(words))
    : all;
  return (
    <Section title={t("project.assets")} hint={t("project.assetsHint")}>
      {all.length ? (
        <ListControls layout={layout} onToggle={toggleLayout}>
          <SearchField value={filter} onChange={setFilter} placeholder={t("project.assetSearch")} />
        </ListControls>
      ) : null}
      {files.length ? (
        <div className="mb-3">
          {layout === "cards" ? (
            <Tiles
              projectId={projectId}
              kind="asset"
              files={files}
              actions={actions}
              onPreview={(file) => setPreviewId(file.id)}
            />
          ) : (
            <ul className="flex flex-col gap-2">
              {files.map((file) => (
                <AssetRow
                  key={file.id}
                  projectId={projectId}
                  file={file}
                  actions={actions}
                  onPreview={() => setPreviewId(file.id)}
                />
              ))}
            </ul>
          )}
        </div>
      ) : null}
      {readOnly ? (
        // A local install sends its wizards, not what the project keeps for them.
        all.length ? null : (
          <p className="text-[14px] text-ink-3">{t("project.staysLocal")}</p>
        )
      ) : (
        <DropArea
          accept="image/*,video/*,audio/*"
          onFiles={(picked) => actions.upload("asset", picked)}
          className="h-16 w-full"
        >
          {actions.busy ? <Spinner className="size-4" /> : <Upload className="size-4" />}
          {t("project.drop")} <span className="underline">{t("project.assetAdd")}</span>
        </DropArea>
      )}
      {actions.error ? <p className="mt-3 text-[14px] text-rose">{actions.error}</p> : null}
      {preview ? (
        <AssetPreview
          projectId={projectId}
          file={preview}
          actions={actions}
          onClose={() => setPreviewId(null)}
        />
      ) : null}
    </Section>
  );
}
