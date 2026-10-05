import type { RunView } from "@engenty-wizards/shared/run";
import { Directory, File, Paths } from "expo-file-system";
import { type KeptDeliverable, type KeptResult, type Run, updateRun } from "./db";
import { assetUrl, downloadUrl, visitorHeaders } from "./runtime";

/**
 * A finished run's result is kept on the phone: title, message, the deliverables of the result
 * step with each one's file in its first format, and the pictures shown with them. Other formats
 * are fetched when the person asks for them, as long as the server still has the run. The
 * person's answers and uploads are not kept.
 */

const root = () => new Directory(Paths.document, "results");

export const runFolder = (runId: string) => new Directory(root(), runId);

export const keptFile = (runId: string, name: string) => new File(runFolder(runId), name);

async function fetchInto(runId: string, url: string, headers: Record<string, string>) {
  const folder = runFolder(runId);
  folder.create({ intermediates: true, idempotent: true });
  const file = await File.downloadFileAsync(url, folder, { headers, idempotent: true });
  return file;
}

function resultOf(view: RunView): Omit<KeptResult, "deliverables"> {
  const step = view.step?.type === "result" ? view.step : null;
  return {
    title: step?.title ?? view.wizard.title,
    message: step?.message ?? null,
  };
}

/** Fetches what a finished run made and keeps it with the run; answers the kept result. */
export async function keepResult(run: Run, view: RunView): Promise<KeptResult> {
  const headers = await visitorHeaders(run.runtime);
  const deliverables: KeptDeliverable[] = [];
  for (const shown of view.shown) {
    const files: Record<string, string> = {};
    const first = shown.formats[0];
    if (first) {
      const file = await fetchInto(
        run.id,
        downloadUrl(run.runtime, run.id, shown.step.id, first),
        headers,
      ).catch(() => null);
      if (file) {
        files[first] = file.name;
      }
    }
    const assets: KeptDeliverable["assets"] = [];
    for (const a of shown.output?.assets ?? []) {
      const file =
        a.kind === "image"
          ? await fetchInto(run.id, assetUrl(run.runtime, run.id, a.id), headers).catch(() => null)
          : null;
      assets.push({
        id: a.id,
        name: a.name,
        mime: a.mime,
        file: file?.name ?? null,
        ai: a.ai ?? null,
      });
    }
    deliverables.push({
      stepId: shown.step.id,
      label: shown.label ?? shown.step.title,
      formats: shown.formats,
      files,
      text: shown.output?.text ?? null,
      assets,
    });
  }
  const result: KeptResult = { ...resultOf(view), deliverables };
  await updateRun(run.id, {
    status: "done",
    result,
    finishedAt: new Date().toISOString(),
    shareUrl: view.shareUrl,
    expiresAt: view.expiresAt,
    bytes: folderSize(run.id),
  });
  return result;
}

/** Another format of a deliverable, while the server still has the run. */
export async function fetchFormat(run: Run, stepId: string, format: string): Promise<File> {
  const file = await fetchInto(
    run.id,
    downloadUrl(run.runtime, run.id, stepId, format),
    await visitorHeaders(run.runtime),
  );
  if (run.result) {
    const deliverables = run.result.deliverables.map((d) =>
      d.stepId === stepId ? { ...d, files: { ...d.files, [format]: file.name } } : d,
    );
    await updateRun(run.id, {
      result: { ...run.result, deliverables },
      bytes: folderSize(run.id),
    });
  }
  return file;
}

/** A file the runner downloaded inside the app: kept with the run it belongs to. */
export async function keepDownload(run: Run, url: string): Promise<File> {
  const file = await fetchInto(run.id, url, await visitorHeaders(run.runtime));
  await updateRun(run.id, { bytes: folderSize(run.id) });
  return file;
}

export function folderSize(runId: string): number {
  const folder = runFolder(runId);
  if (!folder.exists) {
    return 0;
  }
  let total = 0;
  for (const entry of folder.list()) {
    if (entry instanceof File) {
      total += entry.size ?? 0;
    }
  }
  return total;
}

export function deleteFiles(runId: string) {
  const folder = runFolder(runId);
  if (folder.exists) {
    folder.delete();
  }
}

export function deleteAllFiles() {
  const folder = root();
  if (folder.exists) {
    folder.delete();
  }
}
