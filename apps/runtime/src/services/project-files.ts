import {
  PROJECT_LIMITS,
  type ProjectFileKind,
  type ProjectFileView,
  projectFileLimit,
} from "@engenty-wizards/shared/projects";
import { generateText } from "ai";
import { and, asc, count, eq, max } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { documentMime, UnreadableDocument } from "../documents/parse.js";
import { loadAsset, removeAsset, saveAsset } from "../files/storage.js";
import { textModel } from "../models.js";
import { dropLinks, putLink } from "../tenants/control.js";
import { notFound, ServiceError } from "./errors.js";
import { dropIndex, indexDocument } from "./project-index.js";

export type ProjectFileRow = typeof schema.projectFile.$inferSelect;

/** Reading a file takes seconds to a few minutes; a row still `pending` after this was cut off. */
const STALE_MS = 15 * 60_000;

const SEEN_BY_MODEL = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export function fileView(row: ProjectFileRow): ProjectFileView {
  const stale = row.status === "pending" && Date.now() - row.updatedAt.getTime() > STALE_MS;
  return {
    id: row.id,
    kind: row.kind,
    name: row.name,
    mime: row.mime,
    size: row.size,
    description: row.description,
    source: row.source,
    status: stale ? "failed" : row.status,
    error: stale ? "Unterbrochen. Bitte neu einlesen." : row.error,
    indexed: row.indexed,
    pages: row.pages,
    chars: row.chars,
    createdAt: row.createdAt.toISOString(),
  };
}

export function projectFiles(projectId: string, kind?: ProjectFileKind) {
  return db.query.projectFile.findMany({
    where: kind
      ? and(eq(schema.projectFile.projectId, projectId), eq(schema.projectFile.kind, kind))
      : eq(schema.projectFile.projectId, projectId),
    orderBy: [asc(schema.projectFile.position), asc(schema.projectFile.createdAt)],
  });
}

export async function projectFile(projectId: string, fileId: string): Promise<ProjectFileRow> {
  const row = await db.query.projectFile.findFirst({
    where: and(eq(schema.projectFile.id, fileId), eq(schema.projectFile.projectId, projectId)),
  });
  if (!row) {
    throw notFound();
  }
  return row;
}

export async function projectFileContent(projectId: string, fileId: string) {
  const row = await projectFile(projectId, fileId);
  const found = await loadAsset(row.id);
  if (!found) {
    throw notFound();
  }
  return { row, data: found.data };
}

function accepts(kind: ProjectFileKind, mime: string): boolean {
  if (kind === "logo") {
    return mime.startsWith("image/");
  }
  if (kind === "asset") {
    return /^(image|video|audio)\//.test(mime);
  }
  return true;
}

export async function addProjectFile(
  projectId: string,
  input: {
    kind: ProjectFileKind;
    name: string;
    mime: string;
    data: Uint8Array;
    description?: string;
    source?: string;
  },
): Promise<ProjectFileRow> {
  const mime = documentMime(input.name, input.mime) || "application/octet-stream";
  if (!accepts(input.kind, mime)) {
    throw new ServiceError(
      "invalid",
      input.kind === "logo"
        ? "Ein Logo ist ein Bild (PNG, SVG, JPEG, WebP)."
        : "Hierher gehören Bilder, Grafiken, Videos und Audio. Anderes bitte zu den Dokumenten.",
    );
  }
  const limit = projectFileLimit(input.kind, mime);
  if (!input.data.byteLength || input.data.byteLength > limit) {
    throw new ServiceError(
      "invalid",
      `Bitte eine Datei bis ${Math.round(limit / 1_000_000)} MB wählen.`,
    );
  }
  const scope = and(
    eq(schema.projectFile.projectId, projectId),
    eq(schema.projectFile.kind, input.kind),
  );
  const [{ n, last }] = await db
    .select({ n: count(), last: max(schema.projectFile.position) })
    .from(schema.projectFile)
    .where(scope);
  if (n >= PROJECT_LIMITS.files[input.kind]) {
    throw new ServiceError("refused", `Höchstens ${PROJECT_LIMITS.files[input.kind]} Dateien.`);
  }
  const name = input.name.slice(0, 120) || "datei";
  const ref = await saveAsset({
    kind: input.kind === "logo" ? "logo" : "project",
    mime,
    name,
    data: input.data,
  });
  const description = input.description?.trim().slice(0, 600) ?? "";
  const work = input.kind === "document" || (!description && SEEN_BY_MODEL.includes(mime));
  const [row] = await db
    .insert(schema.projectFile)
    .values({
      id: ref.id,
      projectId,
      kind: input.kind,
      name,
      mime,
      size: input.data.byteLength,
      description,
      source: input.source ?? null,
      position: (last ?? -1) + 1,
      status: work ? "pending" : "ready",
    })
    .returning();
  if (input.kind === "logo") {
    // Logos are shown on public pages, where only the control database knows the tenant.
    await putLink(ref.id, "logo", ref.id);
  }
  if (work) {
    void prepare(row);
  }
  return row;
}

// --- reading, describing, indexing -------------------------------------------------

/** Files are worked through two at a time: each costs model calls. */
let running = 0;
const waiting: (() => void)[] = [];

async function slot<T>(run: () => Promise<T>): Promise<T> {
  if (running >= 2) {
    await new Promise<void>((resolve) => waiting.push(resolve));
  }
  running++;
  try {
    return await run();
  } finally {
    running--;
    waiting.shift()?.();
  }
}

async function projectLine(projectId: string): Promise<string> {
  const p = await db.query.project.findFirst({ where: eq(schema.project.id, projectId) });
  return [p?.brand.name || p?.name, p?.brand.about?.slice(0, 300)].filter(Boolean).join(" — ");
}

/** One sentence about a picture, for whoever picks among the project's files later. */
async function describeImage(row: ProjectFileRow, data: Uint8Array): Promise<string> {
  const seer = await textModel("standard");
  const result = await generateText({
    model: seer.model,
    maxOutputTokens: 300,
    system: [
      "You catalogue the files of a project. Describe the picture in ONE sentence of at most 25 words: what it shows, its style and colours, and what it suits (a logo on dark ground, a header image, a team photo, a product shot).",
      "Write in the language of the project's description; if unclear, German. No preamble, no quotes.",
    ].join("\n"),
    messages: [
      {
        role: "user",
        content: [
          { type: "file", data, mediaType: row.mime, filename: row.name },
          {
            type: "text",
            text: `Project: ${await projectLine(row.projectId)}\nFile: ${row.name} (${row.kind})`,
          },
        ],
      },
    ],
  });
  return result.text.trim().slice(0, 600);
}

async function describeDocument(row: ProjectFileRow, text: string): Promise<string> {
  const reader = await textModel("classifier");
  const result = await generateText({
    model: reader.model,
    maxOutputTokens: 300,
    system: [
      "You catalogue the documents of a project. Say in ONE sentence of at most 30 words what this document is and what can be looked up in it.",
      "Write in the document's language. No preamble, no quotes.",
    ].join("\n"),
    prompt: `File: ${row.name}\n\n${text.slice(0, 6000)}`,
  });
  return result.text.trim().slice(0, 600);
}

/** Reads a new file: a document goes into the index, and a file nobody described is described. */
async function prepare(row: ProjectFileRow) {
  await slot(async () => {
    const set = (values: Partial<ProjectFileRow>) =>
      db
        .update(schema.projectFile)
        .set({ ...values, updatedAt: new Date() })
        .where(eq(schema.projectFile.id, row.id));
    try {
      const found = await loadAsset(row.id);
      if (!found) {
        return;
      }
      const data = new Uint8Array(found.data);
      if (row.kind !== "document") {
        const description = await describeImage(row, data).catch(() => "");
        await set({ status: "ready", ...(description ? { description } : {}) });
        return;
      }
      const { text, ...indexed } = await indexDocument(row, data);
      const description =
        row.description || (text ? await describeDocument(row, text).catch(() => "") : "");
      await set({ ...indexed, status: "ready", error: null, description });
    } catch (err) {
      console.error("[project-file]", row.name, err);
      await set({
        status: "failed",
        error:
          err instanceof UnreadableDocument
            ? err.message
            : "Das Lesen hat nicht geklappt. Bitte noch einmal versuchen.",
      });
    }
  });
}

export async function reindexProjectFile(projectId: string, fileId: string) {
  const row = await projectFile(projectId, fileId);
  if (row.kind !== "document") {
    throw new ServiceError("invalid", "Nur Dokumente stehen im Index.");
  }
  const [pending] = await db
    .update(schema.projectFile)
    .set({ status: "pending", error: null, updatedAt: new Date() })
    .where(eq(schema.projectFile.id, row.id))
    .returning();
  void prepare(pending);
  return pending;
}

export async function updateProjectFile(
  projectId: string,
  fileId: string,
  patch: { name?: string; description?: string },
): Promise<ProjectFileRow> {
  const row = await projectFile(projectId, fileId);
  const [updated] = await db
    .update(schema.projectFile)
    .set({
      ...(patch.name?.trim() ? { name: patch.name.trim().slice(0, 120) } : {}),
      ...(patch.description !== undefined
        ? { description: patch.description.trim().slice(0, 600) }
        : {}),
    })
    .where(eq(schema.projectFile.id, row.id))
    .returning();
  return updated;
}

/** Puts the files of one kind into the order of `ids`; the first logo is the one end users see. */
export async function orderProjectFiles(projectId: string, kind: ProjectFileKind, ids: string[]) {
  const rows = await projectFiles(projectId, kind);
  const order = [...ids.filter((id) => rows.some((r) => r.id === id))];
  for (const r of rows) {
    if (!order.includes(r.id)) {
      order.push(r.id);
    }
  }
  for (const [position, id] of order.entries()) {
    await db.update(schema.projectFile).set({ position }).where(eq(schema.projectFile.id, id));
  }
}

async function removeRow(row: ProjectFileRow) {
  await dropIndex(row.id);
  await db.delete(schema.projectFile).where(eq(schema.projectFile.id, row.id));
  await removeAsset(row.id);
  if (row.kind === "logo") {
    await dropLinks([row.id]);
  }
}

export async function removeProjectFile(projectId: string, fileId: string) {
  await removeRow(await projectFile(projectId, fileId));
}

/** Before a project goes: its files leave the object store and the public links. */
export async function removeProjectFiles(projectId: string) {
  for (const row of await projectFiles(projectId)) {
    await removeRow(row);
  }
}
