import { allFields, isAudioValue } from "@engenty-wizards/shared/definition";
import { loadAsset } from "../files/storage.js";
import { transcribeAudio } from "../media/transcribe.js";
import type { StepContext } from "./types.js";

/**
 * Gets the person's answers ready for a step that works on its own: a voice note is listened to
 * once and kept as text with the answer, and a recording or signature that is not this run's own
 * upload is dropped. Runs before every automatic step; what is already done costs nothing.
 */
export async function prepareInputs(ctx: StepContext): Promise<void> {
  const values = ctx.state.values;
  for (const field of allFields(ctx.def)) {
    const value = values[field.id];
    if (field.kind === "signature" && typeof value === "string") {
      const drawn = await loadAsset(value);
      if (drawn?.row.runId !== ctx.runId || !drawn.row.mime.startsWith("image/")) {
        delete values[field.id];
      }
      continue;
    }
    if (field.kind !== "audio" || !isAudioValue(value)) {
      continue;
    }
    if (value.transcript !== undefined) {
      continue;
    }
    const found = await loadAsset(value.asset);
    if (!found || found.row.runId !== ctx.runId || !/^(audio|video)\//.test(found.row.mime)) {
      delete values[field.id];
      continue;
    }
    await ctx.emit("info", { code: "listen", params: { label: field.label } });
    try {
      const transcript = await transcribeAudio({
        bytes: new Uint8Array(found.data),
        mediaType: found.row.mime,
        abortSignal: ctx.signal,
        call: ctx.call,
      });
      await ctx.chargeUsd(transcript.costUsd);
      values[field.id] = { ...value, transcript: transcript.text };
    } catch (err) {
      if (ctx.signal.aborted) {
        throw err;
      }
      // The step goes on without the words; the next one tries again.
      console.error(`[run ${ctx.runId}] transcribe ${field.id}`, err);
      await ctx.emit("info", {
        code: "listenFailed",
        params: { label: field.label },
      });
    }
  }
}
