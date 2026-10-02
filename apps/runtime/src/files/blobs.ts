import { createHash } from "node:crypto";
import { objects } from "./objects.js";

/** Content-addressed file store for workspaces: a blob never changes, so snapshots are just lists of hashes. */
const blobKey = (hash: string) => `blobs/${hash.slice(0, 2)}/${hash}`;

export async function putBlob(data: Uint8Array): Promise<string> {
  const hash = createHash("sha256").update(data).digest("hex");
  const key = blobKey(hash);
  if (!(await objects.has(key))) {
    await objects.put(key, data);
  }
  return hash;
}

export async function getBlob(hash: string): Promise<Buffer> {
  if (!/^[a-f0-9]{64}$/.test(hash)) {
    throw new Error("bad blob hash");
  }
  const data = await objects.get(blobKey(hash));
  if (!data) {
    throw new Error("blob missing");
  }
  return data;
}
