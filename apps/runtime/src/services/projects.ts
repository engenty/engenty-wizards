import { FACT_TYPES, PROJECT_LIMITS, type ProjectFact } from "@engenty-wizards/shared/projects";
import { and, count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { env } from "../env.js";
import { managed, tenantInfo } from "../manage.js";
import { currentTenant } from "../tenants/tenant.js";
import { notFound, ServiceError } from "./errors.js";
import { forgetWizardLinks } from "./links.js";
import { removeProjectFiles } from "./project-files.js";

export type ProjectRow = typeof schema.project.$inferSelect;

const MASK = "••••";

export const mcpServerSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
  name: z.string().min(1).max(60),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const brandColorSchema = z.object({
  name: z.string().max(120),
  value: z.string().regex(/^#[0-9a-fA-F]{6}$/),
});

export const projectFactSchema = z.object({
  key: z.string().regex(/^[a-z0-9_]{1,40}$/),
  label: z.string().min(1).max(80),
  value: z.string().max(4000),
  type: z.enum(FACT_TYPES).optional(),
});

export const projectPatchSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  brand: z
    .object({
      name: z.string().max(120).optional(),
      about: z.string().max(8000).optional(),
      colors: z.array(brandColorSchema).max(PROJECT_LIMITS.colors).optional(),
    })
    .optional(),
  facts: z.array(projectFactSchema).max(PROJECT_LIMITS.facts).optional(),
  mcpServers: z.array(mcpServerSchema).max(10).optional(),
});

/**
 * How many projects the tenant works with: the number the Manage-App gives for it, else this
 * runtime's (`LIMIT_PROJECTS`, one unless set). The studio shows a project switcher only above
 * one. Projects beyond the number stay in the database and are not listed.
 */
export async function projectLimit(): Promise<number> {
  if (managed) {
    const info = await tenantInfo(currentTenant()).catch(() => null);
    if (info?.limits.projects) {
      return info.limits.projects;
    }
  }
  return Math.max(1, env.limits.projects);
}

export async function ownedProject(_userId: string, projectId: string): Promise<ProjectRow> {
  const p = await db.query.project.findFirst({
    where: and(eq(schema.project.id, projectId), eq(schema.project.tenantId, currentTenant())),
  });
  if (!p) {
    throw notFound();
  }
  return p;
}

/** A tenant always has a project: the first one is made when its studio is first opened. */
async function ensureProject(): Promise<void> {
  const any = await db.query.project.findFirst({
    where: eq(schema.project.tenantId, currentTenant()),
  });
  if (!any) {
    await db
      .insert(schema.project)
      .values({ id: nanoid(12), tenantId: currentTenant(), name: "Meine Wizards" });
  }
}

/** The project a wizard lands in when the caller names none: the oldest one. */
export async function defaultProject(_userId: string): Promise<ProjectRow> {
  await ensureProject();
  const p = await db.query.project.findFirst({
    where: eq(schema.project.tenantId, currentTenant()),
    orderBy: [schema.project.createdAt],
  });
  if (!p) {
    throw notFound();
  }
  return p;
}

export async function listProjects(_userId: string) {
  await ensureProject();
  // The oldest come first: with a limit of one, that is the project everything lands in.
  const projects = await db.query.project.findMany({
    where: eq(schema.project.tenantId, currentTenant()),
    orderBy: [schema.project.createdAt],
    limit: await projectLimit(),
  });
  const counts = await db
    .select({ projectId: schema.wizard.projectId, n: count() })
    .from(schema.wizard)
    .where(eq(schema.wizard.tenantId, currentTenant()))
    .groupBy(schema.wizard.projectId);
  return projects.map((p) => ({
    ...p,
    wizardCount: counts.find((x) => x.projectId === p.id)?.n ?? 0,
  }));
}

/** MCP server headers carry the admin's credentials: shown masked, kept when sent back masked. */
export function maskedServers(p: ProjectRow) {
  return p.mcpServers.map((s) => ({
    ...s,
    headers: s.headers
      ? Object.fromEntries(Object.keys(s.headers).map((k) => [k, MASK]))
      : undefined,
  }));
}

export async function createProject(_userId: string, name: string): Promise<{ id: string }> {
  const [{ n }] = await db
    .select({ n: count() })
    .from(schema.project)
    .where(eq(schema.project.tenantId, currentTenant()));
  const limit = await projectLimit();
  if (n >= limit) {
    throw new ServiceError(
      "refused",
      limit === 1 ? "Hier gibt es ein Projekt." : `Höchstens ${limit} Projekte.`,
    );
  }
  const id = nanoid(12);
  await db
    .insert(schema.project)
    .values({ id, tenantId: currentTenant(), name, brand: {}, mcpServers: [] });
  return { id };
}

export async function updateProject(
  userId: string,
  projectId: string,
  patch: z.infer<typeof projectPatchSchema>,
) {
  const p = await ownedProject(userId, projectId);
  const mcpServers = patch.mcpServers?.map((s) => {
    const before = p.mcpServers.find((x) => x.id === s.id);
    const headers = s.headers
      ? Object.fromEntries(
          Object.entries(s.headers).map(([k, v]) => [
            k,
            v === MASK ? (before?.headers?.[k] ?? "") : v,
          ]),
        )
      : undefined;
    return { ...s, headers };
  });
  if (patch.facts && new Set(patch.facts.map((f) => f.key)).size !== patch.facts.length) {
    throw new ServiceError("invalid", "Zwei Einträge haben denselben Schlüssel.");
  }
  await db
    .update(schema.project)
    .set({
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.brand ? { brand: { ...p.brand, ...patch.brand } } : {}),
      ...(patch.facts ? { facts: patch.facts } : {}),
      ...(mcpServers ? { mcpServers } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.project.id, p.id));
}

/** What a step knows of the project it runs in: who it is, its colours and its facts. */
export interface ProjectProfile {
  name: string;
  about: string;
  colors: { name: string; value: string }[];
  facts: ProjectFact[];
}

export function projectProfile(p: ProjectRow): ProjectProfile {
  return {
    name: p.brand.name ?? "",
    about: p.brand.about ?? "",
    colors: p.brand.colors ?? [],
    facts: p.facts.filter((f) => f.value.trim()),
  };
}

export async function deleteProject(_userId: string, projectId: string) {
  const all = await db.query.project.findMany({
    where: eq(schema.project.tenantId, currentTenant()),
  });
  if (all.length <= 1) {
    throw new ServiceError("refused", "Das letzte Projekt bleibt.");
  }
  const wizards = await db
    .select({ id: schema.wizard.id })
    .from(schema.wizard)
    .where(eq(schema.wizard.projectId, projectId));
  for (const w of wizards) {
    await forgetWizardLinks(w.id);
  }
  await removeProjectFiles(projectId);
  await db
    .delete(schema.project)
    .where(and(eq(schema.project.id, projectId), eq(schema.project.tenantId, currentTenant())));
}
