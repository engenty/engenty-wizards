import {
  allFields,
  dataRef,
  type WidgetStep,
  widgetSize,
} from "@engenty-wizards/shared/definition";
import type { StepOutput } from "@engenty-wizards/shared/run";
import type { WorkspaceFile } from "@engenty-wizards/shared/workspace";
import { resolveRef } from "../engine/template.js";
import { type ProjectRow, type StepContext, StepError } from "../engine/types.js";
import { extFor, loadAsset } from "../files/storage.js";
import { snapshotFile } from "../services/files.js";
import { bundleWidget, type WidgetBrand } from "./bundle.js";
import { FILM_MEDIA_ORIGIN, type FilmMedia, probeWidget, renderFilm } from "./render.js";

export async function widgetBrand(project: ProjectRow): Promise<WidgetBrand> {
  const logo = project.brand.logoAssetId ? await loadAsset(project.brand.logoAssetId) : null;
  return {
    name: project.brand.name ?? "",
    accent: project.brand.accent || null,
    logo: logo ? `data:${logo.row.mime};base64,${logo.data.toString("base64")}` : null,
  };
}

/** A widget inlines media up to this size; a film gets its media from the renderer instead. */
const INLINE_LIMIT = 5_000_000;

const MEDIA_KINDS = { image: "image", video: "video", voice: "audio" } as const;

/**
 * The step's data map resolved against the run: raw values; uploads and the images, clips and
 * voice-over earlier steps made as URLs the page can show — data URLs, or for a film addresses
 * its renderer answers (kept in `media`).
 */
async function widgetData(step: WidgetStep, ctx: StepContext) {
  const out: Record<string, unknown> = {};
  const media = new Map<string, FilmMedia>();
  const fields = allFields(ctx.def);
  const urlOf = async (id: unknown): Promise<string | null> => {
    const found = typeof id === "string" && id ? await loadAsset(id) : null;
    if (!found || found.row.runId !== ctx.runId) {
      return null;
    }
    if (step.video) {
      const url = `${FILM_MEDIA_ORIGIN}/${found.row.id}.${extFor(found.row.mime)}`;
      media.set(url, { bytes: new Uint8Array(found.data), mime: found.row.mime });
      return url;
    }
    return found.data.byteLength < INLINE_LIMIT
      ? `data:${found.row.mime};base64,${found.data.toString("base64")}`
      : null;
  };
  for (const [key, raw] of Object.entries(step.data)) {
    const ref = dataRef(raw);
    const field = fields.find((f) => f.id === ref);
    if (field && (field.kind === "image" || field.kind === "file" || field.kind === "signature")) {
      const value = ctx.state.values[ref];
      out[key] = Array.isArray(value)
        ? (await Promise.all(value.map(urlOf))).filter(Boolean)
        : await urlOf(value);
      continue;
    }
    const source = ctx.def.steps.find((s) => `steps.${s.id}` === ref);
    if (source?.type === "generate" && source.asset in MEDIA_KINDS) {
      const kind = MEDIA_KINDS[source.asset as keyof typeof MEDIA_KINDS];
      const assets = (ctx.state.outputs[source.id]?.assets ?? []).filter((a) => a.kind === kind);
      const urls = (await Promise.all(assets.map((a) => urlOf(a.id)))).filter(Boolean);
      out[key] = source.each ? urls : (urls[0] ?? null);
      continue;
    }
    out[key] = resolveRef(ref, ctx.scope) ?? null;
  }
  return { data: out, media };
}

/** A film: the widget's timeline rendered to an MP4 with sound — that video is the result. */
async function runFilmStep(
  step: WidgetStep,
  ctx: StepContext,
  html: string,
  data: Record<string, unknown>,
  media: Map<string, FilmMedia>,
): Promise<StepOutput> {
  await ctx.emit("info", "Der Film wird geschnitten – das dauert etwa eine Minute.");
  let told = 0;
  const film = await renderFilm(html, widgetSize(step), media, (done) => {
    if (done - told >= 0.25) {
      told = done;
      void ctx.emit("info", `${Math.round(done * 100)} % geschnitten`);
    }
  });
  if (!film) {
    throw new StepError(
      "Der Film konnte nicht gerendert werden: dazu braucht es ffmpeg und eine Zeitleiste im Widget.",
    );
  }
  if (film.errors.length) {
    await ctx.emit("info", `Der Film meldet: ${film.errors[0].slice(0, 200)}`);
  }
  const assets = [
    await ctx.saveAsset({
      stepId: step.id,
      kind: "video",
      mime: "video/mp4",
      name: `${step.id}.mp4`,
      data: film.mp4,
    }),
    await ctx.saveAsset({
      stepId: step.id,
      kind: "poster",
      mime: "image/png",
      name: `${step.id}.png`,
      data: film.png,
    }),
  ];
  return {
    json: data,
    assets,
    widget: { duration: film.duration, errors: film.errors },
    at: new Date().toISOString(),
  };
}

/** A widget step makes no model call: it binds this run's data into the widget and keeps the file. */
export async function runWidgetStep(step: WidgetStep, ctx: StepContext): Promise<StepOutput> {
  const { data, media } = await widgetData(step, ctx);
  const html = await bundleWidget({
    entry: step.entry,
    files: ctx.files,
    data,
    brand: await widgetBrand(ctx.project),
    media: step.video ? FILM_MEDIA_ORIGIN : undefined,
  });
  if (step.video) {
    return runFilmStep(step, ctx, html, data, media);
  }
  let probe: Awaited<ReturnType<typeof probeWidget>> | null = null;
  try {
    probe = await probeWidget(html, widgetSize(step));
  } catch (err) {
    console.error(`[widget ${step.id}]`, err);
  }
  if (probe?.errors.length) {
    await ctx.emit("info", `Das Widget meldet einen Fehler: ${probe.errors[0].slice(0, 200)}`);
  }
  const assets = [
    await ctx.saveAsset({
      stepId: step.id,
      kind: "widget",
      mime: "text/html",
      name: `${step.id}.html`,
      data: html,
    }),
  ];
  if (probe) {
    assets.push(
      await ctx.saveAsset({
        stepId: step.id,
        kind: "poster",
        mime: "image/png",
        name: `${step.id}.png`,
        data: probe.png,
      }),
    );
  }
  return {
    json: data,
    assets,
    widget: { duration: probe?.duration ?? null, errors: probe?.errors ?? [] },
    at: new Date().toISOString(),
  };
}

/** The widget with its sample data (or none) — for the studio preview and the architect's check. */
export async function widgetPreviewHtml(
  step: WidgetStep,
  files: WorkspaceFile[],
  project: ProjectRow,
  data?: unknown,
): Promise<string> {
  let sample: unknown = data ?? {};
  if (data === undefined && step.sample) {
    const found = await snapshotFile(files, step.sample);
    if (found) {
      try {
        sample = JSON.parse(found.data.toString("utf8"));
      } catch {
        sample = {};
      }
    }
  }
  return bundleWidget({
    entry: step.entry,
    files,
    data: sample,
    brand: await widgetBrand(project),
  });
}
