import type { WorkspaceFile } from "@engenty-wizards/shared/workspace";
import { useQueryClient } from "@tanstack/react-query";
import { Download, FileCode2, FileJson, FileText, Image, Trash2, Upload } from "lucide-react";
import { useRef, useState } from "react";
import { api } from "../../lib/api";
import { t } from "../../lib/i18n";
import { cn, IconButton, Spinner } from "../../ui";

function fileIcon(f: WorkspaceFile) {
  if (f.mime.startsWith("image/")) {
    return Image;
  }
  if (f.mime.includes("json")) {
    return FileJson;
  }
  if (f.mime === "text/html" || f.mime.includes("javascript") || f.mime === "text/css") {
    return FileCode2;
  }
  return FileText;
}

function bytes(n: number): string {
  return n < 1024
    ? `${n} B`
    : n < 1_048_576
      ? `${Math.round(n / 1024)} KB`
      : `${(n / 1_048_576).toFixed(1)} MB`;
}

/** The wizard's workspace: what the widgets and steps use on every run. */
export function FilesPanel({ wizardId, files }: { wizardId: string; files: WorkspaceFile[] }) {
  const qc = useQueryClient();
  const input = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [drag, setDrag] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const base = `/api/studio/wizards/${wizardId}/files`;
  const refresh = () => qc.invalidateQueries({ queryKey: ["wizard", wizardId] });

  const upload = async (list: FileList | null) => {
    if (!list?.length) {
      return;
    }
    setBusy(true);
    setError(null);
    try {
      for (const file of Array.from(list)) {
        const res = await fetch(`${base}/${encodeURIComponent(file.name).replace(/%2F/g, "/")}`, {
          method: "PUT",
          credentials: "include",
          headers: { "content-type": file.type || "application/octet-stream" },
          body: file,
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? res.statusText);
        }
      }
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
      await refresh();
    }
  };

  const remove = async (path: string) => {
    if (!window.confirm(t("files.confirmDelete", { path }))) {
      return;
    }
    await api.del(`${base}/${path}`);
    await refresh();
  };

  const total = files.reduce((n, f) => n + f.size, 0);
  return (
    <div
      className={cn("flex min-h-full flex-col px-5 py-5", drag && "bg-ember-veil")}
      onDragOver={(e) => {
        e.preventDefault();
        setDrag(true);
      }}
      onDragLeave={() => setDrag(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDrag(false);
        void upload(e.dataTransfer.files);
      }}
    >
      <p className="text-[13px] text-ink-3 leading-relaxed">{t("files.explain")}</p>
      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={() => input.current?.click()}
          className="inline-flex h-9 items-center gap-1.5 rounded-full bg-paper-2 px-3.5 font-medium text-[13px] text-ink-2 hover:bg-paper-3 hover:text-ink"
        >
          {busy ? <Spinner className="size-3.5" /> : <Upload className="size-3.5" />}
          {t("files.upload")}
        </button>
        <span className="ml-auto text-[12px] text-ink-4">
          {t("files.count", { n: files.length, size: bytes(total) })}
        </span>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          onChange={(e) => void upload(e.target.files)}
        />
      </div>
      {error ? (
        <div className="mt-3 rounded-lg bg-rose-tint px-3 py-2 text-[13px] text-rose">{error}</div>
      ) : null}
      <ul className="mt-4 flex flex-col">
        {files.map((f) => {
          const Icon = fileIcon(f);
          return (
            <li
              key={f.path}
              className="group flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-paper-2"
            >
              <Icon className="size-4 shrink-0 text-ink-3" />
              <span className="min-w-0 flex-1 truncate font-mono text-[12px]">{f.path}</span>
              <span className="text-[12px] text-ink-4 tabular-nums">{bytes(f.size)}</span>
              <a
                href={`${base}/${f.path}`}
                className="inline-flex size-8 items-center justify-center rounded-full text-ink-3 opacity-0 hover:text-ink group-hover:opacity-100"
                aria-label={t("files.download")}
              >
                <Download className="size-4" />
              </a>
              <IconButton
                label={t("files.delete")}
                className="opacity-0 hover:text-rose group-hover:opacity-100"
                onClick={() => void remove(f.path)}
              >
                <Trash2 className="size-4" />
              </IconButton>
            </li>
          );
        })}
      </ul>
      {files.length === 0 ? (
        <div className="mt-6 rounded-xl border border-border border-dashed px-4 py-8 text-center text-[13px] text-ink-4">
          {t("files.empty")}
        </div>
      ) : null}
    </div>
  );
}
