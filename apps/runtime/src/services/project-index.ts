import type { PluginIndexEntry } from "@engenty-wizards/plugin-sdk";
import type { ProjectSearchHit } from "@engenty-wizards/shared/projects";
import { embedMany } from "ai";
import { and, eq, inArray, type SQL, sql } from "drizzle-orm";
import { db, schema } from "../db/client.js";
import { parseDocument } from "../documents/parse.js";
import { createSearchChunks } from "../engenty/search-index/chunks.js";
import { getBlob, putBlob } from "../files/blobs.js";
import { embeddingModel } from "../models.js";
import { pluginIdsOf } from "../plugins/registry.js";
import { currentTenant } from "../tenants/tenant.js";
import { ServiceError } from "./errors.js";

/**
 * A project's document index. A document is read into Markdown, cut into passages (engenty's
 * chunker) and each passage is kept twice: its words in an FTS5 table, its meaning as a vector
 * where an embedding model is set up. A question is answered from both, merged by rank.
 *
 * Plugins put texts of their own beside the documents (`server.index`): a wiki page, a question
 * and its answer. A search finds them only while the tenant has the plugin.
 */

type FileRow = typeof schema.projectFile.$inferSelect;

const CHUNK = { mode: "paragraph" as const, max_chunk_length: 1200, overlap: 120 };
/** Passages of one document; a longer one keeps its start. */
const MAX_CHUNKS = 2000;

const vectorBytes = (v: readonly number[]) => Buffer.from(new Float32Array(v).buffer);

/** The page marks of the document converter, as a line a reader understands. */
function withPageLines(markdown: string): string {
  return markdown.replace(
    /<page-break number="(\d+)"[^>]*><\/page-break>/g,
    (_m, n: string) => `\n\n[Seite ${n}]\n\n`,
  );
}

async function embed(texts: string[]): Promise<{ vectors: number[][]; model: string } | null> {
  const resolved = await embeddingModel();
  if (!resolved || !texts.length) {
    return null;
  }
  const result = await embedMany({ model: resolved.model, values: texts, maxParallelCalls: 4 });
  return { vectors: result.embeddings.map((e) => Array.from(e)), model: resolved.ref };
}

export async function dropIndex(fileId: string) {
  await db.delete(schema.projectChunk).where(eq(schema.projectChunk.fileId, fileId));
}

/** Reads a document and puts it into the index; what it found goes back onto the file's row. */
export async function indexDocument(file: FileRow, data: Uint8Array) {
  const parsed = await parseDocument({ data, name: file.name, mime: file.mime });
  const text = withPageLines(parsed.markdown).trim();
  const chunks = createSearchChunks({ doc_id: file.id, text, ...CHUNK }).slice(0, MAX_CHUNKS);
  // Without an embedding model, or when it fails, the keywords still find the passage.
  const embedded = await embed(chunks.map((c) => c.text)).catch((err) => {
    console.error("[project-index] embedding failed", err);
    return null;
  });
  await dropIndex(file.id);
  for (let i = 0; i < chunks.length; i += 100) {
    await db.insert(schema.projectChunk).values(
      chunks.slice(i, i + 100).map((c, j) => ({
        projectId: file.projectId,
        fileId: file.id,
        idx: c.chunk_index,
        text: c.text,
        embedding: embedded ? vectorBytes(embedded.vectors[i + j]) : null,
        model: embedded?.model ?? null,
      })),
    );
  }
  return {
    textHash: await putBlob(Buffer.from(text, "utf8")),
    pages: parsed.pages,
    chars: text.length,
    indexed: chunks.length ? (embedded ? ("embeddings" as const) : ("keywords" as const)) : null,
    text,
  };
}

/** Puts a plugin's text into the space's index, in the place of what its key held. */
export async function putIndexEntry(plugin: string, entry: PluginIndexEntry) {
  const space = await db.query.project.findFirst({ where: eq(schema.project.id, entry.space) });
  if (!space) {
    throw new ServiceError("not_found", `There is no space "${entry.space}".`);
  }
  const text = `${entry.title.trim()}\n\n${entry.text.trim()}`;
  const chunks = createSearchChunks({ doc_id: `${plugin}:${entry.key}`, text, ...CHUNK }).slice(
    0,
    MAX_CHUNKS,
  );
  const embedded = await embed(chunks.map((c) => c.text)).catch((err) => {
    console.error("[project-index] embedding failed", err);
    return null;
  });
  await removeIndexEntries(plugin, entry.space, entry.key);
  for (let i = 0; i < chunks.length; i += 100) {
    await db.insert(schema.projectChunk).values(
      chunks.slice(i, i + 100).map((c, j) => ({
        projectId: entry.space,
        plugin,
        ref: entry.key,
        title: entry.title.trim().slice(0, 300),
        link: entry.link ?? null,
        idx: c.chunk_index,
        text: c.text,
        embedding: embedded ? vectorBytes(embedded.vectors[i + j]) : null,
        model: embedded?.model ?? null,
      })),
    );
  }
}

/** Takes a plugin's text out of the space's index; without a key, all of the plugin's texts. */
export async function removeIndexEntries(plugin: string, space: string, key?: string) {
  await db
    .delete(schema.projectChunk)
    .where(
      and(
        eq(schema.projectChunk.projectId, space),
        eq(schema.projectChunk.plugin, plugin),
        key === undefined ? undefined : eq(schema.projectChunk.ref, key),
      ),
    );
}

/** Whether a plugin the tenant has put a text into the space's index. */
export async function hasIndexEntries(projectId: string): Promise<boolean> {
  const plugins = [...(await pluginIdsOf(currentTenant()))];
  if (!plugins.length) {
    return false;
  }
  const found = await db.query.projectChunk.findFirst({
    columns: { id: true },
    where: and(
      eq(schema.projectChunk.projectId, projectId),
      inArray(schema.projectChunk.plugin, plugins),
    ),
  });
  return Boolean(found);
}

export async function documentText(file: FileRow): Promise<string> {
  return file.textHash ? (await getBlob(file.textHash)).toString("utf8") : "";
}

const STOP = new Set(
  "der die das den dem des ein eine einen einem einer und oder aber ist sind war wie was wer wo für von mit auf aus bei zu zum zur im in an am es ich du wir ihr sie nicht auch the a an of to and or is are was for with on at by it this that".split(
    " ",
  ),
);

/** The question's words as an FTS5 query: any of them, also as the start of a longer word. */
function keywordQuery(query: string): string | null {
  const words = [...new Set(query.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu) ?? [])]
    .filter((w) => !STOP.has(w))
    .slice(0, 16);
  return words.length ? words.map((w) => `"${w}"*`).join(" OR ") : null;
}

interface Found {
  id: number;
  file_id: string | null;
  plugin: string | null;
  ref: string | null;
  title: string | null;
  link: string | null;
  idx: number;
  text: string;
}

/** A passage of a document, or of a plugin's text while the tenant has that plugin. */
function searchable(plugins: string[], alias = ""): SQL {
  const column = sql.raw(`${alias}plugin`);
  return plugins.length
    ? sql`(${column} IS NULL OR ${column} IN (${sql.join(
        plugins.map((p) => sql`${p}`),
        sql`, `,
      )}))`
    : sql`${column} IS NULL`;
}

/** The passages of the project's documents, and of the texts its plugins put in, that fit a question best. */
export async function searchProject(
  projectId: string,
  query: string,
  limit = 6,
): Promise<ProjectSearchHit[]> {
  const plugins = [...(await pluginIdsOf(currentTenant()))];
  const lists: Found[][] = [];
  const keywords = keywordQuery(query);
  if (keywords) {
    lists.push(
      await db.all<Found>(sql`
        SELECT c.id, c.file_id, c.plugin, c.ref, c.title, c.link, c.idx, c.text
        FROM project_chunk_fts f JOIN project_chunk c ON c.id = f.rowid
        WHERE project_chunk_fts MATCH ${keywords} AND c.project_id = ${projectId}
          AND ${searchable(plugins, "c.")}
        ORDER BY bm25(project_chunk_fts) LIMIT 24`),
    );
  }
  const embedded = await embed([query]).catch(() => null);
  if (embedded) {
    lists.push(
      await db.all<Found>(sql`
        SELECT id, file_id, plugin, ref, title, link, idx, text
        FROM project_chunk
        WHERE project_id = ${projectId} AND model = ${embedded.model} AND ${searchable(plugins)}
        ORDER BY vector_distance_cos(embedding, ${vectorBytes(embedded.vectors[0])}) LIMIT 24`),
    );
  }
  // Reciprocal rank fusion: a passage both lists rank high comes first.
  const scored = new Map<number, { hit: Found; score: number }>();
  for (const list of lists) {
    list.forEach((hit, rank) => {
      const entry = scored.get(hit.id) ?? { hit, score: 0 };
      entry.score += 1 / (60 + rank);
      scored.set(hit.id, entry);
    });
  }
  const top = [...scored.values()].sort((a, b) => b.score - a.score).slice(0, limit);
  if (!top.length) {
    return [];
  }
  const fileIds = [...new Set(top.map((t) => t.hit.file_id).filter((id) => id !== null))];
  const files = fileIds.length
    ? await db.query.projectFile.findMany({ where: inArray(schema.projectFile.id, fileIds) })
    : [];
  return top.map(({ hit, score }) => ({
    fileId: hit.file_id,
    plugin: hit.plugin,
    name: hit.file_id ? (files.find((f) => f.id === hit.file_id)?.name ?? "") : (hit.title ?? ""),
    link: hit.link,
    index: hit.idx,
    text: hit.text,
    score: Math.round(score * 10_000) / 10_000,
  }));
}
