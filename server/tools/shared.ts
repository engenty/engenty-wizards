import type { AssetRef } from "../../shared/run.js";
import type { StepContext } from "../engine/types.js";
import { type StoreScope, writeStoreFile } from "../store/index.js";

export const TEXT_LIMIT = 8000;

export function clip(s: string, limit = TEXT_LIMIT): string {
  return s.length > limit ? `${s.slice(0, limit)}\n…[truncated ${s.length - limit} chars]` : s;
}

/** A tool failure is something the model reads and reacts to, never a crashed step. */
export async function attempt<T>(run: () => Promise<T>): Promise<T | { error: string }> {
  try {
    return await run();
  } catch (err) {
    return { error: String((err as Error)?.message ?? err).slice(0, 400) };
  }
}

/**
 * Files a step collects go two places: the wizard's store (kept for next time) and the step's
 * result (this run's download). One keeper per step, so a file saved twice is one result.
 */
export class FileKeeper {
  private readonly kept = new Map<string, AssetRef>();

  constructor(
    private readonly ctx: StepContext,
    private readonly assets: AssetRef[],
  ) {}

  async keep(
    rawPath: string,
    data: Uint8Array,
    meta: { mime?: string; source?: string },
  ): Promise<{ path: string; mime: string; size: number }> {
    const scope: StoreScope = this.ctx.store;
    const file = await writeStoreFile(scope, rawPath, data, meta);
    if (!this.kept.has(file.path)) {
      const ref = await this.ctx.saveAsset({
        kind: "file",
        mime: file.mime,
        name: file.path.split("/").pop() ?? "file",
        data,
      });
      this.kept.set(file.path, ref);
      this.assets.push(ref);
    }
    return { path: file.path, mime: file.mime, size: file.size };
  }
}
