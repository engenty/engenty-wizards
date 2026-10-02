import { getConnInfo } from "@hono/node-server/conninfo";
import { and, eq } from "drizzle-orm";
import { type Context, Hono } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { nanoid } from "nanoid";
import { z } from "zod";
import { FORMATS, LIST_FORMATS } from "../../shared/definition.js";
import { TableColumnValueError } from "../../shared/engenty/data-tables/index.js";
import type { PublicWizard } from "../../shared/run.js";
import { sessionUser } from "../auth.js";
import {
  ConnectError,
  connectionViews,
  connectWithCredentials,
  disconnect,
  finishOAuth,
  startOAuth,
} from "../connectors/index.js";
import { db, schema } from "../db/client.js";
import { listDownload, renderDownload, stepHtml } from "../downloads.js";
import { answerAsk, pendingAsk } from "../engine/asks.js";
import { signalChanged, subscribe } from "../engine/events.js";
import { liveResources } from "../engine/resources.js";
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
import { HTML_RESPONSE_CSP } from "../render/guard.js";
import { brandView } from "../services/brand.js";
import { ServiceError } from "../services/errors.js";
import { sharedRun, shareImage, shareRun, shareView, unshareRun } from "../services/shares.js";
import { verifySignedUrl } from "../signing.js";
import { loadAsset, saveAsset } from "../storage.js";
import {
  clearStore,
  deleteRows,
  listRows,
  listSecrets,
  readStoreFile,
  StoreError,
  saveRows,
  scopeOf,
  storeFiles,
  updateRow,
} from "../store/index.js";

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

/**
 * The run, if the caller may see it: its visitor, the admin who owns the wizard, or — on the
 * read-only file routes — a signed link handed out to the owner's MCP client.
 */
async function accessibleRun(c: Context, runId: string, opts: { signed?: boolean } = {}) {
  const run = await db.query.run.findFirst({ where: eq(schema.run.id, runId) });
  if (!run) {
    return null;
  }
  if (opts.signed && verifySignedUrl(c.req.url)) {
    return run;
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
  return runView(run, await brandView(w?.projectId ?? ""));
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
      brand: await brandView(w.projectId),
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
      files: version!.files,
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
    const run = await accessibleRun(c, c.req.param("id"), { signed: true });
    if (!run) {
      return c.notFound();
    }
    return serveAsset(c, run, c.req.param("assetId"));
  })
  .get("/:id/steps/:stepId/download", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"), { signed: true });
    if (!run) {
      return c.notFound();
    }
    return serveDownload(c, run, c.req.param("stepId"), c.req.query("format"));
  })
  // --- a running step waits for the person ------------------------------------
  .post("/:id/ask/:askId", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    const answer = z
      .discriminatedUnion("type", [
        z.object({
          type: z.literal("fill"),
          values: z.record(z.string(), z.string().max(500)),
          remember: z.boolean().optional(),
        }),
        z.object({ type: z.literal("done"), remember: z.boolean().optional() }),
        z.object({ type: z.literal("skip") }),
      ])
      .parse(await c.req.json());
    if (!answerAsk(run.id, c.req.param("askId"), answer)) {
      return c.json({ error: "Diese Frage ist nicht mehr offen." }, 409);
    }
    return c.json({ ok: true });
  })
  // The page the wizard's browser shows: the person sees what they are asked to sign in to.
  .get("/:id/browser/screen", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    const page = run?.status === "running" ? liveResources(run.id)?.openPage() : null;
    if (!page) {
      return c.notFound();
    }
    const jpeg = await page.screenshot({ type: "jpeg", quality: 70 }).catch(() => null);
    if (!jpeg) {
      return c.notFound();
    }
    const size = page.viewportSize() ?? { width: 1280, height: 900 };
    return c.body(new Uint8Array(jpeg), 200, {
      "content-type": "image/jpeg",
      "cache-control": "no-store",
      "x-page-width": String(size.width),
      "x-page-height": String(size.height),
    });
  })
  // While the wizard waits for a sign-in, the person can use its page: click, type, scroll.
  .post("/:id/browser/act", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    const page = run && pendingAsk(run.id) ? liveResources(run.id)?.openPage() : null;
    if (!page) {
      return c.json({ error: "Der Wizard wartet gerade nicht auf dich." }, 409);
    }
    const act = z
      .discriminatedUnion("type", [
        z.object({ type: z.literal("click"), x: z.number().min(0), y: z.number().min(0) }),
        z.object({ type: z.literal("type"), text: z.string().max(500) }),
        z.object({ type: z.literal("key"), key: z.enum(["Enter", "Tab", "Backspace", "Escape"]) }),
        z.object({ type: z.literal("scroll"), dy: z.number().min(-2000).max(2000) }),
      ])
      .parse(await c.req.json());
    try {
      if (act.type === "click") {
        // A click may open the sign-in in a new tab; the wizard then goes on there.
        const popup = page.context().waitForEvent("page", { timeout: 1500 }).catch(() => null);
        await page.mouse.click(act.x, act.y);
        const opened = await popup;
        if (opened) {
          liveResources(run!.id)?.adopt(opened);
        }
      } else if (act.type === "type") {
        await page.keyboard.type(act.text);
      } else if (act.type === "key") {
        await page.keyboard.press(act.key);
      } else {
        await page.mouse.wheel(0, act.dy);
      }
      await page.waitForLoadState("domcontentloaded", { timeout: 3000 }).catch(() => undefined);
    } catch {
      return c.json({ error: "Das hat auf der Seite nicht geklappt." }, 422);
    }
    return c.json({ ok: true });
  })
  // --- the person's accounts ----------------------------------------------------
  .post("/:id/connections/:connectionId/oauth/:connectorId", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    const connection = run?.definition.connections?.find(
      (x) => x.id === c.req.param("connectionId"),
    );
    if (!run || !connection) {
      return c.json({ error: "not found" }, 404);
    }
    const url = await startOAuth(scopeOf(run), run.id, connection, c.req.param("connectorId"));
    return c.json({ url });
  })
  .post("/:id/connections/:connectionId/credentials/:connectorId", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    const connection = run?.definition.connections?.find(
      (x) => x.id === c.req.param("connectionId"),
    );
    if (!run || !connection) {
      return c.json({ error: "not found" }, 404);
    }
    const { values } = z
      .object({ values: z.record(z.string(), z.string().max(500)) })
      .parse(await c.req.json());
    try {
      const label = await connectWithCredentials(
        scopeOf(run),
        connection,
        c.req.param("connectorId"),
        values,
      );
      signalChanged(run.id);
      return c.json({ ok: true, label });
    } catch (err) {
      if (err instanceof ConnectError) {
        return c.json({ error: err.message }, 422);
      }
      throw err;
    }
  })
  .delete("/:id/connections/:connectionId", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    await disconnect(scopeOf(run), c.req.param("connectionId"));
    signalChanged(run.id);
    return c.json({ ok: true });
  })
  // --- the wizard's lists and files for this person -------------------------------
  .post("/:id/lists/:list/rows", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    const def = run?.definition.lists?.find((l) => l.id === c.req.param("list"));
    if (!run || !def) {
      return c.json({ error: "not found" }, 404);
    }
    const { cells } = z.object({ cells: z.record(z.string(), z.unknown()) }).parse(await c.req.json());
    try {
      await saveRows(scopeOf(run), def, [cells]);
    } catch (err) {
      return listError(c, err);
    }
    signalChanged(run.id);
    return c.json({ ok: true });
  })
  .patch("/:id/lists/:list/rows/:rowId", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    const def = run?.definition.lists?.find((l) => l.id === c.req.param("list"));
    if (!run || !def) {
      return c.json({ error: "not found" }, 404);
    }
    const { cells } = z.object({ cells: z.record(z.string(), z.unknown()) }).parse(await c.req.json());
    try {
      if (!(await updateRow(scopeOf(run), def, c.req.param("rowId"), cells))) {
        return c.json({ error: "not found" }, 404);
      }
    } catch (err) {
      return listError(c, err);
    }
    signalChanged(run.id);
    return c.json({ ok: true });
  })
  .delete("/:id/lists/:list/rows/:rowId", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    const def = run?.definition.lists?.find((l) => l.id === c.req.param("list"));
    if (!run || !def) {
      return c.json({ error: "not found" }, 404);
    }
    await deleteRows(scopeOf(run), def, [c.req.param("rowId")]);
    signalChanged(run.id);
    return c.json({ ok: true });
  })
  .get("/:id/lists/:list/download", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    const def = run?.definition.lists?.find((l) => l.id === c.req.param("list"));
    const format = z.enum(FORMATS).safeParse(c.req.query("format"));
    if (!run || !def || !format.success || !LIST_FORMATS.includes(format.data)) {
      return c.notFound();
    }
    const download = await listDownload(
      def,
      await listRows(scopeOf(run), def.id),
      format.data,
      `${run.definition.title} ${def.title}`,
    );
    return download ? sendDownload(c, download) : c.notFound();
  })
  .get("/:id/store", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    const scope = scopeOf(run);
    const lists = await Promise.all(
      (run.definition.lists ?? []).map(async (def) => ({
        id: def.id,
        title: def.title,
        rows: (await listRows(scope, def.id)).length,
      })),
    );
    const secrets = await listSecrets(scope);
    return c.json({
      lists,
      files: await storeFiles(scope),
      connections: (await connectionViews(run.definition.connections ?? [], scope)).filter(
        (x) => x.account,
      ),
      keepsSignIns: secrets.some((s) => s.slot === "browser"),
    });
  })
  .get("/:id/store/files/:path{.+}", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    const found = run ? await readStoreFile(scopeOf(run), c.req.param("path")) : null;
    if (!found) {
      return c.notFound();
    }
    const name = found.file.path.split("/").pop() ?? "file";
    return c.body(new Uint8Array(found.data), 200, {
      // Stored files come from mail and the web: always a download, never a page of ours.
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${name.replace(/"/g, "")}"`,
      "x-content-type-options": "nosniff",
    });
  })
  .delete("/:id/store", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    await clearStore(scopeOf(run));
    signalChanged(run.id);
    return c.json({ ok: true });
  })
  .post("/:id/share", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    try {
      return c.json(await shareRun(run));
    } catch (err) {
      if (err instanceof ServiceError) {
        return c.json(err.toJSON(), err.status);
      }
      throw err;
    }
  })
  .delete("/:id/share", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    await unshareRun(run);
    return c.json({ ok: true });
  });

type RunRow = typeof schema.run.$inferSelect;

function listError(c: Context, err: unknown) {
  if (err instanceof TableColumnValueError || err instanceof StoreError) {
    return c.json({ error: err.message }, 422);
  }
  throw err;
}

function sendDownload(
  c: Context,
  download: { data: Uint8Array | string; mime: string; filename: string },
) {
  const data = new Uint8Array(
    typeof download.data === "string" ? new TextEncoder().encode(download.data) : download.data,
  );
  return c.body(data, 200, {
    "content-type": download.mime.startsWith("text/")
      ? `${download.mime}; charset=utf-8`
      : download.mime,
    "content-disposition": `attachment; filename="${download.filename}"`,
  });
}

/**
 * Where an OAuth provider sends the person back after connecting an account. The page tells the
 * wizard's window and closes itself.
 */
export const connectCallback = new Hono().get("/callback", async (c) => {
  const code = c.req.query("code");
  const state = c.req.query("state");
  let ok = false;
  let message = "Verbinden wurde abgebrochen.";
  if (code && state) {
    try {
      const done = await finishOAuth(code, state);
      signalChanged(done.runId);
      ok = true;
      message = "Verbunden. Du kannst dieses Fenster schließen.";
    } catch (err) {
      console.error("[connect]", err);
      message = "Verbinden hat nicht geklappt. Bitte noch einmal versuchen.";
    }
  }
  return c.html(
    `<!doctype html><meta charset="utf-8"><title>engenty wizards</title>
<body style="font:16px system-ui;display:grid;place-items:center;height:100vh;margin:0;color:#333">
<p>${message}</p>
<script>
  try { window.opener && window.opener.postMessage({ type: "wizards:connected", ok: ${ok} }, ${JSON.stringify(env.appUrl)}); } catch (e) {}
  setTimeout(function () { window.close(); }, ${ok ? 300 : 4000});
</script>`,
  );
});

async function serveAsset(c: Context, run: RunRow, assetId: string) {
  const found = await loadAsset(assetId);
  if (!found || found.row.runId !== run.id) {
    return c.notFound();
  }
  const headers: Record<string, string> = {
    "content-type": found.row.mime,
    "cache-control": "private, max-age=3600",
  };
  // Generated HTML runs its scripts in an opaque origin and can reach nothing.
  if (found.row.mime === "text/html") {
    const html = await stepHtml(
      { assets: [{ id: assetId, kind: found.row.kind, mime: found.row.mime, name: "" }], at: "" },
      run.ownerId,
    );
    headers["content-type"] = "text/html; charset=utf-8";
    headers["content-security-policy"] = HTML_RESPONSE_CSP;
    return c.body(new TextEncoder().encode(html ?? ""), 200, headers);
  }
  return c.body(new Uint8Array(found.data), 200, headers);
}

async function serveDownload(c: Context, run: RunRow, stepId: string, rawFormat?: string) {
  const format = z.enum(FORMATS).safeParse(rawFormat);
  const step = run.definition.steps.find((s) => s.id === stepId);
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
  return sendDownload(c, download);
}

/** Steps a shared link shows: the result's deliverables — never uploads or in-between steps. */
function sharedStepIds(run: RunRow): Set<string> {
  return new Set(
    run.definition.steps.flatMap((s) =>
      s.type === "result" ? s.deliverables.map((d) => d.from) : [],
    ),
  );
}

/** `/api/shares/:token` — a shared result, readable by anyone holding the link until it expires. */
export const shareRoutes = new Hono()
  .get("/:token", async (c) => {
    const run = await sharedRun(c.req.param("token"));
    if (!run) {
      return c.json({ error: "Dieser Link ist abgelaufen oder wurde zurückgezogen." }, 404);
    }
    return c.json(await shareView(run));
  })
  .get("/:token/image", async (c) => {
    const run = await sharedRun(c.req.param("token"));
    const image = run ? await shareImage(run) : null;
    if (!image) {
      return c.notFound();
    }
    return c.body(image.data as Uint8Array<ArrayBuffer>, 200, {
      "content-type": image.mime,
      "cache-control": "public, max-age=3600",
    });
  })
  .get("/:token/assets/:assetId", async (c) => {
    const run = await sharedRun(c.req.param("token"));
    if (!run) {
      return c.notFound();
    }
    const assetId = c.req.param("assetId");
    const allowed = [...sharedStepIds(run)].some((id) =>
      run.state.outputs[id]?.assets?.some((a) => a.id === assetId),
    );
    return allowed ? serveAsset(c, run, assetId) : c.notFound();
  })
  .get("/:token/steps/:stepId/download", async (c) => {
    const run = await sharedRun(c.req.param("token"));
    const stepId = c.req.param("stepId");
    if (!run || !sharedStepIds(run).has(stepId)) {
      return c.notFound();
    }
    return serveDownload(c, run, stepId, c.req.query("format"));
  });
