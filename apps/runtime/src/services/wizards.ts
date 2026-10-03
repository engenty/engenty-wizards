import {
  type ValidationIssue,
  validateWizard,
  type WizardDefinition,
  wizardSchema,
} from "@engenty-wizards/shared/definition";
import { and, desc, eq, sql } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { z } from "zod";
import { applyOps, OpError, type WizardOp } from "../authoring/ops.js";
import { listConnectors } from "../connectors/external.js";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { starterById } from "../starters/index.js";
import { dropLinks, putLink } from "../tenants/control.js";
import { currentTenant } from "../tenants/tenant.js";
import { changedSteps, emitDraftChanged } from "./draft-events.js";
import { notFound, ServiceError } from "./errors.js";
import { copyFiles, draftFiles, sameFiles } from "./files.js";
import { forgetWizardLinks } from "./links.js";
import { defaultProject, ownedProject } from "./projects.js";

export type WizardRow = typeof schema.wizard.$inferSelect;

/** Who wrote: the studio, or an admin's own MCP client (named after its API key). */
export type Writer = { source: "studio" } | { source: "mcp"; client: string };

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

export const studioUrl = (wizardId: string) => `${env.appUrl}/w/${wizardId}`;
export const shareUrl = (token: string) => `${env.appUrl}/w/${token}`;
const newShareToken = () => nanoid(14);

export async function ownedWizard(_userId: string, wizardId: string): Promise<WizardRow> {
  const w = await db.query.wizard.findFirst({
    where: and(eq(schema.wizard.id, wizardId), eq(schema.wizard.tenantId, currentTenant())),
  });
  if (!w) {
    throw notFound();
  }
  return w;
}

export function wizardSummary(w: WizardRow) {
  return {
    id: w.id,
    projectId: w.projectId,
    title: w.title,
    description: w.draft.description,
    avatar: w.draft.avatar,
    revision: w.revision,
    published: w.publishedVersion !== null,
    publishedVersion: w.publishedVersion,
    shareToken: w.shareToken,
    shareEnabled: w.shareEnabled,
    dailyRunLimit: w.dailyRunLimit,
    stepCount: w.draft.steps.length,
    updatedAt: w.updatedAt.toISOString(),
  };
}

export async function listWizards(_userId: string, projectId?: string) {
  const rows = await db.query.wizard.findMany({
    where: and(
      eq(schema.wizard.tenantId, currentTenant()),
      projectId ? eq(schema.wizard.projectId, projectId) : undefined,
    ),
    orderBy: [desc(schema.wizard.updatedAt)],
  });
  return rows.map(wizardSummary);
}

async function publishedVersion(w: WizardRow) {
  if (w.publishedVersion === null) {
    return null;
  }
  const v = await db.query.wizardVersion.findFirst({
    where: and(
      eq(schema.wizardVersion.wizardId, w.id),
      eq(schema.wizardVersion.version, w.publishedVersion),
    ),
  });
  return v ?? null;
}

/** Connections must name connectors the project has imported, and actions those connectors have. */
async function connectorIssues(projectId: string, draft: WizardDefinition) {
  const wanted = (draft.connections ?? []).filter((c) => c.connector);
  if (!wanted.length) {
    return [];
  }
  const issues: ValidationIssue[] = [];
  const connectors = await listConnectors(projectId);
  for (const connection of wanted) {
    const connector = connectors.find((c) => c.id === connection.connector);
    if (!connector) {
      issues.push({
        message: `Connection "${connection.id}" uses connector "${connection.connector}", which this project has not imported.`,
      });
      continue;
    }
    const unknown = (connection.actions ?? []).filter(
      (a) => !connector.actions.some((x) => x.id === a),
    );
    if (unknown.length && !connector.toolsPending) {
      issues.push({
        message: `Connection "${connection.id}": ${connector.name} has no action ${unknown.map((a) => `"${a}"`).join(", ")}.`,
      });
    }
  }
  return issues;
}

/** Everything wrong with a draft: its structure, its workspace files, its project's connectors. */
async function checkDraft(projectId: string, draft: WizardDefinition, files: string[]) {
  return [...validateWizard(draft, files), ...(await connectorIssues(projectId, draft))];
}

/** Validator issues of the draft, checked against its workspace and the project's connectors. */
export async function draftIssues(w: WizardRow) {
  const files = await draftFiles(w.id);
  return checkDraft(
    w.projectId,
    w.draft,
    files.map((f) => f.path),
  );
}

/** The draft with its validator issues and whether it differs from the published version. */
export async function wizardState(w: WizardRow) {
  const published = await publishedVersion(w);
  const files = await draftFiles(w.id);
  return {
    ...wizardSummary(w),
    draft: w.draft,
    files,
    issues: await checkDraft(
      w.projectId,
      w.draft,
      files.map((f) => f.path),
    ),
    dirty:
      !published ||
      JSON.stringify(published.definition) !== JSON.stringify(w.draft) ||
      !sameFiles(published.files, files),
    shareUrl: shareUrl(w.shareToken),
    studioUrl: studioUrl(w.id),
  };
}

export async function wizardMessages(wizardId: string) {
  return db.query.wizardMessage.findMany({
    where: eq(schema.wizardMessage.wizardId, wizardId),
    orderBy: [schema.wizardMessage.createdAt],
  });
}

export async function addMessage(
  wizardId: string,
  message: { role: "user" | "assistant"; content: string; changed?: boolean },
  writer: Writer = { source: "studio" },
): Promise<string> {
  const id = nanoid(12);
  await db.insert(schema.wizardMessage).values({
    id,
    wizardId,
    role: message.role,
    content: message.content,
    changed: message.changed ?? false,
    source: writer.source,
    client: writer.source === "mcp" ? writer.client : null,
  });
  return id;
}

function stepLabel(raw: unknown, index: number): string {
  const steps = (raw as { steps?: unknown[] } | null)?.steps;
  const id = (steps?.[index] as { id?: unknown } | undefined)?.id;
  return typeof id === "string" ? `steps[${index}] "${id}"` : `steps[${index}]`;
}

/** The schema check every write passes. Validator issues are allowed in a draft; a wrong shape is not. */
export function parseDraft(
  raw: unknown,
  files?: string[],
): { draft: WizardDefinition; issues: ValidationIssue[] } {
  const parsed = wizardSchema.safeParse(raw);
  if (!parsed.success) {
    throw new ServiceError("invalid", "The wizard does not match the schema.", {
      issues: shapeIssues(parsed.error, raw),
    });
  }
  return { draft: parsed.data, issues: validateWizard(parsed.data, files) };
}

export function shapeIssues(error: z.ZodError, raw: unknown): ValidationIssue[] {
  return error.issues.map((i) => {
    const [head, index, ...rest] = i.path;
    const where =
      head === "steps" && typeof index === "number"
        ? [stepLabel(raw, index), ...rest].join(".")
        : i.path.join(".");
    return { message: `${where || "wizard"}: ${i.message}` };
  });
}

export async function createWizard(
  userId: string,
  input: { projectId?: string; starterId?: string; definition?: unknown; note?: string },
  writer: Writer = { source: "studio" },
) {
  const project = input.projectId
    ? await ownedProject(userId, input.projectId)
    : await defaultProject(userId);
  const starter = input.starterId ? starterById(input.starterId) : undefined;
  if (input.starterId && !starter) {
    throw new ServiceError("invalid", `There is no starter "${input.starterId}".`);
  }
  const { draft, issues } =
    input.definition !== undefined
      ? parseDraft(input.definition)
      : { draft: structuredClone(starter?.definition ?? BLANK), issues: [] };
  const id = nanoid(12);
  const shareToken = newShareToken();
  await db.insert(schema.wizard).values({
    id,
    projectId: project.id,
    tenantId: currentTenant(),
    title: draft.title,
    draft,
    shareToken,
    dailyRunLimit: env.limits.defaultDailyRuns,
    starter: input.definition === undefined ? (starter?.id ?? null) : null,
  });
  await putLink(shareToken, "wizard", id);
  if (input.note) {
    await addMessage(id, { role: "assistant", content: input.note, changed: true }, writer);
  } else if (starter && input.definition === undefined) {
    await addMessage(id, {
      role: "assistant",
      content: `Ich habe den Starter „${starter.title}“ für dich angelegt. Teste ihn rechts oben – oder sag mir, was anders sein soll.`,
    });
  }
  return { id, revision: 0, issues, studioUrl: studioUrl(id) };
}

/**
 * Replaces the draft if nobody wrote since `baseRevision`. Every draft write — studio inspector,
 * architect, MCP — goes through here, so the revision counts all of them.
 */
export async function writeDraft(
  userId: string,
  wizardId: string,
  input: { definition: unknown; baseRevision: number; note?: string },
  writer: Writer = { source: "studio" },
) {
  const w = await ownedWizard(userId, wizardId);
  const files = await draftFiles(w.id);
  const paths = files.map((f) => f.path);
  const { draft } = parseDraft(input.definition, paths);
  const issues = await checkDraft(w.projectId, draft, paths);
  const [row] = await db
    .update(schema.wizard)
    .set({
      draft,
      title: draft.title,
      revision: sql`${schema.wizard.revision} + 1`,
      updatedAt: new Date(),
    })
    .where(and(eq(schema.wizard.id, w.id), eq(schema.wizard.revision, input.baseRevision)))
    .returning({ revision: schema.wizard.revision });
  if (!row) {
    const current = await ownedWizard(userId, wizardId);
    throw new ServiceError("revision_conflict", "Der Wizard wurde inzwischen geändert.", {
      revision: current.revision,
    });
  }
  if (input.note) {
    await addMessage(w.id, { role: "assistant", content: input.note, changed: true }, writer);
  }
  emitDraftChanged({
    wizardId: w.id,
    kind: "draft",
    revision: row.revision,
    source: writer.source,
    client: writer.source === "mcp" ? writer.client : null,
    note: input.note ?? null,
    touched: changedSteps(w.draft, draft),
  });
  return { revision: row.revision, issues, draft };
}

export async function editWizard(
  userId: string,
  wizardId: string,
  input: { ops: WizardOp[]; baseRevision: number; note?: string },
  writer: Writer,
) {
  const w = await ownedWizard(userId, wizardId);
  if (w.revision !== input.baseRevision) {
    throw new ServiceError("revision_conflict", "Der Wizard wurde inzwischen geändert.", {
      revision: w.revision,
    });
  }
  let definition: unknown;
  try {
    definition = applyOps(w.draft, input.ops);
  } catch (err) {
    if (err instanceof OpError) {
      throw new ServiceError("invalid", err.message);
    }
    throw err;
  }
  return writeDraft(
    userId,
    wizardId,
    { definition, baseRevision: input.baseRevision, note: input.note },
    writer,
  );
}

export async function updateWizardSettings(
  userId: string,
  wizardId: string,
  patch: { shareEnabled?: boolean; dailyRunLimit?: number; projectId?: string },
) {
  const w = await ownedWizard(userId, wizardId);
  if (patch.projectId) {
    await ownedProject(userId, patch.projectId);
  }
  await db
    .update(schema.wizard)
    .set({ ...patch, updatedAt: new Date() })
    .where(eq(schema.wizard.id, w.id));
  return wizardSummary(await ownedWizard(userId, wizardId));
}

export async function rotateShareLink(userId: string, wizardId: string) {
  const w = await ownedWizard(userId, wizardId);
  const token = newShareToken();
  await db
    .update(schema.wizard)
    .set({ shareToken: token, updatedAt: new Date() })
    .where(eq(schema.wizard.id, w.id));
  await dropLinks([w.shareToken]);
  await putLink(token, "wizard", w.id);
  return { shareToken: token, shareUrl: shareUrl(token) };
}

export async function duplicateWizard(userId: string, wizardId: string) {
  const w = await ownedWizard(userId, wizardId);
  const id = nanoid(12);
  const draft = { ...w.draft, title: `${w.draft.title} (Kopie)` };
  const shareToken = newShareToken();
  await db.insert(schema.wizard).values({
    id,
    projectId: w.projectId,
    tenantId: currentTenant(),
    title: draft.title,
    draft,
    shareToken,
    dailyRunLimit: w.dailyRunLimit,
    starter: w.starter,
  });
  await putLink(shareToken, "wizard", id);
  await copyFiles(w.id, id);
  return { id };
}

export async function deleteWizard(_userId: string, wizardId: string) {
  await forgetWizardLinks(wizardId);
  await db
    .delete(schema.wizard)
    .where(and(eq(schema.wizard.id, wizardId), eq(schema.wizard.tenantId, currentTenant())));
}

/** A wizard with validator issues is never published — same rule for studio and MCP. */
export async function requireClean(w: WizardRow) {
  const files = await draftFiles(w.id);
  const issues = await checkDraft(
    w.projectId,
    w.draft,
    files.map((f) => f.path),
  );
  if (issues.length) {
    throw new ServiceError("has_issues", "Der Wizard hat noch Fehler.", { issues });
  }
  return { definition: w.draft, files };
}

export async function publishWizard(userId: string, wizardId: string) {
  const w = await ownedWizard(userId, wizardId);
  const { definition, files } = await requireClean(w);
  const version = (w.publishedVersion ?? 0) + 1;
  await db
    .insert(schema.wizardVersion)
    .values({ id: nanoid(12), wizardId: w.id, version, definition, files });
  await db
    .update(schema.wizard)
    .set({ publishedVersion: version, updatedAt: new Date() })
    .where(eq(schema.wizard.id, w.id));
  return { version, shareUrl: shareUrl(w.shareToken), shareEnabled: w.shareEnabled };
}
