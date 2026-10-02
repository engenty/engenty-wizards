import { allFields, dataRef, type WidgetStep, widgetSize } from "../../shared/definition.js";
import type { StepOutput } from "../../shared/run.js";
import type { WorkspaceFile } from "../../shared/workspace.js";
import { resolveRef } from "../engine/template.js";
import type { ProjectRow, StepContext } from "../engine/types.js";
import { snapshotFile } from "../services/files.js";
import { loadAsset } from "../storage.js";
import { bundleWidget, type WidgetBrand } from "./bundle.js";
import { probeWidget } from "./render.js";

export async function widgetBrand(project: ProjectRow): Promise<WidgetBrand> {
  const logo = project.brand.logoAssetId ? await loadAsset(project.brand.logoAssetId) : null;
  return {
    name: project.brand.name ?? "",
    accent: project.brand.accent || null,
    logo: logo ? `data:${logo.row.mime};base64,${logo.data.toString("base64")}` : null,
  };
}

/** The step's data map resolved against the run: raw values, uploaded images as data URLs. */
async function widgetData(step: WidgetStep, ctx: StepContext) {
  const out: Record<string, unknown> = {};
  const fields = allFields(ctx.def);
  for (const [key, raw] of Object.entries(step.data)) {
    const ref = dataRef(raw);
    const field = fields.find((f) => f.id === ref);
    if (field && (field.kind === "image" || field.kind === "file")) {
      const id = ctx.state.values[ref];
      const found = typeof id === "string" ? await loadAsset(id) : null;
      out[key] =
        found && found.row.runId === ctx.runId && found.data.byteLength < 5_000_000
          ? `data:${found.row.mime};base64,${found.data.toString("base64")}`
          : null;
      continue;
    }
    out[key] = resolveRef(ref, ctx.scope) ?? null;
  }
  return out;
}

/** A widget step makes no model call: it binds this run's data into the widget and keeps the file. */
export async function runWidgetStep(step: WidgetStep, ctx: StepContext): Promise<StepOutput> {
  const data = await widgetData(step, ctx);
  const html = await bundleWidget({
    entry: step.entry,
    files: ctx.files,
    data,
    brand: await widgetBrand(ctx.project),
  });
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
