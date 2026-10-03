import { mkdirSync } from "node:fs";
import { join } from "node:path";
import { MODEL_CLASSES, TEXT_CLASSES } from "@engenty-wizards/shared/definition";
import { generateText } from "ai";
import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { z } from "zod";
import { chatEngine, setChatEngine, subscriptionClients } from "../agents/subscription.js";
import { accountOverview, linkedAccount, startLink, unlink } from "../auth/account.js";
import type { SessionUser } from "../auth/index.js";
import { createLocalKey, deleteLocalKey, listLocalKeys } from "../auth/keys.js";
import {
  connectorImportSchema,
  importConnector,
  listConnectors,
  previewSource,
  refreshConnector,
  registryService,
  removeConnector,
  searchRegistry,
} from "../connectors/external.js";
import { balanceCredits, canSpend } from "../credits/credits.js";
import { estimateRun } from "../credits/estimate.js";
import { env } from "../env.js";
import { freshAuth, loginEnv } from "../harness/env.js";
import {
  detectHarness,
  detectHarnesses,
  HARNESS_IDS,
  type HarnessId,
  harness,
} from "../harness/index.js";
import {
  closeTerminal,
  openTerminal,
  resizeTerminal,
  subscribeTerminal,
  writeTerminal,
} from "../harness/terminal.js";
import { managed } from "../manage.js";
import { transcribeAudio } from "../media/transcribe.js";
import {
  hasTextModel,
  LOCAL_KEYS,
  localModelSettings,
  ModelUnavailableError,
  saveLocalModels,
  textModel,
} from "../models.js";
import { HTML_RESPONSE_CSP } from "../render/guard.js";
import { architectTurn } from "../services/architect.js";
import { cloudCopy, publishToCloud } from "../services/cloud.js";
import { ServiceError } from "../services/errors.js";
import { deleteFile, listFiles, readFile, writeFile } from "../services/files.js";
import {
  exportWizard,
  importWizard,
  PACKAGE_EXTENSION,
  PACKAGE_MAX_BYTES,
  PACKAGE_MIME,
} from "../services/package.js";
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
import { draftWidgetPreview } from "../services/widgets.js";
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
import { readSetting, writeSetting } from "../settings.js";
import { STARTERS } from "../starters/index.js";

type Vars = { Variables: { user: SessionUser } };

/** The model sources a test call has worked on: the setup is done for those, not for the others. */
async function testedSources(): Promise<string[]> {
  const tested = await readSetting<unknown>("setup-done");
  return Array.isArray(tested) ? (tested as string[]) : [];
}

/** The chosen source has passed a test call and can still answer: its client is there and signed in. */
async function setupDone(): Promise<boolean> {
  const source = localModelSettings().source;
  if (!(await testedSources()).includes(source)) {
    return false;
  }
  const client = harness(source);
  if (client) {
    const status = await detectHarness(client.id);
    return Boolean(status?.version) && status?.auth !== "none";
  }
  return hasTextModel();
}

export const studio = new Hono<Vars>()
  .get("/me", async (c) => {
    const user = c.get("user");
    // A runtime that runs alone may be linked to an account: its credits and the cloud to publish to.
    const linked = managed ? null : await linkedAccount();
    const overview = linked ? await accountOverview() : null;
    return c.json({
      user: { id: user.id, name: user.name, email: user.email, image: user.image ?? null },
      tenant: { id: user.tenantId, role: user.role },
      mode: managed ? "managed" : "local",
      /** The tenant's balance; null where the runtime resolves models itself. */
      credits: managed ? await balanceCredits() : null,
      /** Where the account, members, API keys and credits are managed. */
      manageUrl: managed ? env.manage.url : null,
      account: linked
        ? {
            name: linked.name,
            email: linked.email,
            credits: overview?.tenant.balanceCredits ?? null,
            url: env.local.accountUrl,
            cloudUrl: env.local.cloudUrl,
            signedIn: Boolean(overview),
          }
        : null,
      models: managed ? null : localModelSettings(),
      /** The AI clients this runtime can think with — installed or not, and how each is signed in. */
      harnesses: managed ? [] : await detectHarnesses(),
      /** Installed AI clients whose subscription can answer the studio chat. */
      subscriptions: managed ? [] : await subscriptionClients(),
      /** A runtime that runs alone keeps its setup in front until a test call has worked on the chosen source and the way is still open. */
      setupDone: managed ? true : await setupDone(),
      /** What answers the studio chat: a model of class `highest`, or the admin's own subscription. */
      chatEngine: managed ? "models" : await chatEngine(await hasTextModel()),
      aiReady: (await hasTextModel()) || (!managed && (await subscriptionClients()).length > 0),
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

  // --- connectors: services imported from the integrations registry ------------
  .post("/connectors/search", async (c) => {
    const { query } = z.object({ query: z.string().min(1).max(200) }).parse(await c.req.json());
    return c.json(await searchRegistry(query));
  })
  .get("/connectors/registry/:domain", async (c) =>
    c.json(await registryService(c.req.param("domain"))),
  )
  .post("/connectors/preview", async (c) => {
    const body = z
      .object({
        domain: z.string().min(1).max(253).optional(),
        sourceKind: z.enum(["openapi", "mcp"]),
        sourceUrl: z.string().url(),
      })
      .parse(await c.req.json());
    return c.json(await previewSource(body));
  })
  .get("/projects/:id/connectors", async (c) => {
    const project = await ownedProject(c.get("user").id, c.req.param("id"));
    return c.json(await listConnectors(project.id));
  })
  .post("/projects/:id/connectors", async (c) => {
    const user = c.get("user");
    const project = await ownedProject(user.id, c.req.param("id"));
    return c.json(
      await importConnector(user.id, project.id, connectorImportSchema.parse(await c.req.json())),
    );
  })
  .post("/projects/:id/connectors/:connectorId/refresh", async (c) => {
    const project = await ownedProject(c.get("user").id, c.req.param("id"));
    return c.json(await refreshConnector(project.id, c.req.param("connectorId"), null));
  })
  .delete("/projects/:id/connectors/:connectorId", async (c) => {
    const project = await ownedProject(c.get("user").id, c.req.param("id"));
    await removeConnector(project.id, c.req.param("connectorId"));
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
        group: s.group ?? null,
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
  // A wizard as a file, and a new wizard made of such a file.
  .post("/projects/:id/wizards/import", async (c) => {
    const file = (await c.req.formData()).get("file");
    if (!(file instanceof File) || !file.size || file.size > PACKAGE_MAX_BYTES) {
      throw new ServiceError("invalid", `Bitte ein Wizard-Paket (${PACKAGE_EXTENSION}) bis 30 MB.`);
    }
    return c.json(
      await importWizard(
        c.get("user").id,
        c.req.param("id"),
        new Uint8Array(await file.arrayBuffer()),
        file.name,
      ),
    );
  })
  .get("/wizards/:id/export", async (c) => {
    const { name, zip } = await exportWizard(c.get("user").id, c.req.param("id"));
    return c.body(new Uint8Array(zip), 200, {
      "content-type": PACKAGE_MIME,
      "content-disposition": `attachment; filename="${name}"`,
      "cache-control": "private, no-store",
    });
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
  // What a run of the draft is expected to cost, per step and in total.
  .get("/wizards/:id/estimate", async (c) => {
    const w = await ownedWizard(c.get("user").id, c.req.param("id"));
    return c.json(await estimateRun(w.id, null, w.draft));
  })
  // A runtime that runs alone: the wizard's copy in the cloud of the linked account.
  .get("/wizards/:id/cloud", async (c) => {
    const w = await ownedWizard(c.get("user").id, c.req.param("id"));
    return c.json({ copy: managed ? null : await cloudCopy(w.id) });
  })
  .post("/wizards/:id/cloud", async (c) => {
    if (managed) {
      return c.notFound();
    }
    return c.json(await publishToCloud(c.get("user").id, c.req.param("id")));
  })
  .post("/wizards/:id/chat", async (c) => {
    const user = c.get("user");
    const wizardId = c.req.param("id");
    const { message } = z
      .object({ message: z.string().min(1).max(8000) })
      .parse(await c.req.json());
    await ownedWizard(user.id, wizardId);
    if (!(await canSpend())) {
      throw new ServiceError("no_credits", "Dein Guthaben ist aufgebraucht.");
    }
    return streamSSE(c, async (stream) => {
      const abort = new AbortController();
      stream.onAbort(() => abort.abort());
      try {
        const result = await architectTurn(user.id, wizardId, message, {
          signal: abort.signal,
          onText: (delta) => {
            void stream.writeSSE({ event: "text", data: JSON.stringify(delta) });
          },
          onActivity: (label) => {
            void stream.writeSSE({ event: "activity", data: JSON.stringify(label) });
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
  // What the admin says into the composer, written down — where the browser cannot do it itself.
  .post("/transcribe", async (c) => {
    const file = (await c.req.formData()).get("file");
    if (!(file instanceof File) || !file.size || file.size > 10_000_000) {
      throw new ServiceError("invalid", "Bitte eine Aufnahme bis 10 MB.");
    }
    if (!(await canSpend())) {
      throw new ServiceError("no_credits", "Dein Guthaben ist aufgebraucht.");
    }
    try {
      const { text } = await transcribeAudio({
        bytes: new Uint8Array(await file.arrayBuffer()),
        mediaType: file.type || "audio/webm",
      });
      return c.json({ text });
    } catch (err) {
      if (err instanceof ModelUnavailableError) {
        throw new ServiceError("refused", err.message);
      }
      throw err;
    }
  })
  .post("/wizards/:id/test-runs", async (c) =>
    c.json(await startTestRun(c.get("user").id, c.req.param("id"))),
  )
  .get("/wizards/:id/runs", async (c) =>
    c.json(await listRuns(c.get("user").id, c.req.param("id"))),
  )

  // --- workspace -------------------------------------------------------------
  .get("/wizards/:id/files", async (c) =>
    c.json(await listFiles(c.get("user").id, c.req.param("id"))),
  )
  .get("/wizards/:id/files/:path{.+}", async (c) => {
    const { file, data } = await readFile(c.get("user").id, c.req.param("id"), c.req.param("path"));
    return c.body(new Uint8Array(data), 200, {
      "content-type": file.mime,
      "content-disposition": `attachment; filename="${file.path.split("/").pop()}"`,
      "cache-control": "private, no-cache",
    });
  })
  .put("/wizards/:id/files/:path{.+}", async (c) => {
    const data = new Uint8Array(await c.req.arrayBuffer());
    const file = await writeFile(
      c.get("user").id,
      c.req.param("id"),
      c.req.param("path"),
      data,
      c.req.header("content-type")?.split(";")[0],
    );
    return c.json(file);
  })
  .delete("/wizards/:id/files/:path{.+}", async (c) => {
    await deleteFile(c.get("user").id, c.req.param("id"), c.req.param("path"));
    return c.json({ ok: true });
  })
  .get("/wizards/:id/widgets/:stepId/preview", async (c) => {
    const html = await draftWidgetPreview(
      c.get("user").id,
      c.req.param("id"),
      c.req.param("stepId"),
    );
    return c.body(new TextEncoder().encode(html), 200, {
      "content-type": "text/html; charset=utf-8",
      "content-security-policy": HTML_RESPONSE_CSP,
      "cache-control": "no-store",
    });
  })

  // --- a runtime that runs alone: its keys, models and linked account -----------
  .get("/api-keys", async (c) => (managed ? c.notFound() : c.json(await listLocalKeys())))
  .post("/api-keys", async (c) => {
    if (managed) {
      return c.notFound();
    }
    const { name } = z.object({ name: z.string().min(1).max(32) }).parse(await c.req.json());
    return c.json(await createLocalKey(name));
  })
  .delete("/api-keys/:id", async (c) => {
    if (managed) {
      return c.notFound();
    }
    await deleteLocalKey(c.req.param("id"));
    return c.json({ ok: true });
  })
  .get("/local/models", (c) => (managed ? c.notFound() : c.json(localModelSettings())))
  .put("/local/models", async (c) => {
    if (managed) {
      return c.notFound();
    }
    const body = z
      .object({
        source: z.enum([...HARNESS_IDS, "account", "own"]).optional(),
        bindings: z.partialRecord(z.enum(MODEL_CLASSES), z.string().max(120)).optional(),
        ollamaUrl: z.string().max(200).optional(),
        keys: z.partialRecord(z.enum(LOCAL_KEYS), z.string().max(400)).optional(),
      })
      .parse(await c.req.json());
    await saveLocalModels(body);
    return c.json(localModelSettings());
  })
  // One short call on a class, as a run would make it: shows that the way to the model is open.
  .post("/local/models/test", async (c) => {
    if (managed) {
      return c.notFound();
    }
    const { cls } = z
      .object({ cls: z.enum(TEXT_CLASSES).default("classifier") })
      .parse(await c.req.json().catch(() => ({})));
    const started = Date.now();
    // The source this call runs on: the person may pick another one while it is under way.
    const source = localModelSettings().source;
    try {
      const resolved = await textModel(cls);
      const result = await generateText({
        model: resolved.model,
        prompt: "Reply with the single word: OK",
        maxOutputTokens: 20,
        abortSignal: AbortSignal.timeout(120_000),
      });
      // A working call is what ends the setup — for the source it ran on.
      const tested = await testedSources();
      if (!tested.includes(source)) {
        await writeSetting("setup-done", [...tested, source]);
      }
      return c.json({
        ok: true,
        ref: resolved.ref,
        reply: result.text.trim().slice(0, 200),
        ms: Date.now() - started,
      });
    } catch (err) {
      const message = (err as Error)?.message ?? String(err);
      return c.json({ ok: false, error: message.slice(0, 500), ms: Date.now() - started });
    }
  })
  // --- the AI clients on this machine: looked at afresh, signed in through the inline terminal ----
  .post("/local/harness/:id/detect", async (c) => {
    const id = c.req.param("id") as HarnessId;
    if (managed || !harness(id)) {
      return c.notFound();
    }
    return c.json({ harness: await detectHarness(id, true) });
  })
  .post("/local/harness/:id/login", async (c) => {
    const id = c.req.param("id") as HarnessId;
    const client = harness(id);
    if (managed || !client) {
      return c.notFound();
    }
    const { cols, rows } = z
      .object({
        cols: z.number().int().min(10).max(500).optional(),
        rows: z.number().int().min(4).max(200).optional(),
      })
      .parse(await c.req.json().catch(() => ({})));
    const cwd = join(env.dataDir, "harness");
    mkdirSync(cwd, { recursive: true });
    const terminal = await openTerminal({
      bin: client.bin,
      args: client.login.args,
      cwd,
      env: { ...(await loginEnv(client)), ...client.login.env },
      cols,
      rows,
      // Signed in: the client says so on its own, and the settings learn it right away.
      until: async () => (await freshAuth(client)) !== "none",
      onDone: () => void detectHarness(id, true),
    });
    return c.json({ terminal });
  })
  .get("/local/terminal/:id/stream", (c) => {
    if (managed) {
      return c.notFound();
    }
    const id = c.req.param("id");
    return streamSSE(c, async (stream) => {
      let ended = false;
      const done = new Promise<void>((resolve) => {
        const unsubscribe = subscribeTerminal(id, (event) => {
          void stream.writeSSE({ event: event.type, data: JSON.stringify(event) });
          if (event.type === "exit") {
            ended = true;
            resolve();
          }
        });
        stream.onAbort(() => {
          unsubscribe();
          resolve();
        });
      });
      // The page keeps the stream open while the terminal lives; a heartbeat keeps proxies from closing it.
      const beat = setInterval(() => {
        if (!ended) {
          void stream.writeSSE({ event: "ping", data: "" });
        }
      }, 15_000);
      await done;
      clearInterval(beat);
    });
  })
  .post("/local/terminal/:id/input", async (c) => {
    if (managed) {
      return c.notFound();
    }
    const { data } = z.object({ data: z.string().max(10_000) }).parse(await c.req.json());
    writeTerminal(c.req.param("id"), data);
    return c.json({ ok: true });
  })
  .post("/local/terminal/:id/resize", async (c) => {
    if (managed) {
      return c.notFound();
    }
    const { cols, rows } = z
      .object({ cols: z.number().int().min(10).max(500), rows: z.number().int().min(4).max(200) })
      .parse(await c.req.json());
    resizeTerminal(c.req.param("id"), cols, rows);
    return c.json({ ok: true });
  })
  .delete("/local/terminal/:id", (c) => {
    if (managed) {
      return c.notFound();
    }
    closeTerminal(c.req.param("id"));
    return c.json({ ok: true });
  })
  .put("/local/chat", async (c) => {
    if (managed) {
      return c.notFound();
    }
    const { engine } = z.object({ engine: z.enum(["models", "claude"]) }).parse(await c.req.json());
    await setChatEngine(engine);
    return c.json({ ok: true });
  })
  .post("/account/link", async (c) => (managed ? c.notFound() : c.json({ url: await startLink() })))
  .delete("/account", async (c) => {
    if (managed) {
      return c.notFound();
    }
    await unlink();
    await saveLocalModels({ source: "own" });
    return c.json({ ok: true });
  });
