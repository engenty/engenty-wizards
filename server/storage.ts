import { mkdirSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { eq } from "drizzle-orm";
import { nanoid } from "nanoid";
import type { AssetRef } from "../shared/run.js";
import { db, schema } from "./db/client.js";
import { env } from "./env.js";

const ASSET_DIR = join(env.dataDir, "assets");
mkdirSync(ASSET_DIR, { recursive: true });

const EXT: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "text/html": "html",
  "text/markdown": "md",
  "text/plain": "txt",
  "application/json": "json",
  "application/pdf": "pdf",
};

export function extFor(mime: string): string {
  return EXT[mime] ?? "bin";
}

export interface SaveAssetInput {
  ownerId: string;
  runId?: string | null;
  stepId?: string | null;
  kind: string;
  mime: string;
  name: string;
  data: Uint8Array | string;
}

export async function saveAsset(input: SaveAssetInput): Promise<AssetRef> {
  const id = nanoid(16);
  const bytes =
    typeof input.data === "string" ? Buffer.from(input.data, "utf8") : Buffer.from(input.data);
  const file = `${id}.${extFor(input.mime)}`;
  await writeFile(join(ASSET_DIR, file), bytes);
  await db.insert(schema.asset).values({
    id,
    ownerId: input.ownerId,
    runId: input.runId ?? null,
    stepId: input.stepId ?? null,
    kind: input.kind,
    mime: input.mime,
    name: input.name,
    path: file,
    size: bytes.byteLength,
  });
  return { id, kind: input.kind, mime: input.mime, name: input.name };
}

export async function loadAsset(id: string) {
  const row = await db.query.asset.findFirst({ where: eq(schema.asset.id, id) });
  if (!row) {
    return null;
  }
  const data = await readFile(join(ASSET_DIR, row.path));
  return { row, data };
}

export async function loadAssetText(id: string): Promise<string> {
  const found = await loadAsset(id);
  return found ? found.data.toString("utf8") : "";
}

/**
 * Generated HTML points at images as `asset://ID`; previews and downloads get them
 * inlined as data URIs, so every file stands on its own. Only the owner's assets resolve.
 */
export async function inlineAssetRefs(html: string, ownerId: string): Promise<string> {
  const ids = [...new Set([...html.matchAll(/asset:\/\/([A-Za-z0-9_-]{6,40})/g)].map((m) => m[1]))];
  let out = html;
  for (const id of ids) {
    const found = await loadAsset(id);
    const uri =
      found && found.row.ownerId === ownerId && found.row.mime.startsWith("image/")
        ? `data:${found.row.mime};base64,${found.data.toString("base64")}`
        : "";
    out = out.split(`asset://${id}`).join(uri);
  }
  return out;
}

/** Deletes every file a run made (uploads, results, renders) and their rows. */
export async function removeAssetFiles(runId: string) {
  const rows = await db.query.asset.findMany({ where: eq(schema.asset.runId, runId) });
  for (const row of rows) {
    await rm(join(ASSET_DIR, row.path), { force: true });
  }
  await db.delete(schema.asset).where(eq(schema.asset.runId, runId));
}
