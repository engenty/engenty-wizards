import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { serveStatic } from "@hono/node-server/serve-static";
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { ZodError } from "zod";
import { auth, type SessionUser, sessionUser } from "./auth.js";
import { billingRoutes, stripeWebhook } from "./billing/stripe.js";
import { env } from "./env.js";
import { linkPreview } from "./link-preview.js";
import { mcpHandler } from "./mcp/handler.js";
import { PLUGIN_NAME, pluginArchive, pluginMarketplace } from "./plugin.js";
import { connections } from "./routes/connections.js";
import { publicRoutes, runRoutes, shareRoutes } from "./routes/runs.js";
import { studio } from "./routes/studio.js";
import { wizardStream } from "./routes/wizard-stream.js";
import { ServiceError } from "./services/errors.js";

const app = new Hono<{ Variables: { user: SessionUser } }>();

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

app.get("/api/health", (c) => c.json({ ok: true }));

app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));
// OAuth discovery for MCP clients: protected-resource and authorization-server metadata.
app.on(["GET", "HEAD"], "/.well-known/*", (c) => auth.handler(c.req.raw));

/** Local only: a one-click sign-in so agents and developers can use the studio without OAuth. */
app.post("/api/dev/login", async (c) => {
  if (!env.devLogin) {
    return c.notFound();
  }
  const email = env.devEmail;
  const password = `${env.authSecret}-dev`.slice(0, 64);
  let res = await auth.api.signInEmail({ body: { email, password }, asResponse: true });
  if (!res.ok) {
    res = await auth.api.signUpEmail({
      body: { email, password, name: "Dev Admin" },
      asResponse: true,
    });
  }
  return new Response(JSON.stringify({ ok: res.ok }), {
    status: res.ok ? 200 : 500,
    headers: {
      "content-type": "application/json",
      "set-cookie": res.headers.get("set-cookie") ?? "",
    },
  });
});

app.get("/api/config", (c) =>
  c.json({ devLogin: env.devLogin, providers: Object.keys(auth.options.socialProviders ?? {}) }),
);

app.use("/api/studio/*", async (c, next) => {
  const user = await sessionUser(c.req.raw.headers);
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("user", user);
  await next();
});
app.use("/api/billing/checkout", async (c, next) => {
  const user = await sessionUser(c.req.raw.headers);
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("user", user);
  await next();
});
app.use("/api/billing/portal", async (c, next) => {
  const user = await sessionUser(c.req.raw.headers);
  if (!user) {
    return c.json({ error: "unauthorized" }, 401);
  }
  c.set("user", user);
  await next();
});

const mcp = mcpHandler();
app.on(["GET", "POST", "DELETE"], "/api/mcp", (c) => mcp(c.req.raw));

app.route("/api/studio/connections", connections);
app.route("/api/studio/wizards", wizardStream);
app.route("/api/studio", studio);
app.route("/api/billing/webhook", stripeWebhook);
app.route("/api/billing", billingRoutes);
app.route("/api/public", publicRoutes);
app.route("/api/runs", runRoutes);
app.route("/api/shares", shareRoutes);

// The Claude Code plugin of this deployment: `claude plugin marketplace add <APP_URL>/api/claude-plugin/marketplace.json`.
app.get("/api/claude-plugin/marketplace.json", async (c) => c.json(await pluginMarketplace()));
app.get(`/api/claude-plugin/${PLUGIN_NAME}.zip`, async (c) => {
  const { zip } = await pluginArchive();
  return c.body(new Uint8Array(zip), 200, { "content-type": "application/zip" });
});

app.all("/api/*", (c) => c.json({ error: "not found" }, 404));

// Production: the built SPA, with every unknown path falling back to index.html.
const webDir = resolve(process.cwd(), "dist-web");
if (existsSync(webDir)) {
  app.use("/*", serveStatic({ root: "./dist-web" }));
  app.get("*", async (c) => {
    const html = await readFile(join(webDir, "index.html"), "utf8");
    const preview = await linkPreview(c.req.path).catch(() => null);
    return c.html(
      preview
        ? html.replace(/<title>[^<]*<\/title>/, "").replace("</head>", `${preview}\n</head>`)
        : html,
    );
  });
}

export default app;
