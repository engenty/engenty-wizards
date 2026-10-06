import { type Context, Hono } from "hono";
import { bodyLimit } from "hono/body-limit";
import { z } from "zod";
import { withTenant } from "../db/client.js";
import { allowed } from "../limits.js";
import { authenticate, type Principal, principalOf } from "../mcp/auth.js";
import type { Scope } from "../mcp/scopes.js";
import { ServiceError } from "../services/errors.js";
import { deleteFile, draftFiles, writeFile } from "../services/files.js";
import {
  checkOnServer,
  checkSchema,
  listSyncedSpaces,
  patchSyncedWizard,
  removeSyncedSpace,
  removeSyncedWizard,
  rotateSyncedLink,
  syncDataSchema,
  syncSettingsSchema,
  syncSpaceData,
  syncWizard,
  syncWizardSchema,
} from "../services/spaces.js";
import { createWizard, ownedWizard, publishWizard, writeDraft } from "../services/wizards.js";
import { codeOf, tenantStatus } from "../tenants/control.js";

const importSchema = z.object({
  /** An earlier import's wizard: it is updated instead of a new one being made. */
  wizardId: z.string().optional(),
  projectId: z.string().optional(),
  definition: z.unknown(),
  files: z
    .array(z.object({ path: z.string(), mime: z.string().optional(), data: z.string() }))
    .max(200)
    .default([]),
  publish: z.boolean().default(false),
});

const HOUR = 60 * 60 * 1000;
/** A wizard with its workspace: 25 MB of files as base64, and the definition. */
const WIZARD_BYTES = 48 * 1024 * 1024;

const tooLarge = bodyLimit({
  maxSize: WIZARD_BYTES,
  onError: (c) => c.json({ error: "Request body too large.", code: "too_large" }, 413),
});

/**
 * The caller of an API call, signed in like an MCP client (access token or API key), with the
 * scopes the call needs; or the answer that turns it away.
 */
async function caller(c: Context, scopes: Scope[]): Promise<Principal | Response> {
  const authInfo = await authenticate(c.req.raw);
  if (authInfo instanceof Response) {
    return authInfo;
  }
  const who = principalOf(authInfo);
  if (scopes.some((scope) => !who.scopes.includes(scope))) {
    return c.json({ error: "This token may not do that.", code: "insufficient_scope" }, 403);
  }
  if ((await tenantStatus(who.tenantId)) === "suspended") {
    return c.json({ error: "tenant_suspended" }, 403);
  }
  return who;
}

/** A local install sends when it publishes: more than this an hour is not an install at work. */
function withinSyncLimit(c: Context, who: Principal): Response | null {
  return allowed(`sync:${who.tenantId}`, 240, HOUR)
    ? null
    : c.json(
        { error: "Zu viele Übertragungen. Bitte später noch einmal.", code: "rate_limited" },
        429,
      );
}

/**
 * The runtime's API for other programs. `/spaces/…` is how a local install's project comes
 * here: the wizards it publishes, under the ids they have there (docs/manage-contract.md).
 * `POST /wizards/import` takes a whole wizard as a new one of a tenant that builds here.
 */
export const apiRoutes = new Hono()
  .get("/spaces", async (c) => {
    const who = await caller(c, ["wizards:read"]);
    if (who instanceof Response) {
      return who;
    }
    return withTenant(who.tenantId, async () => c.json({ spaces: await listSyncedSpaces() }));
  })
  .post("/spaces/check", async (c) => {
    const who = await caller(c, ["wizards:read"]);
    if (who instanceof Response) {
      return who;
    }
    const body = checkSchema.parse(await c.req.json());
    return withTenant(who.tenantId, async () => c.json({ problems: await checkOnServer(body) }));
  })
  .put("/spaces/:spaceId/wizards/:wizardId", tooLarge, async (c) => {
    const who = await caller(c, ["wizards:write", "wizards:publish"]);
    if (who instanceof Response) {
      return who;
    }
    const limited = withinSyncLimit(c, who);
    if (limited) {
      return limited;
    }
    const body = syncWizardSchema.parse(await c.req.json());
    return withTenant(who.tenantId, async () =>
      c.json(await syncWizard(c.req.param("spaceId"), c.req.param("wizardId"), body)),
    );
  })
  // The space's own tables and pages, sent with a wizard when they changed.
  .put("/spaces/:spaceId/data", tooLarge, async (c) => {
    const who = await caller(c, ["wizards:write"]);
    if (who instanceof Response) {
      return who;
    }
    const limited = withinSyncLimit(c, who);
    if (limited) {
      return limited;
    }
    const body = syncDataSchema.parse(await c.req.json());
    return withTenant(who.tenantId, async () =>
      c.json(await syncSpaceData(c.req.param("spaceId"), body)),
    );
  })
  .patch("/spaces/:spaceId/wizards/:wizardId", async (c) => {
    const who = await caller(c, ["wizards:publish"]);
    if (who instanceof Response) {
      return who;
    }
    const limited = withinSyncLimit(c, who);
    if (limited) {
      return limited;
    }
    const body = syncSettingsSchema.parse(await c.req.json());
    return withTenant(who.tenantId, async () =>
      c.json(await patchSyncedWizard(c.req.param("spaceId"), c.req.param("wizardId"), body)),
    );
  })
  .post("/spaces/:spaceId/wizards/:wizardId/rotate-link", async (c) => {
    const who = await caller(c, ["wizards:publish"]);
    if (who instanceof Response) {
      return who;
    }
    const limited = withinSyncLimit(c, who);
    if (limited) {
      return limited;
    }
    return withTenant(who.tenantId, async () =>
      c.json(await rotateSyncedLink(who.userId, c.req.param("spaceId"), c.req.param("wizardId"))),
    );
  })
  .delete("/spaces/:spaceId/wizards/:wizardId", async (c) => {
    const who = await caller(c, ["wizards:write"]);
    if (who instanceof Response) {
      return who;
    }
    return withTenant(who.tenantId, async () =>
      c.json(await removeSyncedWizard(who.userId, c.req.param("spaceId"), c.req.param("wizardId"))),
    );
  })
  .delete("/spaces/:spaceId", async (c) => {
    const who = await caller(c, ["wizards:write"]);
    if (who instanceof Response) {
      return who;
    }
    return withTenant(who.tenantId, async () =>
      c.json(await removeSyncedSpace(c.req.param("spaceId"))),
    );
  })
  .post("/wizards/import", tooLarge, async (c) => {
    const authInfo = await authenticate(c.req.raw);
    if (authInfo instanceof Response) {
      return authInfo;
    }
    const who = principalOf(authInfo);
    const body = importSchema.parse(await c.req.json());
    if (
      !who.scopes.includes("wizards:write") ||
      (body.publish && !who.scopes.includes("wizards:publish"))
    ) {
      return c.json({ error: "This token may not do that.", code: "insufficient_scope" }, 403);
    }
    if ((await tenantStatus(who.tenantId)) === "suspended") {
      return c.json({ error: "tenant_suspended" }, 403);
    }
    return withTenant(who.tenantId, async () => {
      const writer = { source: "mcp" as const, client: who.client };
      let wizardId = body.wizardId;
      if (wizardId) {
        const existing = await ownedWizard(who.userId, wizardId).catch(() => null);
        wizardId = existing?.id;
      }
      if (!wizardId) {
        // The workspace must be there before the definition is checked against it.
        const created = await createWizard(who.userId, { projectId: body.projectId }, writer);
        wizardId = created.id;
      }
      const incoming = new Set(body.files.map((f) => f.path));
      for (const old of await draftFiles(wizardId)) {
        if (!incoming.has(old.path)) {
          await deleteFile(who.userId, wizardId, old.path);
        }
      }
      for (const file of body.files) {
        await writeFile(
          who.userId,
          wizardId,
          file.path,
          Buffer.from(file.data, "base64"),
          file.mime,
        );
      }
      const current = await ownedWizard(who.userId, wizardId);
      const written = await writeDraft(
        who.userId,
        wizardId,
        { definition: body.definition, baseRevision: current.revision },
        writer,
      );
      if (!body.publish) {
        return c.json({ wizardId, revision: written.revision, issues: written.issues });
      }
      if (written.issues.length) {
        throw new ServiceError("has_issues", "Der Wizard hat noch Fehler.", {
          issues: written.issues,
          wizardId,
        });
      }
      const published = await publishWizard(who.userId, wizardId);
      // The ID the mobile app takes.
      const code = await codeOf(current.shareToken);
      return c.json({ wizardId, revision: written.revision, issues: [], ...published, code });
    });
  });
