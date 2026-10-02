import type { CallToolResult, McpServer, ToolCallback } from "@modelcontextprotocol/server";
import { z } from "zod";
import { authoringGuide } from "../authoring/guide.js";
import { wizardOpSchema } from "../authoring/ops.js";
import { RunConflict } from "../engine/runner.js";
import { ServiceError } from "../services/errors.js";
import { deleteFile, listFiles, readFileText, writeFile } from "../services/files.js";
import { defaultProject, listProjects, ownedProject } from "../services/projects.js";
import { startTestRun, testRunReport } from "../services/runs.js";
import { checkDraftWidget } from "../services/widgets.js";
import {
  createWizard,
  editWizard,
  listWizards,
  ownedWizard,
  parseDraft,
  publishWizard,
  shareUrl,
  studioUrl,
  updateWizardSettings,
  type Writer,
  wizardState,
  writeDraft,
} from "../services/wizards.js";
import { STARTERS, starterById } from "../starters/index.js";
import type { Principal } from "./auth.js";
import type { Scope } from "./scopes.js";

const definition = z
  .record(z.string(), z.unknown())
  .describe("The complete wizard JSON as described by get_authoring_guide.");
const note = z
  .string()
  .max(500)
  .optional()
  .describe(
    "One sentence for the admin about what changed, in their language. Shown in the studio.",
  );
const baseRevision = z
  .number()
  .int()
  .min(0)
  .describe("The revision you last read. A newer one on the server answers revision_conflict.");

function ok(value: unknown): CallToolResult {
  return {
    content: [{ type: "text", text: typeof value === "string" ? value : JSON.stringify(value) }],
  };
}

function failure(err: unknown): CallToolResult {
  let body: unknown;
  if (err instanceof ServiceError) {
    body = err.toJSON();
  } else if (err instanceof RunConflict) {
    body = { error: err.message, code: "conflict" };
  } else if (err instanceof z.ZodError) {
    body = { error: "Invalid input", code: "invalid", issues: err.issues };
  } else {
    console.error("[mcp]", err);
    body = { error: "Internal error", code: "internal" };
  }
  return { isError: true, content: [{ type: "text", text: JSON.stringify(body) }] };
}

export function registerTools(server: McpServer, who: Principal) {
  const writer: Writer = { source: "mcp", client: who.client };
  const tool = <S extends z.ZodObject>(
    name: string,
    scope: Scope,
    config: { title: string; description: string; input: S; readOnly?: boolean },
    run: (args: z.infer<S>) => Promise<unknown>,
  ) => {
    if (!who.scopes.includes(scope)) {
      return;
    }
    server.registerTool(
      name,
      {
        title: config.title,
        description: config.description,
        inputSchema: config.input,
        annotations: { readOnlyHint: config.readOnly ?? false, openWorldHint: false },
      },
      // The SDK has parsed `args` with `input` before this runs.
      (async (args: z.infer<S>) => {
        try {
          return ok(await run(args));
        } catch (err) {
          return failure(err);
        }
      }) as ToolCallback<S>,
    );
  };

  // --- read ------------------------------------------------------------------
  tool(
    "get_authoring_guide",
    "wizards:read",
    {
      title: "Authoring guide",
      description:
        "Read this before writing a wizard: the JSON schema, field kinds, step types and tools, templates, design rules, and the MCP servers of the project.",
      input: z.object({
        projectId: z.string().optional().describe("Defaults to the admin's first project."),
      }),
      readOnly: true,
    },
    async ({ projectId }) => {
      const project = projectId
        ? await ownedProject(who.userId, projectId)
        : await defaultProject(who.userId);
      return authoringGuide(project.mcpServers.map((s) => ({ id: s.id, name: s.name })));
    },
  );

  tool(
    "list_starters",
    "wizards:read",
    {
      title: "List starters",
      description:
        "The ready-made example wizards (tweet with image, video ad, research briefing, dashboard, invoice, offer).",
      input: z.object({}),
      readOnly: true,
    },
    async () => STARTERS.map((s) => ({ id: s.id, title: s.title, pitch: s.pitch })),
  );

  tool(
    "get_starter",
    "wizards:read",
    {
      title: "Get starter",
      description: "A starter's complete wizard JSON — the best example to copy from.",
      input: z.object({ starterId: z.string() }),
      readOnly: true,
    },
    async ({ starterId }) => {
      const starter = starterById(starterId);
      if (!starter) {
        throw new ServiceError("not_found", `There is no starter "${starterId}".`);
      }
      return starter.definition;
    },
  );

  tool(
    "list_projects",
    "wizards:read",
    {
      title: "List projects",
      description: "The admin's projects. Each holds wizards, a brand and MCP servers.",
      input: z.object({}),
      readOnly: true,
    },
    async () =>
      (await listProjects(who.userId)).map((p) => ({
        id: p.id,
        name: p.name,
        wizardCount: p.wizardCount,
      })),
  );

  tool(
    "list_wizards",
    "wizards:read",
    {
      title: "List wizards",
      description: "The admin's wizards, newest first.",
      input: z.object({ projectId: z.string().optional() }),
      readOnly: true,
    },
    async ({ projectId }) =>
      (await listWizards(who.userId, projectId)).map((w) => ({
        id: w.id,
        projectId: w.projectId,
        title: w.title,
        revision: w.revision,
        published: w.published,
        updatedAt: w.updatedAt,
        studioUrl: studioUrl(w.id),
      })),
  );

  tool(
    "get_wizard",
    "wizards:read",
    {
      title: "Get wizard",
      description:
        "A wizard's draft with its revision and validator issues, whether it differs from the published version, and its links.",
      input: z.object({ wizardId: z.string() }),
      readOnly: true,
    },
    async ({ wizardId }) => {
      const s = await wizardState(await ownedWizard(who.userId, wizardId));
      return {
        wizardId: s.id,
        projectId: s.projectId,
        revision: s.revision,
        draft: s.draft,
        issues: s.issues,
        publishedVersion: s.publishedVersion,
        dirty: s.dirty,
        shareEnabled: s.shareEnabled,
        dailyRunLimit: s.dailyRunLimit,
        shareUrl: s.shareUrl,
        studioUrl: s.studioUrl,
      };
    },
  );

  tool(
    "validate_wizard",
    "wizards:read",
    {
      title: "Validate wizard",
      description: "Check a wizard JSON without saving it. Returns ok and the issues.",
      input: z.object({ definition }),
      readOnly: true,
    },
    async (args) => {
      try {
        const { issues } = parseDraft(args.definition);
        return { ok: issues.length === 0, issues };
      } catch (err) {
        if (err instanceof ServiceError && err.code === "invalid") {
          return { ok: false, issues: err.data.issues };
        }
        throw err;
      }
    },
  );

  // --- write -----------------------------------------------------------------
  tool(
    "create_wizard",
    "wizards:write",
    {
      title: "Create wizard",
      description:
        "Create a wizard from your JSON, or copy a starter. The draft may still have issues; fix them with edit_wizard.",
      input: z.object({
        projectId: z.string().optional().describe("Defaults to the admin's first project."),
        definition: definition.optional(),
        starterId: z.string().optional().describe("Copy this starter instead of sending JSON."),
        note,
      }),
    },
    async (args) => {
      const created = await createWizard(who.userId, args, writer);
      return {
        wizardId: created.id,
        revision: created.revision,
        issues: created.issues,
        studioUrl: created.studioUrl,
      };
    },
  );

  tool(
    "edit_wizard",
    "wizards:write",
    {
      title: "Edit wizard",
      description: `Apply ops to the draft atomically, in order:
- set_meta {title?, description?, avatar?, intro? (null removes)}
- upsert_step {step (complete), before?|after?}: replaces the step with that id, else inserts it (default: before the final result step)
- remove_step {stepId}
- move_step {stepId, before|after}
Returns the new revision and the issues.`,
      input: z.object({
        wizardId: z.string(),
        baseRevision,
        ops: z.array(wizardOpSchema).min(1).max(50),
        note,
      }),
    },
    async ({ wizardId, ...input }) => {
      const { revision, issues } = await editWizard(who.userId, wizardId, input, writer);
      return { revision, issues };
    },
  );

  tool(
    "replace_wizard",
    "wizards:write",
    {
      title: "Replace wizard",
      description: "Replace the whole draft. Use edit_wizard for smaller changes.",
      input: z.object({ wizardId: z.string(), baseRevision, definition, note }),
    },
    async ({ wizardId, ...input }) => {
      const { revision, issues } = await writeDraft(who.userId, wizardId, input, writer);
      return { revision, issues };
    },
  );

  // --- publish ---------------------------------------------------------------
  tool(
    "publish_wizard",
    "wizards:publish",
    {
      title: "Publish wizard",
      description:
        "Publish the draft as a new version behind the share link. Refused while the draft has issues. Only when the admin asked for it.",
      input: z.object({ wizardId: z.string() }),
    },
    async ({ wizardId }) => publishWizard(who.userId, wizardId),
  );

  tool(
    "set_sharing",
    "wizards:publish",
    {
      title: "Set sharing",
      description: "Turn the share link on or off, or change how many runs it allows per day.",
      input: z.object({
        wizardId: z.string(),
        enabled: z.boolean().optional(),
        dailyRunLimit: z.number().int().min(1).max(10_000).optional(),
      }),
    },
    async ({ wizardId, enabled, dailyRunLimit }) => {
      const w = await updateWizardSettings(who.userId, wizardId, {
        shareEnabled: enabled,
        dailyRunLimit,
      });
      return {
        shareEnabled: w.shareEnabled,
        dailyRunLimit: w.dailyRunLimit,
        shareUrl: shareUrl(w.shareToken),
      };
    },
  );

  // --- test runs ---------------------------------------------------------------
  tool(
    "start_test_run",
    "runs:test",
    {
      title: "Start test run",
      description:
        "Run the draft once with your answers. SPENDS THE ADMIN'S CREDITS (short copy + image ~15, research ~150, video ~250). Pages are filled from `answers`, reviews accepted when acceptReviews is true. Follow it with get_test_run.",
      input: z.object({
        wizardId: z.string(),
        answers: z
          .record(z.string(), z.unknown())
          .default({})
          .describe(
            "Field id → value, for every page (field ids are unique in a wizard). Items fields take an array of row objects.",
          ),
        acceptReviews: z.boolean().default(true),
      }),
    },
    async ({ wizardId, answers, acceptReviews }) =>
      startTestRun(who.userId, wizardId, { answers, acceptReviews }),
  );

  tool(
    "get_test_run",
    "runs:test",
    {
      title: "Get test run",
      description:
        "Status, recent events, outputs (text clipped) with signed download links valid one hour, credits spent, and what the run waits for.",
      input: z.object({
        runId: z.string(),
        waitSeconds: z
          .number()
          .int()
          .min(0)
          .max(45)
          .default(0)
          .describe("Wait up to this long while the run is still working."),
      }),
      readOnly: true,
    },
    async ({ runId, waitSeconds }) => testRunReport(who.userId, runId, waitSeconds),
  );

  // --- workspace (widget code, libraries, reference data) --------------------
  tool(
    "list_files",
    "wizards:read",
    {
      title: "List workspace files",
      description:
        "The wizard's workspace: widget HTML/JS/CSS, vendored libraries, reference data. Runs use a snapshot of it.",
      input: z.object({ wizardId: z.string() }),
      readOnly: true,
    },
    async ({ wizardId }) =>
      (await listFiles(who.userId, wizardId)).map(({ path, mime, size }) => ({ path, mime, size })),
  );

  tool(
    "read_file",
    "wizards:read",
    {
      title: "Read workspace file",
      description: "A workspace file as text (binary files are described, not returned).",
      input: z.object({ wizardId: z.string(), path: z.string() }),
      readOnly: true,
    },
    async ({ wizardId, path }) => readFileText(who.userId, wizardId, path),
  );

  tool(
    "write_file",
    "wizards:write",
    {
      title: "Write workspace file",
      description:
        "Create or overwrite a workspace file: `content` for text (HTML, JS, CSS, JSON, CSV, SVG) or `base64` for binary (images, fonts). Max 5 MB per file, 25 MB per workspace. A widget may only use files from here — no network when it runs.",
      input: z.object({
        wizardId: z.string(),
        path: z.string().describe('Relative path, e.g. "weather/index.html" or "lib/d3.min.js".'),
        content: z.string().optional(),
        base64: z.string().optional(),
        mime: z.string().optional(),
      }),
    },
    async ({ wizardId, path, content, base64, mime }) => {
      if ((content === undefined) === (base64 === undefined)) {
        throw new ServiceError("invalid", "Pass either content or base64.");
      }
      return writeFile(
        who.userId,
        wizardId,
        path,
        content ?? Buffer.from(base64 ?? "", "base64"),
        mime,
      );
    },
  );

  tool(
    "delete_file",
    "wizards:write",
    {
      title: "Delete workspace file",
      description: "Remove a file from the workspace.",
      input: z.object({ wizardId: z.string(), path: z.string() }),
    },
    async ({ wizardId, path }) => {
      await deleteFile(who.userId, wizardId, path);
      return { ok: true };
    },
  );

  if (who.scopes.includes("wizards:read")) {
    const input = z.object({
      wizardId: z.string(),
      stepId: z.string().describe("A widget step of the draft."),
      data: z
        .record(z.string(), z.unknown())
        .optional()
        .describe("Data to show instead of the step's sample file."),
    });
    server.registerTool(
      "check_widget",
      {
        title: "Check widget",
        description:
          "Load a widget step of the draft in a real browser with its sample data: script errors, the timeline it registered (seconds, for the MP4 export) and a screenshot.",
        inputSchema: input,
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      (async ({ wizardId, stepId, data }: z.infer<typeof input>) => {
        try {
          const r = await checkDraftWidget(who.userId, wizardId, stepId, data);
          return {
            content: [
              {
                type: "text",
                text: JSON.stringify({
                  errors: r.errors,
                  timelineSeconds: r.duration,
                  size: r.size,
                  bundleBytes: r.bytes,
                }),
              },
              { type: "image", data: Buffer.from(r.png).toString("base64"), mimeType: "image/png" },
            ],
          } satisfies CallToolResult;
        } catch (err) {
          return failure(err);
        }
      }) as ToolCallback<typeof input>,
    );
  }
}

export function registerPrompts(server: McpServer) {
  server.registerPrompt(
    "design_wizard",
    {
      title: "Design a wizard",
      description: "Build an engenty wizard from a description.",
      argsSchema: z.object({ description: z.string().describe("What the wizard should do.") }),
    },
    ({ description }) => ({
      messages: [
        {
          role: "user",
          content: {
            type: "text",
            text: `Build an engenty wizard: ${description}

1. Call get_authoring_guide and follow its rules.
2. Pick the closest starter (list_starters, get_starter) as an example.
3. create_wizard with a short note; fix every issue with edit_wizard.
4. start_test_run with realistic answers, then get_test_run with waitSeconds until it is done; fix what looks wrong.
5. Give me the studioUrl and a short summary. Publish only if I ask.`,
          },
        },
      ],
    }),
  );
}
