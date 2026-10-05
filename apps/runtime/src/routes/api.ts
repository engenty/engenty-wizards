import { Hono } from "hono";
import { z } from "zod";
import { withTenant } from "../db/client.js";
import { authenticate, principalOf } from "../mcp/auth.js";
import { ServiceError } from "../services/errors.js";
import { deleteFile, draftFiles, writeFile } from "../services/files.js";
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

/**
 * The runtime's API for other programs, signed in like an MCP client (access token or API key).
 * `POST /wizards/import` takes a whole wizard — definition and workspace — validated like any
 * other write: this is how a desktop app publishes to the cloud.
 */
export const apiRoutes = new Hono().post("/wizards/import", async (c) => {
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
      await writeFile(who.userId, wizardId, file.path, Buffer.from(file.data, "base64"), file.mime);
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
    // The ID the mobile app takes, for the local studio to show beside the cloud's link.
    const code = await codeOf(current.shareToken);
    return c.json({ wizardId, revision: written.revision, issues: [], ...published, code });
  });
});
