import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { auth, enabledProviders, type SessionUser } from "../auth.js";
import { getBilling, microsToCredits } from "../billing/credits.js";
import { billingEnabled } from "../billing/stripe.js";
import { env } from "../env.js";
import { hasTextModel } from "../models.js";
import { architectTurn } from "../services/architect.js";
import { requireCredits } from "../services/credits.js";
import { ServiceError } from "../services/errors.js";
import {
  createProject,
  deleteProject,
  listProjects,
  maskedServers,
  ownedProject,
  projectPatchSchema,
  setProjectLogo,
  updateProject,
} from "../services/projects.js";
import { listRuns, startTestRun } from "../services/runs.js";
import {
  createWizard,
  deleteWizard,
  duplicateWizard,
  listWizards,
  ownedWizard,
  publishWizard,
  rotateShareLink,
  updateWizardSettings,
  wizardMessages,
  wizardState,
  writeDraft,
} from "../services/wizards.js";
import { STARTERS } from "../starters/index.js";

type Vars = { Variables: { user: SessionUser } };

/** Keys a person's own MCP client (Claude Code, Cursor, Codex) signs in with. */
const API_KEY_PREFIX = "wz_";

export const studio = new Hono<Vars>()
  .get("/me", async (c) => {
    const user = c.get("user");
    const b = await getBilling(user.id);
    return c.json({
      user,
      billing: {
        plan: b.plan,
        credits: microsToCredits(Math.max(0, b.allowanceMicros) + Math.max(0, b.topupMicros)),
        allowance: microsToCredits(Math.max(0, b.allowanceMicros)),
        topup: microsToCredits(Math.max(0, b.topupMicros)),
        resetAt: b.allowanceResetAt?.toISOString() ?? null,
        monthly: b.plan === "pro" ? env.credits.proMonthly : env.credits.freeMonthly,
        hasCustomer: Boolean(b.stripeCustomerId),
      },
      billingEnabled: billingEnabled(),
      aiReady: hasTextModel(),
      providers: enabledProviders,
      mcpUrl: `${env.appUrl}/api/mcp`,
    });
  })

  // --- projects --------------------------------------------------------------
  .get("/projects", async (c) => {
    const projects = await listProjects(c.get("user").id);
    return c.json(
      projects.map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        mcpServers: maskedServers(p),
        wizardCount: p.wizardCount,
      })),
    );
  })
  .post("/projects", async (c) => {
    const body = z.object({ name: z.string().min(1).max(80) }).parse(await c.req.json());
    return c.json(await createProject(c.get("user").id, body.name));
  })
  .patch("/projects/:id", async (c) => {
    const patch = projectPatchSchema.parse(await c.req.json());
    await updateProject(c.get("user").id, c.req.param("id"), patch);
    return c.json({ ok: true });
  })
  .post("/projects/:id/logo", async (c) => {
    const file = (await c.req.formData()).get("file");
    if (!(file instanceof File)) {
      return c.json({ error: "Bitte ein Bild bis 2 MB wählen." }, 400);
    }
    return c.json(await setProjectLogo(c.get("user").id, c.req.param("id"), file));
  })
  .delete("/projects/:id", async (c) => {
    await deleteProject(c.get("user").id, c.req.param("id"));
    return c.json({ ok: true });
  })

  // --- wizards ---------------------------------------------------------------
  .get("/starters", (c) =>
    c.json(
      STARTERS.map((s) => ({
        id: s.id,
        title: s.title,
        pitch: s.pitch,
        avatar: s.definition.avatar,
      })),
    ),
  )
  .get("/projects/:id/wizards", async (c) => {
    const user = c.get("user");
    await ownedProject(user.id, c.req.param("id"));
    return c.json(await listWizards(user.id, c.req.param("id")));
  })
  .post("/wizards", async (c) => {
    const body = z
      .object({ projectId: z.string(), starterId: z.string().optional() })
      .parse(await c.req.json());
    const { id } = await createWizard(c.get("user").id, body);
    return c.json({ id });
  })
  .get("/wizards/:id", async (c) => {
    const user = c.get("user");
    const w = await ownedWizard(user.id, c.req.param("id"));
    const messages = await wizardMessages(w.id);
    const project = await ownedProject(user.id, w.projectId);
    return c.json({
      ...(await wizardState(w)),
      blank: messages.length === 0 && !w.starter,
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        changed: m.changed,
        source: m.source,
        client: m.client,
      })),
      mcpServers: project.mcpServers.map((s) => ({ id: s.id, name: s.name })),
    });
  })
  .put("/wizards/:id/draft", async (c) => {
    const body = z
      .object({ definition: z.unknown(), baseRevision: z.number().int().min(0) })
      .parse(await c.req.json());
    const { revision, issues } = await writeDraft(c.get("user").id, c.req.param("id"), body);
    return c.json({ ok: true, revision, issues });
  })
  .patch("/wizards/:id", async (c) => {
    const patch = z
      .object({
        shareEnabled: z.boolean().optional(),
        dailyRunLimit: z.number().int().min(1).max(10_000).optional(),
        projectId: z.string().optional(),
      })
      .parse(await c.req.json());
    await updateWizardSettings(c.get("user").id, c.req.param("id"), patch);
    return c.json({ ok: true });
  })
  .post("/wizards/:id/rotate-link", async (c) =>
    c.json(await rotateShareLink(c.get("user").id, c.req.param("id"))),
  )
  .post("/wizards/:id/duplicate", async (c) =>
    c.json(await duplicateWizard(c.get("user").id, c.req.param("id"))),
  )
  .delete("/wizards/:id", async (c) => {
    await deleteWizard(c.get("user").id, c.req.param("id"));
    return c.json({ ok: true });
  })
  .post("/wizards/:id/publish", async (c) =>
    c.json(await publishWizard(c.get("user").id, c.req.param("id"))),
  )
  .post("/wizards/:id/chat", async (c) => {
    const user = c.get("user");
    const wizardId = c.req.param("id");
    const { message } = z
      .object({ message: z.string().min(1).max(8000) })
      .parse(await c.req.json());
    await ownedWizard(user.id, wizardId);
    await requireCredits(user.id);
    return streamSSE(c, async (stream) => {
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      try {
        const result = await architectTurn(user.id, wizardId, message, {
          signal: abort.signal,
          onText: (delta) => {
            void stream.writeSSE({ event: "text", data: JSON.stringify(delta) });
          },
          onBuilding: () => {
            void stream.writeSSE({ event: "building", data: "1" });
          },
        });
        await stream.writeSSE({ event: "done", data: JSON.stringify(result) });
      } catch (err) {
        console.error("[architect]", err);
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            message:
              err instanceof ServiceError
                ? err.message
                : "Da ist etwas schiefgelaufen. Bitte noch einmal versuchen.",
          }),
        });
      }
    });
  })
  .post("/wizards/:id/test-runs", async (c) =>
    c.json(await startTestRun(c.get("user").id, c.req.param("id"))),
  )
  .get("/wizards/:id/runs", async (c) =>
    c.json(await listRuns(c.get("user").id, c.req.param("id"))),
  )

  // --- API keys for MCP clients ------------------------------------------------
  .get("/api-keys", async (c) => {
    const keys = await auth.api.listApiKeys({ headers: c.req.raw.headers });
    return c.json(
      keys.apiKeys.map((k) => ({
        id: k.id,
        name: k.name,
        start: k.start,
        createdAt: k.createdAt,
        lastRequest: k.lastRequest,
      })),
    );
  })
  .post("/api-keys", async (c) => {
    const { name } = z.object({ name: z.string().min(1).max(32) }).parse(await c.req.json());
    const created = await auth.api.createApiKey({
      body: { name, prefix: API_KEY_PREFIX },
      headers: c.req.raw.headers,
    });
    return c.json({ id: created.id, name: created.name, key: created.key });
  })
  .delete("/api-keys/:id", async (c) => {
    await auth.api.deleteApiKey({
      body: { keyId: c.req.param("id") },
      headers: c.req.raw.headers,
    });
    return c.json({ ok: true });
  });
