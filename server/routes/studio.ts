import { and, count, desc, eq, inArray } from "drizzle-orm";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { nanoid } from "nanoid";
import { z } from "zod";
import { parseWizard, type WizardDefinition, wizardSchema } from "../../shared/definition.js";
import { runArchitect } from "../agents/architect.js";
import { enabledProviders, type SessionUser } from "../auth.js";
import {
  charge,
  getBilling,
  MICROS_PER_CREDIT,
  microsToCredits,
  usdToMicros,
} from "../billing/credits.js";
import { billingEnabled } from "../billing/stripe.js";
import { db, schema } from "../db/client.js";
import { createRun } from "../engine/runner.js";
import { env } from "../env.js";
import { hasTextModel } from "../models.js";
import { STARTERS, starterById } from "../starters/index.js";
import { saveAsset } from "../storage.js";

type Vars = { Variables: { user: SessionUser } };

const BLANK: WizardDefinition = {
  version: 1,
  title: "Neuer Wizard",
  description: "",
  avatar: "round",
  steps: [
    {
      id: "start",
      type: "page",
      title: "Los geht's",
      fields: [{ id: "input", label: "Worum geht es?", kind: "textarea", required: true }],
    },
    { id: "done", type: "result", title: "Fertig", deliverables: [] },
  ],
};

export function newShareToken(): string {
  return nanoid(14);
}

async function ownedProject(userId: string, projectId: string) {
  return db.query.project.findFirst({
    where: and(eq(schema.project.id, projectId), eq(schema.project.ownerId, userId)),
  });
}

async function ownedWizard(userId: string, wizardId: string) {
  return db.query.wizard.findFirst({
    where: and(eq(schema.wizard.id, wizardId), eq(schema.wizard.ownerId, userId)),
  });
}

function wizardSummary(w: typeof schema.wizard.$inferSelect) {
  return {
    id: w.id,
    projectId: w.projectId,
    title: w.title,
    description: w.draft.description,
    avatar: w.draft.avatar,
    published: w.publishedVersion !== null,
    publishedVersion: w.publishedVersion,
    shareToken: w.shareToken,
    shareEnabled: w.shareEnabled,
    dailyRunLimit: w.dailyRunLimit,
    stepCount: w.draft.steps.length,
    updatedAt: w.updatedAt.toISOString(),
  };
}

const mcpServerSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
  name: z.string().min(1).max(60),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
});

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
    });
  })

  // --- projects --------------------------------------------------------------
  .get("/projects", async (c) => {
    const user = c.get("user");
    const projects = await db.query.project.findMany({
      where: eq(schema.project.ownerId, user.id),
      orderBy: [schema.project.createdAt],
    });
    const counts = await db
      .select({ projectId: schema.wizard.projectId, n: count() })
      .from(schema.wizard)
      .where(eq(schema.wizard.ownerId, user.id))
      .groupBy(schema.wizard.projectId);
    return c.json(
      projects.map((p) => ({
        id: p.id,
        name: p.name,
        brand: p.brand,
        mcpServers: p.mcpServers.map((s) => ({
          ...s,
          headers: s.headers
            ? Object.fromEntries(Object.keys(s.headers).map((k) => [k, "••••"]))
            : undefined,
        })),
        wizardCount: counts.find((x) => x.projectId === p.id)?.n ?? 0,
      })),
    );
  })
  .post("/projects", async (c) => {
    const user = c.get("user");
    const body = z.object({ name: z.string().min(1).max(80) }).parse(await c.req.json());
    const id = nanoid(12);
    await db
      .insert(schema.project)
      .values({ id, ownerId: user.id, name: body.name, brand: {}, mcpServers: [] });
    return c.json({ id });
  })
  .patch("/projects/:id", async (c) => {
    const user = c.get("user");
    const p = await ownedProject(user.id, c.req.param("id"));
    if (!p) {
      return c.json({ error: "not found" }, 404);
    }
    const body = z
      .object({
        name: z.string().min(1).max(80).optional(),
        brand: z
          .object({
            name: z.string().max(120).optional(),
            details: z.string().max(4000).optional(),
            accent: z
              .string()
              .regex(/^#[0-9a-fA-F]{6}$/)
              .optional()
              .or(z.literal("")),
            logoAssetId: z.string().optional(),
          })
          .optional(),
        mcpServers: z.array(mcpServerSchema).max(10).optional(),
      })
      .parse(await c.req.json());
    // Masked header values keep what was stored.
    const mcpServers = body.mcpServers?.map((s) => {
      const before = p.mcpServers.find((x) => x.id === s.id);
      const headers = s.headers
        ? Object.fromEntries(
            Object.entries(s.headers).map(([k, v]) => [
              k,
              v === "••••" ? (before?.headers?.[k] ?? "") : v,
            ]),
          )
        : undefined;
      return { ...s, headers };
    });
    await db
      .update(schema.project)
      .set({
        ...(body.name ? { name: body.name } : {}),
        ...(body.brand
          ? { brand: { ...p.brand, ...body.brand, accent: body.brand.accent || undefined } }
          : {}),
        ...(mcpServers ? { mcpServers } : {}),
        updatedAt: new Date(),
      })
      .where(eq(schema.project.id, p.id));
    return c.json({ ok: true });
  })
  .post("/projects/:id/logo", async (c) => {
    const user = c.get("user");
    const p = await ownedProject(user.id, c.req.param("id"));
    if (!p) {
      return c.json({ error: "not found" }, 404);
    }
    const form = await c.req.formData();
    const file = form.get("file");
    if (!(file instanceof File) || !file.type.startsWith("image/") || file.size > 2_000_000) {
      return c.json({ error: "Bitte ein Bild bis 2 MB wählen." }, 400);
    }
    const ref = await saveAsset({
      ownerId: user.id,
      kind: "logo",
      mime: file.type,
      name: file.name,
      data: new Uint8Array(await file.arrayBuffer()),
    });
    await db
      .update(schema.project)
      .set({ brand: { ...p.brand, logoAssetId: ref.id }, updatedAt: new Date() })
      .where(eq(schema.project.id, p.id));
    return c.json({ id: ref.id });
  })
  .delete("/projects/:id", async (c) => {
    const user = c.get("user");
    const all = await db.query.project.findMany({ where: eq(schema.project.ownerId, user.id) });
    if (all.length <= 1) {
      return c.json({ error: "Das letzte Projekt bleibt." }, 400);
    }
    await db
      .delete(schema.project)
      .where(and(eq(schema.project.id, c.req.param("id")), eq(schema.project.ownerId, user.id)));
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
    const rows = await db.query.wizard.findMany({
      where: and(
        eq(schema.wizard.projectId, c.req.param("id")),
        eq(schema.wizard.ownerId, user.id),
      ),
      orderBy: [desc(schema.wizard.updatedAt)],
    });
    return c.json(rows.map(wizardSummary));
  })
  .post("/wizards", async (c) => {
    const user = c.get("user");
    const body = z
      .object({ projectId: z.string(), starterId: z.string().optional() })
      .parse(await c.req.json());
    const p = await ownedProject(user.id, body.projectId);
    if (!p) {
      return c.json({ error: "not found" }, 404);
    }
    const starter = body.starterId ? starterById(body.starterId) : undefined;
    const draft = structuredClone(starter?.definition ?? BLANK);
    const id = nanoid(12);
    await db.insert(schema.wizard).values({
      id,
      projectId: p.id,
      ownerId: user.id,
      title: draft.title,
      draft,
      shareToken: newShareToken(),
      dailyRunLimit: env.limits.defaultDailyRuns,
      starter: starter?.id ?? null,
    });
    if (starter) {
      await db.insert(schema.wizardMessage).values({
        id: nanoid(12),
        wizardId: id,
        role: "assistant",
        content: `Ich habe den Starter „${starter.title}“ für dich angelegt. Teste ihn rechts oben – oder sag mir, was anders sein soll.`,
      });
    }
    return c.json({ id });
  })
  .get("/wizards/:id", async (c) => {
    const user = c.get("user");
    const w = await ownedWizard(user.id, c.req.param("id"));
    if (!w) {
      return c.json({ error: "not found" }, 404);
    }
    const messages = await db.query.wizardMessage.findMany({
      where: eq(schema.wizardMessage.wizardId, w.id),
      orderBy: [schema.wizardMessage.createdAt],
    });
    const published = w.publishedVersion
      ? await db.query.wizardVersion.findFirst({
          where: and(
            eq(schema.wizardVersion.wizardId, w.id),
            eq(schema.wizardVersion.version, w.publishedVersion),
          ),
        })
      : null;
    const parsed = parseWizard(w.draft);
    const project = await db.query.project.findFirst({ where: eq(schema.project.id, w.projectId) });
    return c.json({
      ...wizardSummary(w),
      draft: w.draft,
      issues: parsed.issues,
      blank: messages.length === 0 && !w.starter,
      dirty: !published || JSON.stringify(published.definition) !== JSON.stringify(w.draft),
      messages: messages.map((m) => ({
        id: m.id,
        role: m.role,
        content: m.content,
        changed: m.changed,
      })),
      mcpServers: (project?.mcpServers ?? []).map((s) => ({ id: s.id, name: s.name })),
      shareUrl: `${env.appUrl}/r/${w.shareToken}`,
    });
  })
  .put("/wizards/:id/draft", async (c) => {
    const user = c.get("user");
    const w = await ownedWizard(user.id, c.req.param("id"));
    if (!w) {
      return c.json({ error: "not found" }, 404);
    }
    const parsed = wizardSchema.safeParse((await c.req.json()).definition);
    if (!parsed.success) {
      return c.json(
        {
          error: "invalid",
          issues: parsed.error.issues.map((i) => ({
            message: `${i.path.join(".")}: ${i.message}`,
          })),
        },
        400,
      );
    }
    await db
      .update(schema.wizard)
      .set({ draft: parsed.data, title: parsed.data.title, updatedAt: new Date() })
      .where(eq(schema.wizard.id, w.id));
    return c.json({ ok: true, issues: parseWizard(parsed.data).issues });
  })
  .patch("/wizards/:id", async (c) => {
    const user = c.get("user");
    const w = await ownedWizard(user.id, c.req.param("id"));
    if (!w) {
      return c.json({ error: "not found" }, 404);
    }
    const body = z
      .object({
        shareEnabled: z.boolean().optional(),
        dailyRunLimit: z.number().int().min(1).max(10_000).optional(),
        projectId: z.string().optional(),
      })
      .parse(await c.req.json());
    if (body.projectId && !(await ownedProject(user.id, body.projectId))) {
      return c.json({ error: "not found" }, 404);
    }
    await db
      .update(schema.wizard)
      .set({ ...body, updatedAt: new Date() })
      .where(eq(schema.wizard.id, w.id));
    return c.json({ ok: true });
  })
  .post("/wizards/:id/rotate-link", async (c) => {
    const user = c.get("user");
    const w = await ownedWizard(user.id, c.req.param("id"));
    if (!w) {
      return c.json({ error: "not found" }, 404);
    }
    const token = newShareToken();
    await db
      .update(schema.wizard)
      .set({ shareToken: token, updatedAt: new Date() })
      .where(eq(schema.wizard.id, w.id));
    return c.json({ shareToken: token, shareUrl: `${env.appUrl}/r/${token}` });
  })
  .post("/wizards/:id/duplicate", async (c) => {
    const user = c.get("user");
    const w = await ownedWizard(user.id, c.req.param("id"));
    if (!w) {
      return c.json({ error: "not found" }, 404);
    }
    const id = nanoid(12);
    const draft = { ...w.draft, title: `${w.draft.title} (Kopie)` };
    await db.insert(schema.wizard).values({
      id,
      projectId: w.projectId,
      ownerId: user.id,
      title: draft.title,
      draft,
      shareToken: newShareToken(),
      dailyRunLimit: w.dailyRunLimit,
      starter: w.starter,
    });
    return c.json({ id });
  })
  .delete("/wizards/:id", async (c) => {
    const user = c.get("user");
    await db
      .delete(schema.wizard)
      .where(and(eq(schema.wizard.id, c.req.param("id")), eq(schema.wizard.ownerId, user.id)));
    return c.json({ ok: true });
  })
  .post("/wizards/:id/publish", async (c) => {
    const user = c.get("user");
    const w = await ownedWizard(user.id, c.req.param("id"));
    if (!w) {
      return c.json({ error: "not found" }, 404);
    }
    const parsed = parseWizard(w.draft);
    if (!parsed.ok || parsed.issues.length) {
      return c.json({ error: "Der Wizard hat noch Fehler.", issues: parsed.issues }, 400);
    }
    const version = (w.publishedVersion ?? 0) + 1;
    await db
      .insert(schema.wizardVersion)
      .values({ id: nanoid(12), wizardId: w.id, version, definition: parsed.wizard });
    await db
      .update(schema.wizard)
      .set({ publishedVersion: version, updatedAt: new Date() })
      .where(eq(schema.wizard.id, w.id));
    return c.json({ version, shareUrl: `${env.appUrl}/r/${w.shareToken}` });
  })
  .post("/wizards/:id/chat", async (c) => {
    const user = c.get("user");
    const w = await ownedWizard(user.id, c.req.param("id"));
    if (!w) {
      return c.json({ error: "not found" }, 404);
    }
    const { message } = z
      .object({ message: z.string().min(1).max(8000) })
      .parse(await c.req.json());
    const b = await getBilling(user.id);
    if (b.allowanceMicros + b.topupMicros < MICROS_PER_CREDIT) {
      return c.json({ error: "Dein Guthaben ist aufgebraucht." }, 402);
    }
    const history = await db.query.wizardMessage.findMany({
      where: eq(schema.wizardMessage.wizardId, w.id),
      orderBy: [schema.wizardMessage.createdAt],
    });
    const project = await db.query.project.findFirst({ where: eq(schema.project.id, w.projectId) });
    const blank = history.length === 0 && !w.starter;
    await db
      .insert(schema.wizardMessage)
      .values({ id: nanoid(12), wizardId: w.id, role: "user", content: message });

    return streamSSE(c, async (stream) => {
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      try {
        const result = await runArchitect({
          message,
          current: blank ? null : w.draft,
          history: history.map((m) => ({ role: m.role, content: m.content })),
          mcpServers: (project?.mcpServers ?? []).map((s) => ({ id: s.id, name: s.name })),
          signal: abort.signal,
          onText: (delta) => {
            void stream.writeSSE({ event: "text", data: JSON.stringify(delta) });
          },
          onBuilding: () => {
            void stream.writeSSE({ event: "building", data: "1" });
          },
        });
        await charge(user.id, usdToMicros(result.costUsd), "architect");
        const changed = Boolean(result.wizard);
        if (result.wizard) {
          await db
            .update(schema.wizard)
            .set({ draft: result.wizard, title: result.wizard.title, updatedAt: new Date() })
            .where(eq(schema.wizard.id, w.id));
        }
        const reply =
          result.reply ||
          (changed
            ? "Erledigt."
            : "Das habe ich nicht verstanden – magst du es anders formulieren?");
        await db
          .insert(schema.wizardMessage)
          .values({ id: nanoid(12), wizardId: w.id, role: "assistant", content: reply, changed });
        await stream.writeSSE({
          event: "done",
          data: JSON.stringify({
            reply,
            changed,
            draft: result.wizard ?? w.draft,
            issues: result.issues,
          }),
        });
      } catch (err) {
        console.error("[architect]", err);
        await stream.writeSSE({
          event: "error",
          data: JSON.stringify({
            message: "Da ist etwas schiefgelaufen. Bitte noch einmal versuchen.",
          }),
        });
      }
    });
  })
  .post("/wizards/:id/test-runs", async (c) => {
    const user = c.get("user");
    const w = await ownedWizard(user.id, c.req.param("id"));
    if (!w) {
      return c.json({ error: "not found" }, 404);
    }
    const parsed = parseWizard(w.draft);
    if (!parsed.ok || parsed.issues.length) {
      return c.json({ error: "Der Wizard hat noch Fehler.", issues: parsed.issues }, 400);
    }
    const runId = await createRun({
      wizardId: w.id,
      ownerId: user.id,
      definition: parsed.wizard,
      version: null,
      mode: "test",
      userId: user.id,
    });
    return c.json({ runId });
  })
  .get("/wizards/:id/runs", async (c) => {
    const user = c.get("user");
    const w = await ownedWizard(user.id, c.req.param("id"));
    if (!w) {
      return c.json({ error: "not found" }, 404);
    }
    const rows = await db.query.run.findMany({
      where: eq(schema.run.wizardId, w.id),
      orderBy: [desc(schema.run.createdAt)],
      limit: 100,
    });
    const assetCounts = rows.length
      ? await db
          .select({ runId: schema.asset.runId, n: count() })
          .from(schema.asset)
          .where(
            inArray(
              schema.asset.runId,
              rows.map((r) => r.id),
            ),
          )
          .groupBy(schema.asset.runId)
      : [];
    return c.json(
      rows.map((r) => ({
        id: r.id,
        mode: r.mode,
        status: r.status,
        version: r.version,
        createdAt: r.createdAt.toISOString(),
        credits: Math.ceil(r.costMicros / MICROS_PER_CREDIT),
        assets: assetCounts.find((a) => a.runId === r.id)?.n ?? 0,
        stepTitle: r.definition.steps.find((s) => s.id === r.cursor)?.title ?? null,
      })),
    );
  });
