import { and, count, eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import { z } from "zod";
import { db, schema } from "../db/client.js";
import { saveAsset } from "../storage.js";
import { notFound, ServiceError } from "./errors.js";

export type ProjectRow = typeof schema.project.$inferSelect;

const MASK = "••••";

export const mcpServerSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_]{0,30}$/),
  name: z.string().min(1).max(60),
  url: z.string().url(),
  headers: z.record(z.string(), z.string()).optional(),
});

export const projectPatchSchema = z.object({
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
});

export async function ownedProject(userId: string, projectId: string): Promise<ProjectRow> {
  const p = await db.query.project.findFirst({
    where: and(eq(schema.project.id, projectId), eq(schema.project.ownerId, userId)),
  });
  if (!p) {
    throw notFound();
  }
  return p;
}

/** The project a wizard lands in when the caller names none: the oldest one. */
export async function defaultProject(userId: string): Promise<ProjectRow> {
  const p = await db.query.project.findFirst({
    where: eq(schema.project.ownerId, userId),
    orderBy: [schema.project.createdAt],
  });
  if (!p) {
    throw notFound();
  }
  return p;
}

export async function listProjects(userId: string) {
  const projects = await db.query.project.findMany({
    where: eq(schema.project.ownerId, userId),
    orderBy: [schema.project.createdAt],
  });
  const counts = await db
    .select({ projectId: schema.wizard.projectId, n: count() })
    .from(schema.wizard)
    .where(eq(schema.wizard.ownerId, userId))
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

export async function createProject(userId: string, name: string): Promise<{ id: string }> {
  const id = nanoid(12);
  await db.insert(schema.project).values({ id, ownerId: userId, name, brand: {}, mcpServers: [] });
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
  await db
    .update(schema.project)
    .set({
      ...(patch.name ? { name: patch.name } : {}),
      ...(patch.brand
        ? { brand: { ...p.brand, ...patch.brand, accent: patch.brand.accent || undefined } }
        : {}),
      ...(mcpServers ? { mcpServers } : {}),
      updatedAt: new Date(),
    })
    .where(eq(schema.project.id, p.id));
}

export async function setProjectLogo(userId: string, projectId: string, file: File) {
  const p = await ownedProject(userId, projectId);
  if (!file.type.startsWith("image/") || file.size > 2_000_000) {
    throw new ServiceError("invalid", "Bitte ein Bild bis 2 MB wählen.");
  }
  const ref = await saveAsset({
    ownerId: userId,
    kind: "logo",
    mime: file.type,
    name: file.name,
    data: new Uint8Array(await file.arrayBuffer()),
  });
  await db
    .update(schema.project)
    .set({ brand: { ...p.brand, logoAssetId: ref.id }, updatedAt: new Date() })
    .where(eq(schema.project.id, p.id));
  return { id: ref.id };
}

export async function deleteProject(userId: string, projectId: string) {
  const all = await db.query.project.findMany({ where: eq(schema.project.ownerId, userId) });
  if (all.length <= 1) {
    throw new ServiceError("refused", "Das letzte Projekt bleibt.");
  }
  await db
    .delete(schema.project)
    .where(and(eq(schema.project.id, projectId), eq(schema.project.ownerId, userId)));
}
