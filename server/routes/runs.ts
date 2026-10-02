import { getConnInfo } from "@hono/node-server/conninfo";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { nanoid } from "nanoid";
import { z } from "zod";
import { FORMATS } from "../../shared/definition.js";
import type { BrandView, PublicWizard } from "../../shared/run.js";
import { sessionUser } from "../auth.js";
import { db, schema } from "../db/client.js";
import { renderDownload } from "../downloads.js";
import { subscribe } from "../engine/events.js";
import {
  cancel,
  createRun,
  goBack,
  RunConflict,
  RunInputError,
  retry,
  reviewStep,
  runView,
  submitPage,
} from "../engine/runner.js";
import { env } from "../env.js";
import { hashIp, verifyTurnstile, visitorOverLimit, wizardUnavailable } from "../limits.js";
import { inlineAssetRefs, loadAsset, saveAsset } from "../storage.js";

const VISITOR_COOKIE = "wz_vid";

function clientIp(c: Context): string | null {
  const fwd = c.req.header("x-forwarded-for")?.split(",")[0]?.trim();
  if (fwd) {
    return fwd;
  }
  try {
    return getConnInfo(c).remote.address ?? null;
  } catch {
    return null;
  }
}

function visitorId(c: Context, create: boolean): string | null {
  let vid = getCookie(c, VISITOR_COOKIE) ?? null;
  if (!vid && create) {
    vid = nanoid(24);
    setCookie(c, VISITOR_COOKIE, vid, {
      httpOnly: true,
      sameSite: "Lax",
      secure: env.appUrl.startsWith("https"),
      path: "/",
      maxAge: 60 * 60 * 24 * 365,
    });
  }
  return vid;
}

async function brandFor(projectId: string): Promise<BrandView> {
  const p = await db.query.project.findFirst({ where: eq(schema.project.id, projectId) });
  return {
    name: p?.brand.name ?? "",
    accent: p?.brand.accent ?? null,
    logoUrl: p?.brand.logoAssetId ? `/api/public/logos/${p.brand.logoAssetId}` : null,
  };
}

/** The run, if the caller may see it: its visitor, or the admin who owns the wizard. */
async function accessibleRun(c: Context, runId: string) {
  const run = await db.query.run.findFirst({ where: eq(schema.run.id, runId) });
  if (!run) {
    return null;
  }
  const vid = visitorId(c, false);
  if (vid && run.visitorId === vid) {
    return run;
  }
  const user = await sessionUser(c.req.raw.headers);
  if (user && user.id === run.ownerId) {
    return run;
  }
  return null;
}

async function viewOf(run: NonNullable<Awaited<ReturnType<typeof accessibleRun>>>) {
  const w = await db.query.wizard.findFirst({ where: eq(schema.wizard.id, run.wizardId) });
  return runView(run, await brandFor(w?.projectId ?? ""));
}

function commandError(c: Context, err: unknown) {
  if (err instanceof RunInputError) {
    return c.json({ error: err.message, fields: err.errors }, 422);
  }
  if (err instanceof RunConflict) {
    return c.json({ error: err.message }, 409);
  }
  throw err;
}

export const publicRoutes = new Hono()
  .get("/wizards/:token", async (c) => {
    const w = await db.query.wizard.findFirst({
      where: eq(schema.wizard.shareToken, c.req.param("token")),
    });
    if (!w || w.publishedVersion === null) {
      return c.json({ error: "not found" }, 404);
    }
    const version = await db.query.wizardVersion.findFirst({
      where: and(
        eq(schema.wizardVersion.wizardId, w.id),
        eq(schema.wizardVersion.version, w.publishedVersion),
      ),
    });
    const def = version!.definition;
    const reason = await wizardUnavailable(w);
    const body: PublicWizard = {
      token: w.shareToken,
      title: def.title,
      description: def.description,
      avatar: def.avatar,
      intro: def.intro ?? null,
      brand: await brandFor(w.projectId),
      turnstileSiteKey: env.turnstile.siteKey || null,
      available: !reason,
      unavailableReason: reason,
    };
    return c.json(body);
  })
  .post("/wizards/:token/runs", async (c) => {
    const w = await db.query.wizard.findFirst({
      where: eq(schema.wizard.shareToken, c.req.param("token")),
    });
    if (!w || w.publishedVersion === null) {
      return c.json({ error: "not found" }, 404);
    }
    const reason = await wizardUnavailable(w);
    if (reason) {
      return c.json({ error: reason }, 403);
    }
    const body = z
      .object({ turnstileToken: z.string().optional() })
      .parse(await c.req.json().catch(() => ({})));
    const ip = clientIp(c);
    if (!(await verifyTurnstile(body.turnstileToken, ip))) {
      return c.json({ error: "Bitte bestätige kurz, dass du ein Mensch bist." }, 403);
    }
    const vid = visitorId(c, true)!;
    const ipHash = hashIp(ip);
    if (await visitorOverLimit(vid, ipHash)) {
      return c.json(
        {
          error:
            "Du hast gerade viele Durchläufe gestartet. Bitte versuche es in einer Stunde wieder.",
        },
        429,
      );
    }
    const version = await db.query.wizardVersion.findFirst({
      where: and(
        eq(schema.wizardVersion.wizardId, w.id),
        eq(schema.wizardVersion.version, w.publishedVersion),
      ),
    });
    const runId = await createRun({
      wizardId: w.id,
      ownerId: w.ownerId,
      definition: version!.definition,
      version: w.publishedVersion,
      mode: "live",
      visitorId: vid,
      ipHash,
    });
    return c.json({ runId });
  })
  .get("/logos/:id", async (c) => {
    const found = await loadAsset(c.req.param("id"));
    if (found?.row.kind !== "logo") {
      return c.notFound();
    }
    return c.body(new Uint8Array(found.data), 200, {
      "content-type": found.row.mime,
      "cache-control": "public, max-age=86400",
    });
  });

export const runRoutes = new Hono()
  .get("/:id", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    return c.json(await viewOf(run));
  })
  .get("/:id/stream", async (c) => {
    const id = c.req.param("id");
    const first = await accessibleRun(c, id);
    if (!first) {
      return c.json({ error: "not found" }, 404);
    }
    return streamSSE(c, async (stream) => {
      let pending = false;
      let closed = false;
      const push = async () => {
        if (pending || closed) {
          return;
        }
        pending = true;
        await new Promise((r) => setTimeout(r, 120));
        pending = false;
        const run = await db.query.run.findFirst({ where: eq(schema.run.id, id) });
        if (run && !closed) {
          await stream.writeSSE({ event: "view", data: JSON.stringify(await viewOf(run)) });
        }
      };
      const unsubscribe = subscribe(id, () => {
        void push();
      });
      stream.onAbort(() => {
        closed = true;
        unsubscribe();
      });
      await stream.writeSSE({ event: "view", data: JSON.stringify(await viewOf(first)) });
      while (!closed) {
        await stream.sleep(20_000);
        if (!closed) {
          await stream.writeSSE({ event: "ping", data: "" });
        }
      }
    });
  })
  .post("/:id/pages/:stepId", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    const { values } = z
      .object({ values: z.record(z.string(), z.unknown()) })
      .parse(await c.req.json());
    try {
      await submitPage(run.id, c.req.param("stepId"), values);
      return c.json({ ok: true });
    } catch (err) {
      return commandError(c, err);
    }
  })
  .post("/:id/reviews/:stepId", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    const action = z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("accept"), edits: z.record(z.string(), z.string()).optional() }),
        z.object({ type: z.literal("regenerate"), target: z.string(), note: z.string().max(2000) }),
      ])
      .parse(await c.req.json());
    try {
      await reviewStep(run.id, c.req.param("stepId"), action);
      return c.json({ ok: true });
    } catch (err) {
      return commandError(c, err);
    }
  })
  .post("/:id/back", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    try {
      await goBack(run.id);
      return c.json({ ok: true });
    } catch (err) {
      return commandError(c, err);
    }
  })
  .post("/:id/retry", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    try {
      await retry(run.id);
      return c.json({ ok: true });
    } catch (err) {
      return commandError(c, err);
    }
  })
  .post("/:id/cancel", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    await cancel(run.id);
    return c.json({ ok: true });
  })
  .post("/:id/uploads", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || file.size > 15_000_000) {
      return c.json({ error: "Bitte eine Datei bis 15 MB wählen." }, 400);
    }
    const ref = await saveAsset({
      ownerId: run.ownerId,
      runId: run.id,
      kind: file.type.startsWith("image/") ? "upload-image" : "upload",
      mime: file.type || "application/octet-stream",
      name: file.name.slice(0, 120),
      data: new Uint8Array(await file.arrayBuffer()),
    });
    return c.json(ref);
  })
  .get("/:id/assets/:assetId", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.notFound();
    }
    const found = await loadAsset(c.req.param("assetId"));
    if (!found || found.row.runId !== run.id) {
      return c.notFound();
    }
    const headers: Record<string, string> = {
      "content-type": found.row.mime,
      "cache-control": "private, max-age=3600",
    };
    // Generated HTML is shown in a sandboxed frame; keep it from running scripts against this origin.
    if (found.row.mime === "text/html") {
      headers["content-security-policy"] =
        "sandbox; default-src 'none'; img-src data: https:; style-src 'unsafe-inline' https:; font-src https: data:";
      const html = await inlineAssetRefs(found.data.toString("utf8"), run.ownerId);
      return c.body(new TextEncoder().encode(html), 200, headers);
    }
    return c.body(new Uint8Array(found.data), 200, headers);
  })
  .get("/:id/steps/:stepId/download", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.notFound();
    }
    const format = z.enum(FORMATS).safeParse(c.req.query("format"));
    const step = run.definition.steps.find((s) => s.id === c.req.param("stepId"));
    const output = step ? run.state.outputs[step.id] : undefined;
    if (!format.success || !step || !output) {
      return c.notFound();
    }
    const label = run.definition.steps
      .flatMap((s) => (s.type === "result" ? s.deliverables : []))
      .find((d) => d.from === step.id)?.label;
    const download = await renderDownload(
      step,
      output,
      format.data,
      `${run.definition.title} ${label ?? step.title}`,
      run.ownerId,
    );
    if (!download) {
      return c.notFound();
    }
    const data = new Uint8Array(
      typeof download.data === "string" ? new TextEncoder().encode(download.data) : download.data,
    );
    return c.body(data, 200, {
      "content-type": download.mime.startsWith("text/")
        ? `${download.mime}; charset=utf-8`
        : download.mime,
      "content-disposition": `attachment; filename="${download.filename}"`,
    });
  });
