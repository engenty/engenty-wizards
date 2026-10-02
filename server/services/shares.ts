import { and, eq, isNotNull, lt } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { ShareView } from "../../shared/run.js";
import { db, schema } from "../db/client.js";
import { availableFormats } from "../engine/runner.js";
import { env } from "../env.js";
import { htmlToPng } from "../render/convert.js";
import {
  inlineAssetRefs,
  loadAsset,
  loadAssetText,
  removeAssetFiles,
  saveAsset,
} from "../storage.js";
import { brandView } from "./brand.js";
import { ServiceError } from "./errors.js";

type RunRow = typeof schema.run.$inferSelect;

export const shareUrlFor = (token: string) => `${env.appUrl}/s/${token}`;

/** Shares a finished run. Idempotent: the same run keeps the same link. */
export async function shareRun(run: RunRow) {
  if (run.status !== "done") {
    throw new ServiceError("refused", "Nur fertige Ergebnisse lassen sich teilen.");
  }
  let token = run.shareToken;
  if (!token) {
    token = nanoid(16);
    await db
      .update(schema.run)
      .set({ shareToken: token, sharedAt: new Date() })
      .where(eq(schema.run.id, run.id));
  }
  return { url: shareUrlFor(token), expiresAt: run.expiresAt?.toISOString() ?? null };
}

export async function unshareRun(run: RunRow) {
  await db
    .update(schema.run)
    .set({ shareToken: null, sharedAt: null })
    .where(eq(schema.run.id, run.id));
}

/** The shared run behind a token, unless the link was withdrawn or the run expired. */
export async function sharedRun(token: string): Promise<RunRow | null> {
  const run = await db.query.run.findFirst({ where: eq(schema.run.shareToken, token) });
  if (run?.status !== "done" || (run.expiresAt && run.expiresAt < new Date())) {
    return null;
  }
  return run;
}

export async function shareView(run: RunRow): Promise<ShareView> {
  const def = run.definition;
  const result =
    def.steps.find((s) => s.id === run.cursor && s.type === "result") ??
    def.steps.findLast((s) => s.type === "result");
  const deliverables = result?.type === "result" ? result.deliverables : [];
  const shown = await Promise.all(
    deliverables.flatMap((d) => {
      const step = def.steps.find((s) => s.id === d.from);
      const output = run.state.outputs[d.from];
      return step && output
        ? [
            (async () => ({
              step,
              output,
              formats: await availableFormats(step, run, d.formats),
              label: d.label ?? null,
            }))(),
          ]
        : [];
    }),
  );
  const w = await db.query.wizard.findFirst({ where: eq(schema.wizard.id, run.wizardId) });
  return {
    token: run.shareToken ?? "",
    title: result?.title ?? def.title,
    message: result?.type === "result" ? (result.message ?? null) : null,
    wizard: { title: def.title, description: def.description, avatar: def.avatar },
    brand: await brandView(w?.projectId ?? ""),
    shown,
    createdAt: run.createdAt.toISOString(),
    expiresAt: run.expiresAt?.toISOString() ?? null,
    wizardUrl:
      w?.shareEnabled && w.publishedVersion !== null ? `${env.appUrl}/r/${w.shareToken}` : null,
  };
}

/**
 * The picture link previews (X, LinkedIn, WhatsApp, Slack) show: the first image of the result,
 * a widget's poster, or a document's first screen. Rendered once and kept.
 */
export async function shareImage(run: RunRow): Promise<{ data: Uint8Array; mime: string } | null> {
  const view = await shareView(run);
  for (const { output } of view.shown) {
    const assets = output?.assets ?? [];
    const image = assets.find((a) => a.mime.startsWith("image/"));
    if (image) {
      const found = await loadAsset(image.id);
      if (found) {
        return { data: new Uint8Array(found.data), mime: found.row.mime };
      }
    }
    const html = assets.find((a) => a.mime === "text/html");
    if (html) {
      const name = `${html.id}.og.png`;
      const hit = await db.query.asset.findFirst({
        where: and(eq(schema.asset.kind, "render"), eq(schema.asset.name, name)),
      });
      const cached = hit ? await loadAsset(hit.id) : null;
      if (cached) {
        return { data: new Uint8Array(cached.data), mime: "image/png" };
      }
      const page = await inlineAssetRefs(await loadAssetText(html.id), run.ownerId);
      const png = await htmlToPng(page, 1200, { height: 630, fullPage: false, scale: 1 });
      await saveAsset({
        ownerId: run.ownerId,
        runId: run.id,
        kind: "render",
        mime: "image/png",
        name,
        data: png,
      });
      return { data: png, mime: "image/png" };
    }
  }
  return null;
}

/** Deletes runs past their expiry with everything they made. Runs hourly. */
export async function purgeExpiredRuns() {
  const expired = await db
    .select({ id: schema.run.id })
    .from(schema.run)
    .where(and(isNotNull(schema.run.expiresAt), lt(schema.run.expiresAt, new Date())));
  for (const { id } of expired) {
    await removeAssetFiles(id);
    await db.delete(schema.run).where(eq(schema.run.id, id));
  }
  return expired.length;
}
