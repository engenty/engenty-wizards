import { FORMATS, LIST_FORMATS } from "@engenty-wizards/shared/definition";
import { TableColumnValueError } from "@engenty-wizards/shared/engenty/data-tables";
import type { PublicWizard } from "@engenty-wizards/shared/run";
import { getConnInfo } from "@hono/node-server/conninfo";
import { and, eq } from "drizzle-orm";
import { type Context, Hono, type MiddlewareHandler } from "hono";
import { getCookie, setCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { nanoid } from "nanoid";
import { z } from "zod";
import { principalOf } from "../auth/index.js";
import {
  ConnectError,
  connectionViews,
  connectWithCredentials,
  disconnect,
  finishOAuth,
  oauthStateRun,
  startOAuth,
} from "../connectors/index.js";
import { db, schema, withTenant } from "../db/client.js";
import { answerAsk, pendingAsk } from "../engine/asks.js";
import { signalChanged, subscribe } from "../engine/events.js";
import { pushAvailable, setPushDevice } from "../engine/push.js";
import { liveResources } from "../engine/resources.js";
import {
  cancel,
  createRun,
  goBack,
  NoCreditsError,
  projectIdOf,
  RunConflict,
  RunInputError,
  retry,
  reviewStep,
  runView,
  submitPage,
} from "../engine/runner.js";
import { basePath, env } from "../env.js";
import { loadAsset, saveAsset } from "../files/storage.js";
import { reverseGeocode } from "../geocode.js";
import { hashIp, verifyTurnstile, wizardUnavailable } from "../limits.js";
import { ModelUnavailableError } from "../model-errors.js";
import { listDownload, renderDownload, stepHtml } from "../render/downloads.js";
import { HTML_RESPONSE_CSP } from "../render/guard.js";
import { runTicketValid, verifySignedUrl } from "../secrets/signing.js";
import { brandView } from "../services/brand.js";
import { ServiceError } from "../services/errors.js";
import { sharedRun, shareImage, shareRun, shareView, unshareRun } from "../services/shares.js";
import { isIconFile, wizardIcon } from "../services/wizard-icon.js";
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
import {
  tenantOfLink,
  tenantOfRun,
  tenantStatus,
  tokenOfCode,
  visitorOverLimit,
} from "../tenants/control.js";
import { byteRange, uploadLimit, wizardManifest } from "./delivery.js";

const VISITOR_COOKIE = "wz_vid";

/** Kept files a review shows inline. */
const INLINE_TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp"]);

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

/**
 * The mobile app's own requests (a run's view, downloads) name the visitor in a header: iOS
 * merges a Cookie header the app sets with its own cookie store (`wz_vid=a,wz_vid=a`). The header
 * comes first; a browser never sends it across sites without the runtime's say (CORS), so it is
 * as good as the cookie.
 */
const VISITOR_HEADER = "x-wizards-visitor";

function visitorId(c: Context, create: boolean, embedded = false): string | null {
  let vid = c.req.header(VISITOR_HEADER) || getCookie(c, VISITOR_COOKIE) || null;
  if (!vid && create) {
    vid = nanoid(24);
    const secure = env.appUrl.startsWith("https");
    setCookie(c, VISITOR_COOKIE, vid, {
      httpOnly: true,
      path: basePath || "/",
      maxAge: 60 * 60 * 24 * 365,
      // In a frame on another website the wizard is a third party: a browser keeps its cookie
      // only when the cookie says so, and then apart for each website (CHIPS).
      ...(embedded && secure
        ? ({ sameSite: "None", secure: true, partitioned: true } as const)
        : ({ sameSite: "Lax", secure } as const)),
    });
  }
  return vid;
}

/**
 * The run, if the caller may see it: its visitor, the admin who owns the wizard, the widget of
 * the owner's AI app with its run ticket, or — on the read-only file routes — a signed link
 * handed out to the owner's MCP client.
 */
async function accessibleRun(c: Context, runId: string, opts: { signed?: boolean } = {}) {
  const run = await db.query.run.findFirst({ where: eq(schema.run.id, runId) });
  if (!run) {
    return null;
  }
  if (opts.signed && verifySignedUrl(c.req.url)) {
    return run;
  }
  if (runTicketValid(run.id, c.req.query("rt"))) {
    return run;
  }
  const vid = visitorId(c, false);
  if (vid && run.visitorId === vid) {
    return run;
  }
  const user = await principalOf(c);
  if (user && user.tenantId === run.tenantId) {
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

/**
 * These routes arrive without a session. The tenant comes from the public token or the run id
 * in the path — looked up in the control database, never taken from the request.
 */
function tenantFrom(find: (c: Context) => Promise<string | null>): MiddlewareHandler {
  return async (c, next) => {
    const tenant = await find(c);
    if (!tenant) {
      return c.json({ error: "not found" }, 404);
    }
    if ((await tenantStatus(tenant)) === "suspended") {
      return c.json({ error: "Dieser Wizard ist gerade nicht verfügbar." }, 403);
    }
    return withTenant(tenant, next);
  };
}

const wizardLink = tenantFrom((c) => tenantOfLink(c.req.param("token") ?? "", "wizard"));
const resultLink = tenantFrom((c) => tenantOfLink(c.req.param("token") ?? "", "result"));
const logoLink = tenantFrom((c) => tenantOfLink(c.req.param("id") ?? "", "logo"));
const runTenant = tenantFrom((c) => tenantOfRun(c.req.param("id") ?? ""));

/** Wrong guesses at a wizard's ID, per address and hour: 32^8 IDs stay out of reach. */
const codeMisses = new Map<string, { n: number; since: number }>();
const CODE_MISSES_PER_HOUR = 30;

function codeLookupBlocked(ip: string | null): boolean {
  const key = hashIp(ip) ?? "unknown";
  const entry = codeMisses.get(key);
  if (entry && Date.now() - entry.since > 3600_000) {
    codeMisses.delete(key);
    return false;
  }
  return (entry?.n ?? 0) >= CODE_MISSES_PER_HOUR;
}

function codeMissed(ip: string | null) {
  const key = hashIp(ip) ?? "unknown";
  const entry = codeMisses.get(key) ?? { n: 0, since: Date.now() };
  entry.n += 1;
  codeMisses.set(key, entry);
  if (codeMisses.size > 10_000) {
    codeMisses.delete(codeMisses.keys().next().value as string);
  }
}

export const publicRoutes = new Hono()
  // A wizard's ID, typed into the mobile app: answers its share token.
  .get("/codes/:code", async (c) => {
    const ip = clientIp(c);
    if (codeLookupBlocked(ip)) {
      return c.json({ error: "too many tries" }, 429);
    }
    const found = await tokenOfCode(c.req.param("code"));
    if (!found || (await tenantStatus(found.tenantId)) === "suspended") {
      codeMissed(ip);
      return c.json({ error: "not found" }, 404);
    }
    return c.json({ token: found.token, url: `${env.appUrl}/w/${found.token}` });
  })
  .use("/wizards/:token", wizardLink)
  .use("/wizards/:token/*", wizardLink)
  .use("/logos/:id", logoLink)
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
      .object({ turnstileToken: z.string().optional(), embedded: z.boolean().optional() })
      .parse(await c.req.json().catch(() => ({})));
    const ip = clientIp(c);
    if (!(await verifyTurnstile(body.turnstileToken, ip))) {
      return c.json({ error: "Bitte bestätige kurz, dass du ein Mensch bist." }, 403);
    }
    const vid = visitorId(c, true, body.embedded)!;
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
    try {
      const runId = await createRun({
        wizardId: w.id,
        definition: version!.definition,
        files: version!.files,
        version: w.publishedVersion,
        mode: "live",
        visitorId: vid,
        ipHash,
      });
      return c.json({ runId });
    } catch (err) {
      if (err instanceof NoCreditsError || err instanceof ModelUnavailableError) {
        return c.json({ error: "Dieser Wizard ist gerade nicht verfügbar." }, 403);
      }
      throw err;
    }
  })
  // A published wizard as an app of its own: added to a phone's home screen it opens on its link.
  .get("/wizards/:token/manifest.webmanifest", async (c) => {
    const w = await db.query.wizard.findFirst({
      where: eq(schema.wizard.shareToken, c.req.param("token")),
    });
    if (!w || w.publishedVersion === null) {
      return c.notFound();
    }
    const version = await db.query.wizardVersion.findFirst({
      where: and(
        eq(schema.wizardVersion.wizardId, w.id),
        eq(schema.wizardVersion.version, w.publishedVersion),
      ),
    });
    const def = version!.definition;
    const manifest = wizardManifest(w.shareToken, def.title, def.description, w.publishedVersion);
    return c.body(JSON.stringify(manifest), 200, {
      "content-type": "application/manifest+json; charset=utf-8",
      "cache-control": "public, max-age=300",
    });
  })
  // Its icon: the wizard's engenty on its hue with its name; the studio's where none can be drawn.
  .get("/wizards/:token/icons/:file", async (c) => {
    const file = c.req.param("file");
    if (!isIconFile(file)) {
      return c.notFound();
    }
    const w = await db.query.wizard.findFirst({
      where: eq(schema.wizard.shareToken, c.req.param("token")),
    });
    if (!w || w.publishedVersion === null) {
      return c.notFound();
    }
    const version = await db.query.wizardVersion.findFirst({
      where: and(
        eq(schema.wizardVersion.wizardId, w.id),
        eq(schema.wizardVersion.version, w.publishedVersion),
      ),
    });
    const def = version!.definition;
    const png = await wizardIcon(file, def.avatar, def.title);
    if (!png) {
      return c.redirect(
        `${basePath}/studio/${file === "favicon.png" ? "favicon.svg" : `icons/${file}`}`,
      );
    }
    return c.body(png, 200, {
      "content-type": "image/png",
      "cache-control": "public, max-age=3600",
    });
  })
  .get("/logos/:id", async (c) => {
    const found = await loadAsset(c.req.param("id"));
    if (found?.row.kind !== "logo") {
      return c.notFound();
    }
    return c.body(new Uint8Array(found.data), 200, {
      "content-type": found.row.mime,
      "cache-control": "public, max-age=86400",
      // An SVG logo is shown, never run.
      "content-security-policy": "sandbox",
    });
  });

export const runRoutes = new Hono()
  .use("/:id", runTenant)
  .use("/:id/*", runTenant)
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
        z.object({
          type: z.literal("regenerate"),
          target: z.string(),
          note: z.string().max(2000),
          items: z.array(z.number().int().min(0).max(50)).max(20).optional(),
        }),
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
    // A recorder names its type with codecs ("audio/webm;codecs=opus"); the bare type is kept.
    const mime = file instanceof File ? file.type.split(";")[0].trim().toLowerCase() : "";
    const limit = uploadLimit(mime);
    if (!(file instanceof File) || file.size > limit) {
      return c.json(
        { error: `Bitte eine Datei bis ${Math.round(limit / 1_000_000)} MB wählen.` },
        400,
      );
    }
    const ref = await saveAsset({
      runId: run.id,
      kind: mime.startsWith("image/") ? "upload-image" : "upload",
      mime: mime || "application/octet-stream",
      name: file.name.slice(0, 120),
      data: new Uint8Array(await file.arrayBuffer()),
    });
    return c.json(ref);
  })
  // The address of where the person stands, for a location field — only when a geocoder is set up.
  .post("/:id/geocode", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    const { lat, lng, language } = z
      .object({
        lat: z.number().min(-90).max(90),
        lng: z.number().min(-180).max(180),
        language: z.enum(["de", "en"]).default("de"),
      })
      .parse(await c.req.json());
    return c.json({ label: await reverseGeocode(lat, lng, language) });
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
        const popup = page
          .context()
          .waitForEvent("page", { timeout: 1500 })
          .catch(() => null);
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
    const url = await startOAuth(
      scopeOf(run),
      await projectIdOf(run),
      run.id,
      connection,
      c.req.param("connectorId"),
    );
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
        await projectIdOf(run),
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
    // A shared list is every run's: the person never sees it.
    const def = run?.definition.lists?.find((l) => l.id === c.req.param("list") && !l.shared);
    if (!run || !def) {
      return c.json({ error: "not found" }, 404);
    }
    const { cells } = z
      .object({ cells: z.record(z.string(), z.unknown()) })
      .parse(await c.req.json());
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
    // A shared list is every run's: the person never sees it.
    const def = run?.definition.lists?.find((l) => l.id === c.req.param("list") && !l.shared);
    if (!run || !def) {
      return c.json({ error: "not found" }, 404);
    }
    const { cells } = z
      .object({ cells: z.record(z.string(), z.unknown()) })
      .parse(await c.req.json());
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
    // A shared list is every run's: the person never sees it.
    const def = run?.definition.lists?.find((l) => l.id === c.req.param("list") && !l.shared);
    if (!run || !def) {
      return c.json({ error: "not found" }, 404);
    }
    await deleteRows(scopeOf(run), def, [c.req.param("rowId")]);
    signalChanged(run.id);
    return c.json({ ok: true });
  })
  .get("/:id/lists/:list/download", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    // A shared list is every run's: the person never sees it.
    const def = run?.definition.lists?.find((l) => l.id === c.req.param("list") && !l.shared);
    const format = z.enum(FORMATS).safeParse(c.req.query("format"));
    if (!run || !def || !format.success || !LIST_FORMATS.includes(format.data)) {
      return c.notFound();
    }
    const scope = scopeOf(run);
    const download = await listDownload(
      def,
      await listRows(scope, def),
      format.data,
      `${run.definition.title} ${def.title}`,
      async (path) => {
        const found = await readStoreFile(scope, path).catch(() => null);
        return found ? new Uint8Array(found.data) : null;
      },
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
      (run.definition.lists ?? [])
        .filter((def) => !def.shared)
        .map(async (def) => ({
          id: def.id,
          title: def.title,
          rows: (await listRows(scope, def)).length,
        })),
    );
    const secrets = await listSecrets(scope);
    return c.json({
      lists,
      files: await storeFiles(scope),
      connections: (
        await connectionViews(run.definition.connections ?? [], scope, await projectIdOf(run))
      ).filter((x) => x.account),
      keepsSignIns: secrets.some((s) => s.slot === "browser"),
    });
  })
  .get("/:id/store/files/:path{.+}", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    const found = run ? await readStoreFile(scopeOf(run), c.req.param("path")) : null;
    if (!found) {
      return c.notFound();
    }
    const name = (found.file.path.split("/").pop() ?? "file").replace(/"/g, "");
    // Shown beside its row in a review: only what a browser draws without running anything of
    // the file's — PDFs and photos. Everything else stays a download.
    if (c.req.query("inline") && INLINE_TYPES.has(found.file.mime)) {
      return c.body(new Uint8Array(found.data), 200, {
        "content-type": found.file.mime,
        "content-disposition": `inline; filename="${name}"`,
        "x-content-type-options": "nosniff",
        "cache-control": "private, max-age=300",
      });
    }
    return c.body(new Uint8Array(found.data), 200, {
      // Stored files come from mail and the web: always a download, never a page of ours.
      "content-type": "application/octet-stream",
      "content-disposition": `attachment; filename="${name}"`,
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
  // The mobile app's device for this run: told when it is done, failed or waits for the person.
  .post("/:id/notify", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    const body = z
      .object({
        token: z.string().min(8).max(512),
        platform: z.enum(["ios", "android"]),
        lang: z.enum(["en", "de"]).default("en"),
      })
      .parse(await c.req.json());
    await setPushDevice(run.id, body);
    return c.json({ push: pushAvailable() });
  })
  .delete("/:id/notify", async (c) => {
    const run = await accessibleRun(c, c.req.param("id"));
    if (!run) {
      return c.json({ error: "not found" }, 404);
    }
    await setPushDevice(run.id, null);
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
  const tenant = state ? await tenantOfRun(oauthStateRun(state) ?? "") : null;
  if (code && state && tenant) {
    try {
      const done = await withTenant(tenant, () => finishOAuth(code, state));
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
    "x-content-type-options": "nosniff",
  };
  // Files a step collected come from mail and the web: they are downloads, never pages of ours.
  if (found.row.kind === "file") {
    headers["content-disposition"] =
      `attachment; filename="${found.row.name.replace(/["\\\r\n]/g, "")}"`;
  }
  // An SVG or XML document opened on its own could run scripts with this origin.
  if (/svg|xml/.test(found.row.mime)) {
    headers["content-security-policy"] = "sandbox";
  }
  // Generated HTML runs its scripts in an opaque origin and can reach nothing.
  if (found.row.mime === "text/html") {
    const html = await stepHtml({
      assets: [{ id: assetId, kind: found.row.kind, mime: found.row.mime, name: "" }],
      at: "",
    });
    headers["content-type"] = "text/html; charset=utf-8";
    headers["content-security-policy"] = HTML_RESPONSE_CSP;
    return c.body(new TextEncoder().encode(html ?? ""), 200, headers);
  }
  if (/^(audio|video)\//.test(found.row.mime)) {
    headers["accept-ranges"] = "bytes";
    const size = found.data.byteLength;
    const range = byteRange(c.req.header("range"), size);
    if (range === "unsatisfiable") {
      return c.body(null, 416, { "content-range": `bytes */${size}` });
    }
    if (range) {
      headers["content-range"] = `bytes ${range.start}-${range.end}/${size}`;
      return c.body(new Uint8Array(found.data.subarray(range.start, range.end + 1)), 206, headers);
    }
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
  .use("/:token", resultLink)
  .use("/:token/*", resultLink)
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
