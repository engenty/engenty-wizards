import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { authRoutes, type Principal, principalOf } from "./auth/index.js";
import { withTenant } from "./db/client.js";
import { basePath, env } from "./env.js";
import { linkPreview } from "./link-preview.js";
import { discovery, managed } from "./manage.js";
import { bridgeRequest } from "./mcp/bridge.js";
import { mcpHandler } from "./mcp/handler.js";
import { MCP_RESOURCE, SCOPES } from "./mcp/scopes.js";
import { PLUGIN_NAME, pluginArchive, pluginMarketplace } from "./plugin.js";
import { apiRoutes } from "./routes/api.js";
import { internalRoutes } from "./routes/internal.js";
import { marketplaceStudio } from "./routes/marketplace.js";
import { publicPluginRoutes } from "./routes/plugin-public.js";
import { pluginRoutes } from "./routes/plugins.js";
import { connectCallback, publicRoutes, runRoutes, shareRoutes } from "./routes/runs.js";
import { studio } from "./routes/studio.js";
import { wizardStream } from "./routes/wizard-stream.js";
import { runTicketValid } from "./secrets/signing.js";
import { asRole } from "./services/access.js";
import { ServiceError } from "./services/errors.js";
import { tenantOfLink, tenantStatus } from "./tenants/control.js";

const app = new Hono<{ Variables: { user: Principal } }>();

app.onError((err, c) => {
  if (err instanceof ServiceError) {
    return c.json(err.toJSON(), err.status);
  }
  if (err instanceof ZodError) {
    return c.json({ error: "Ungültige Eingabe", issues: err.issues }, 400);
  }
  if (err instanceof HTTPException) {
    return err.getResponse();
  }
  console.error(err);
  return c.json({ error: "Interner Fehler" }, 500);
});

// --- who may talk to this server at all ---------------------------------------------
// A runtime that runs alone listens on the loopback interface. A web page in the person's
// browser could still reach it there, so the Host header must be one of ours (DNS rebinding)
// and a request that changes something must come from our own origin.

const ownHosts = new Set([new URL(env.appUrl).host, ...env.allowedHosts]);
const loopback = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/;
const hostAllowed = (host: string) => ownHosts.has(host) || loopback.test(host);

/**
 * The widget an AI app shows (MCP Apps) runs on the host's origin and reaches one run with its
 * run ticket: those requests may come from anywhere, the ticket is what lets them in.
 */
const ticketedRun = /^\/api\/runs\/([^/]+)(\/|$)/;

app.use("*", async (c, next) => {
  if (!managed && !hostAllowed(c.req.header("host") ?? new URL(c.req.url).host)) {
    return c.text("Forbidden host", 403);
  }
  const origin = c.req.header("origin");
  const path = c.req.path.startsWith(`${basePath}/`)
    ? c.req.path.slice(basePath.length)
    : c.req.path;
  const runId = ticketedRun.exec(path)?.[1];
  if (origin && runId && runTicketValid(runId, c.req.query("rt"))) {
    const cors = {
      "access-control-allow-origin": origin,
      "access-control-allow-credentials": "true",
      vary: "Origin",
    };
    if (c.req.method === "OPTIONS") {
      return c.body(null, 204, {
        ...cors,
        "access-control-allow-methods": "GET, POST, PUT, PATCH, DELETE",
        "access-control-allow-headers": "content-type",
        // A page on the internet asking a runtime on this computer (Private Network Access).
        "access-control-allow-private-network": "true",
        "access-control-max-age": "600",
      });
    }
    await next();
    for (const [name, value] of Object.entries(cors)) {
      c.res.headers.set(name, value);
    }
    return;
  }
  if (managed) {
    return next();
  }
  const safe = c.req.method === "GET" || c.req.method === "HEAD" || c.req.method === "OPTIONS";
  // MCP clients and scripts send no Origin; a browser always does on a cross-origin write.
  if (!safe && origin && !hostAllowed(new URL(origin).host)) {
    return c.text("Forbidden origin", 403);
  }
  return next();
});

app.get("/api/health", (c) => c.json({ ok: true }));

app.route("/api", authRoutes);

app.get("/api/config", (c) =>
  c.json({
    mode: managed ? "managed" : "local",
    devLogin: !managed && env.devLogin,
    /** The product's own site, for a runtime that runs alone. */
    site: managed ? null : env.local.cloudUrl,
    signedOutUrl: managed && env.signedOutUrl ? env.signedOutUrl : null,
  }),
);

// OAuth discovery for MCP clients (RFC 9728): the Manage-App is the authorization server.
app.get("/.well-known/oauth-protected-resource/*", async (c) => {
  if (!managed) {
    return c.notFound();
  }
  const d = await discovery();
  return c.json({
    resource: MCP_RESOURCE,
    authorization_servers: [d.issuer],
    scopes_supported: SCOPES,
    bearer_methods_supported: ["header"],
  });
});

// The mobile app opens this runtime's wizard and result links (Universal Links, App Links).
app.get("/.well-known/apple-app-site-association", (c) => {
  if (!env.mobile.iosAppIds.length) {
    return c.notFound();
  }
  const paths = [`${basePath}/w/*`, `${basePath}/s/*`];
  return c.json({
    applinks: {
      details: [
        {
          appIDs: env.mobile.iosAppIds,
          components: paths.map((path) => ({ "/": path })),
        },
      ],
    },
  });
});
app.get("/.well-known/assetlinks.json", (c) => {
  if (!env.mobile.androidCertSha256.length) {
    return c.notFound();
  }
  return c.json([
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: env.mobile.androidPackage,
        sha256_cert_fingerprints: env.mobile.androidCertSha256,
      },
    },
  ]);
});

/** Studio requests act as the signed-in person, inside that person's tenant. */
app.use("/api/studio/*", async (c, next) => {
  const user = await principalOf(c);
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  if ((await tenantStatus(user.tenantId)) === "suspended") {
    return c.json({ error: "Dieses Konto ist gesperrt.", code: "suspended" }, 403);
  }
  c.set("user", user);
  return withTenant(user.tenantId, () => asRole(user.role, next));
});

const mcp = mcpHandler();
app.on(["GET", "POST", "DELETE"], "/api/mcp", (c) => mcp(c.req.raw));
// The tools of one model call, for the installed Claude Code while it answers that call.
app.on(["GET", "POST", "DELETE"], "/api/mcp/bridge/:token", (c) =>
  bridgeRequest(c.req.param("token"), c.req.raw),
);

// What visitors send is read before anyone is known: a body is taken only up to a size. A page's
// answers are text; an upload is a photo, a recording or a clip from a phone (routes/delivery.ts).
const tooLarge = (max: number) =>
  bodyLimit({
    maxSize: max,
    onError: (c) => c.json({ error: "Das ist zu groß.", code: "too_large" }, 413),
  });
const answers = tooLarge(4 * 1024 * 1024);
const upload = tooLarge(48 * 1024 * 1024);
app.use("/api/public/*", answers);
app.use("/api/shares/*", answers);
app.use("/api/runs/*", (c, next) =>
  /\/uploads$/.test(c.req.path) ? upload(c, next) : answers(c, next),
);

app.route("/api/studio/wizards", wizardStream);
app.route("/api/studio/marketplace", marketplaceStudio);
app.route("/api/studio/plugins", pluginRoutes);
app.route("/api/studio", studio);
app.route("/api/v1", apiRoutes);
app.route("/api/internal", internalRoutes);
app.route("/api/public/plugins", publicPluginRoutes);
app.route("/api/public", publicRoutes);
app.route("/api/runs", runRoutes);
app.route("/api/shares", shareRoutes);
app.route("/api/connect", connectCallback);

// The Claude Code plugin of this deployment: `claude plugin marketplace add <APP_URL>/api/claude-plugin/marketplace.json`.
app.get("/api/claude-plugin/marketplace.json", async (c) => c.json(await pluginMarketplace()));
app.get(`/api/claude-plugin/${PLUGIN_NAME}.zip`, async (c) => {
  const { zip } = await pluginArchive();
  return c.body(new Uint8Array(zip), 200, { "content-type": "application/zip" });
});

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

/** Link cards for `/w/<token>` and `/s/<token>`; the token names the tenant. */
async function previewFor(path: string): Promise<string | null> {
  const m = path.match(/^\/(w|s)\/([A-Za-z0-9_-]+)\/?$/);
  const tenant = m ? await tenantOfLink(m[2], m[1] === "w" ? "wizard" : "result") : null;
  return tenant ? withTenant(tenant, () => linkPreview(path)) : null;
}

/**
 * Production: the built app. Its files and the studio's pages sit below `/studio`; the public
 * pages are `/w/<token>` and `/s/<token>`. Of the root only what others fetch there is served:
 * the installer, the embed script for websites, and the service worker of public wizards. The
 * rest of the root belongs to others (the landing page); a runtime alone sends `/` to the studio.
 */
const webDir = resolve(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
const ROOT_FILES = ["/install.sh", "/embed.js", "/sw.js"];
const PAGES = /^\/(studio(\/|$)|w\/|s\/)/;
if (existsSync(webDir)) {
  for (const file of ROOT_FILES) {
    app.get(file, serveStatic({ root: webDir }));
  }
  app.use(
    "/studio/*",
    serveStatic({ root: webDir, rewriteRequestPath: (path) => path.slice("/studio".length) }),
  );
  app.get("/", (c) => c.redirect(`${basePath}/studio/`));
  app.get("*", async (c) => {
    if (!PAGES.test(c.req.path)) {
      return c.text("Not found", 404);
    }
    const html = await readFile(join(webDir, "index.html"), "utf8");
    const preview = await previewFor(c.req.path).catch(() => null);
    // A wizard's link installs as that wizard: its own name, start address and icon on the home
    // screen; a bookmark keeps its engenty too.
    const token = c.req.path.match(/^\/w\/([A-Za-z0-9_-]{6,64})(?:\/|$)/)?.[1];
    const own = `${basePath}/api/public/wizards/${token}`;
    const page = token
      ? html
          .replace(/href="[^"]*manifest\.webmanifest"/, `href="${own}/manifest.webmanifest"`)
          .replace(
            /<link rel="apple-touch-icon"[^>]*>/,
            `<link rel="apple-touch-icon" href="${own}/icons/apple-touch-icon.png" />`,
          )
          .replace(
            /<link rel="icon"[^>]*>/,
            `<link rel="icon" href="${own}/icons/favicon.png" type="image/png" />`,
          )
      : html;
    return c.html(
      preview
        ? page.replace(/<title>[^<]*<\/title>/, "").replace("</head>", `${preview}\n</head>`)
        : page,
    );
  });
}

export default app;
