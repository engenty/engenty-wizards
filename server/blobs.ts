import { createHash } from "node:crypto";
import { existsSync, mkdirSync } from "node:fs";
import { readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { env } from "./env.js";

/** Content-addressed file store for workspaces: a blob never changes, so snapshots are just lists of hashes. */
const BLOB_DIR = join(env.dataDir, "blobs");
mkdirSync(BLOB_DIR, { recursive: true });

const blobPath = (hash: string) => join(BLOB_DIR, hash.slice(0, 2), hash);

export async function putBlob(data: Uint8Array): Promise<string> {
  const hash = createHash("sha256").update(data).digest("hex");
  const path = blobPath(hash);
  if (!existsSync(path)) {
    mkdirSync(join(BLOB_DIR, hash.slice(0, 2)), { recursive: true });
    const tmp = `${path}.${process.pid}.${Date.now()}.tmp`;
    await writeFile(tmp, data);
    await rename(tmp, path);
  }
  return hash;
}

export function getBlob(hash: string): Promise<Buffer> {
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error("bad blob hash");
  }
  return readFile(blobPath(hash));
}
